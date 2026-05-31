"""면지 에이전트 서비스 — FastAPI. §5.1 REST 계약을 노출. web BFF가 1:1 프록시.

실행: uvicorn app.main:app --port 8000 --reload  (LLM_PROVIDER=mock 기본, 키 0개)
EXAONE 승격: LLM_PROVIDER=exaone (app/llm/exaone.py 구현 후)
"""
from __future__ import annotations

import json
import os
import re

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from . import engine, slots, store
from .contract import ReplayRequest, ok

app = FastAPI(title="면지 Agent Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_UPLOAD = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
MAX_TTS_TEXT = int(os.getenv("MAX_TTS_TEXT", "2000"))  # 무제한 입력이 업스트림 TTS 남용하는 것 차단


def fail(code: str, message: str, status: int):
    from datetime import datetime, timezone

    return JSONResponse(
        status_code=status,
        content={
            "success": False,
            "error": {"code": code, "message": message, "details": []},
            "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
        },
    )


@app.get("/health")
def health():
    return {"ok": True, "llm": os.getenv("LLM_PROVIDER", "mock")}


# ── 동시 면접 대기열 (slots.py) — 동시성 보호 (MAX_CONCURRENT, 기본 10명) ──
@app.post("/api/v1/queue/join")
def queue_join():
    return ok(slots.join())


@app.get("/api/v1/queue/{ticket}")
def queue_poll(ticket: str):
    return ok(slots.poll(ticket))


@app.post("/api/v1/queue/{ticket}/release")
def queue_release(ticket: str):
    return ok(slots.release(ticket))


@app.get("/api/v1/tts")
async def tts(text: str = "", voice: str = ""):
    """면접관 응답 텍스트 → Qwen3-TTS 음성(WAV) 스트리밍 (docs/prd/tts_서비스_명세서.md).

    web BFF가 GET /api/v1/tts?text=...&voice=... 로 프록시. TTS 서버는 HTTP라
    서버사이드(에이전트)에서 대리 호출 → HTTPS 프론트 mixed-content 회피.
    TTS_BASE_URL 미설정/장애 시 503 → 프론트가 브라우저 SpeechSynthesis 폴백.
    """
    base = (os.getenv("TTS_BASE_URL") or "").rstrip("/")
    if not base:
        return fail("UPSTREAM_UNAVAILABLE", "TTS 서버가 설정되지 않았습니다.", 503)
    text = text.strip()
    if not text:
        return fail("INVALID_INPUT", "합성할 텍스트가 필요합니다.", 400)
    if len(text) > MAX_TTS_TEXT:
        return fail("INVALID_INPUT", "합성 텍스트가 너무 깁니다.", 400)

    import httpx

    body = {
        "input": text,
        "voice": voice.strip() or os.getenv("TTS_VOICE", "teacher_female_kr"),
        "language": os.getenv("TTS_LANGUAGE", "Korean"),
        "stream": True,  # 첫 청크 빠르게 → 면접관 응답 체감 지연 감소
        "response_format": "wav",
    }
    timeout = httpx.Timeout(float(os.getenv("TTS_TIMEOUT", "20")), read=60.0)
    client = httpx.AsyncClient(timeout=timeout)
    try:
        req = client.build_request("POST", f"{base}/v1/audio/speech", json=body)
        upstream = await client.send(req, stream=True)
    except Exception:
        await client.aclose()
        return fail("UPSTREAM_UNAVAILABLE", "음성 합성에 실패했습니다.", 503)
    if upstream.status_code != 200:
        await upstream.aclose()
        await client.aclose()
        return fail("UPSTREAM_UNAVAILABLE", f"TTS 합성 실패 (HTTP {upstream.status_code}).", 503)

    async def pump():
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        pump(),
        media_type="audio/wav",
        headers={"cache-control": "private, max-age=3600"},
    )


@app.post("/api/v1/sessions", status_code=201)
async def create_session(
    resume: list[UploadFile] = File(...),  # 멀티 파일 (이력서+자소서 등)
    company: str = Form(...),
    role: str = Form(...),
    mode: str = Form("text"),
    difficulty: int = Form(1),
    jobPostingText: str = Form(""),  # 로켓펀치에 없을 때 직접 붙여넣은 공고
    jobPostingUrls: str = Form(""),  # 사용자가 지정한 로켓펀치 공고 URL(줄/쉼표 구분)
    length: str = Form("standard"),  # 면접 길이 프리셋(폴백): short|standard|deep
    stages: str = Form(""),  # 면접 단계(페르소나) — 쉼표구분 예: "tech,culture,exec". 비면 length 프리셋
):
    if not company.strip() or not role.strip():
        return fail("INVALID_INPUT", "회사명과 직무는 필수입니다.", 400)
    if not resume:
        return fail("INVALID_INPUT", "서류를 한 장 이상 올려주세요.", 400)
    blobs: list[tuple[bytes, str]] = []
    for f in resume:
        data = await f.read()
        if len(data) > MAX_UPLOAD:
            return fail("PAYLOAD_TOO_LARGE", "파일이 너무 큽니다(장당 최대 10MB).", 413)
        blobs.append((data, f.filename or "resume"))
    urls = [u.strip() for u in re.split(r"[\n,]+", jobPostingUrls) if u.strip()]
    # ⚠️ 부트스트랩은 OCR/공고검색/LLM 등 동기 블로킹 I/O → 스레드풀로 오프로드해야
    # 단일 이벤트 루프를 막지 않는다. (인라인 호출 시 한 명의 부트스트랩 동안 다른
    # 동시접속자의 요청이 통째로 대기 → "세션 부팅 중…" 멈춤.)
    s = await run_in_threadpool(
        engine.bootstrap,
        blobs,
        company.strip(),
        role.strip(),
        mode,
        difficulty,
        job_posting_text=jobPostingText.strip() or None,
        length=length,
        job_urls=urls or None,
        stages=[x.strip() for x in stages.split(",") if x.strip()] or None,
    )
    return ok(engine.session_dto(s))


@app.get("/api/v1/sessions/{session_id}")
def get_session(session_id: str):
    s = store.get(session_id)
    if not s:
        return fail("NOT_FOUND", "세션을 찾을 수 없습니다.", 404)
    return ok(engine.session_dto(s))


@app.post("/api/v1/sessions/{session_id}/turns")
async def post_turn(session_id: str, request: Request):
    s = store.get(session_id)
    if not s:
        return fail("NOT_FOUND", "세션을 찾을 수 없습니다.", 404)

    ct = request.headers.get("content-type", "")
    if "multipart/form-data" in ct:
        form = await request.form()
        audio = form.get("audio")
        if audio is None:
            return fail("STT_FAILED", "음성을 인식하지 못했어요. 다시 말씀하거나 텍스트로 입력하세요.", 422)
        # mock STT: 오디오 바이트 대신 캔드 transcript 반환
        from . import ports

        audio_bytes = await audio.read()  # type: ignore[union-attr]
        # 실 STT 장애(업스트림 4xx/5xx, 변환 실패 등)는 422로 graceful — 500 크래시 금지.
        # 프론트는 STT_FAILED 시 "텍스트로 입력하세요" 안내로 폴백.
        try:
            stt = ports.STT.transcribe(audio_bytes)
        except Exception:
            return fail("STT_FAILED", "음성을 인식하지 못했어요. 다시 말씀하거나 텍스트로 입력하세요.", 422)
        if not stt.get("text"):
            return fail("STT_FAILED", "음성을 인식하지 못했어요. 다시 말씀하거나 텍스트로 입력하세요.", 422)
        # 실 STT가 단어 타임스탬프를 주면 얼라이너 합성 대신 사용 (실데이터 분석)
        # process_turn도 동기 블로킹(LLM/TTS) → 스레드풀 오프로드(이벤트 루프 보호).
        return ok(
            await run_in_threadpool(
                engine.process_turn, s, stt["text"], is_voice=True, word_timestamps=stt.get("wordTimestamps")
            )
        )

    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        return fail("INVALID_INPUT", "답변 텍스트가 필요합니다.", 400)
    return ok(await run_in_threadpool(engine.process_turn, s, text, is_voice=False))


@app.post("/api/v1/sessions/{session_id}/turns/stream")
async def post_turn_stream(session_id: str, request: Request):
    """턴 처리 — 면접관 질문을 SSE 토큰 스트리밍(TTFT). /turns 와 동일 입력(텍스트/음성).

    이벤트: data:{type:start|token|reset|done|error}. STT 실패 등 시작 전 오류는 JSON으로 반환
    (클라가 비스트리밍 /turns 로 폴백). 본문 스트림은 web BFF가 forwardStream으로 무버퍼 파이프.
    """
    s = store.get(session_id)
    if not s:
        return fail("NOT_FOUND", "세션을 찾을 수 없습니다.", 404)

    ct = request.headers.get("content-type", "")
    is_voice = False
    word_timestamps = None
    if "multipart/form-data" in ct:
        form = await request.form()
        audio = form.get("audio")
        if audio is None:
            return fail("STT_FAILED", "음성을 인식하지 못했어요. 다시 말씀하거나 텍스트로 입력하세요.", 422)
        from . import ports

        audio_bytes = await audio.read()  # type: ignore[union-attr]
        try:
            stt = ports.STT.transcribe(audio_bytes)
        except Exception:
            return fail("STT_FAILED", "음성을 인식하지 못했어요. 다시 말씀하거나 텍스트로 입력하세요.", 422)
        if not stt.get("text"):
            return fail("STT_FAILED", "음성을 인식하지 못했어요. 다시 말씀하거나 텍스트로 입력하세요.", 422)
        text = stt["text"]
        is_voice = True
        word_timestamps = stt.get("wordTimestamps")
    else:
        body = await request.json()
        text = (body.get("text") or "").strip()
        if not text:
            return fail("INVALID_INPUT", "답변 텍스트가 필요합니다.", 400)

    return StreamingResponse(
        engine.stream_turn(s, text, is_voice=is_voice, word_timestamps=word_timestamps),
        media_type="text/event-stream",
        headers={"cache-control": "no-cache", "x-accel-buffering": "no"},
    )


@app.post("/api/v1/sessions/{session_id}/verdict")
def post_verdict(session_id: str):
    s = store.get(session_id)
    if not s:
        return fail("NOT_FOUND", "세션을 찾을 수 없습니다.", 404)
    return ok(engine.process_verdict(s))


@app.post("/api/v1/sessions/{session_id}/replay")
async def post_replay(session_id: str, body: ReplayRequest):
    s = store.get(session_id)
    if not s:
        return fail("NOT_FOUND", "세션을 찾을 수 없습니다.", 404)
    return ok(engine.process_replay(s, body.momentId, body.alternativeUtterance))


@app.get("/api/v1/sessions/{session_id}/logs")
def get_logs(session_id: str, since: int = 0):
    s = store.get(session_id)
    if not s:
        return fail("NOT_FOUND", "세션을 찾을 수 없습니다.", 404)
    logs = [l for l in s.agent_logs if (l.get("seq") or 0) > since]
    return ok({"logs": logs})
