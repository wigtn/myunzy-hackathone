"""외부 서비스 포트 8종 (PRD §5.0) + mock 어댑터.

mock-first: 명세 도착 전엔 mock, 도착 시 이 파일의 어댑터만 실구현으로 교체.
단 LLM(EXAONE)은 mock-first 비대상 → app/llm/ 에서 별도 처리.
모든 mock 결과는 mock=True 로 로그에 표시(정직성, PRD M-5).
"""
from __future__ import annotations

import os
import re
from typing import Optional, Protocol


def job_id_from_url(url: str) -> Optional[str]:
    """로켓펀치 공고 URL(https://www.rocketpunch.com/jobs/{id})에서 jobId 추출."""
    m = re.search(r"/jobs/(\d+)", url or "")
    return m.group(1) if m else None


# ── 포트 인터페이스 (명세 수신 시 실어댑터로 매핑) ──
class OcrPort(Protocol):
    def parse(self, file_bytes: bytes, filename: str) -> dict: ...


class JobPort(Protocol):
    def search(self, company: str, role: str) -> list[dict]: ...
    def details_by_ids(self, job_ids: list[str]) -> list[dict]: ...


class RankPort(Protocol):
    def reputation(self, company: str) -> dict: ...


class GwPort(Protocol):
    def query(self, api: str, params: dict) -> dict: ...


class SttPort(Protocol):
    def transcribe(self, audio: bytes, lang: str = "ko") -> dict: ...


class AlignPort(Protocol):
    def align(self, audio: bytes, transcript: str) -> list[dict]: ...


class TtsPort(Protocol):
    def synthesize(self, text: str, voice: str = "ko") -> dict: ...


# ── Mock 어댑터 (Tier-B: STT/Align/TTS 명세 TBD / Tier-A도 데모 폴백용) ──
class MockOcr:
    is_mock = True

    def parse(self, file_bytes: bytes, filename: str) -> dict:
        return {
            "sections": ["경력 4년", "백엔드 엔지니어", "커머스 도메인"],
            "skills": ["Java", "Spring", "MySQL", "Kafka", "AWS"],
            "projects": ["주문 정산 시스템 리드", "결제 API 성능 개선"],
            "raw": f"(mock OCR of {filename}, {len(file_bytes)} bytes)",
        }


def _mock_posting(company: str, role: str) -> dict:
    return {
        "title": f"{role or '백엔드 엔지니어'} (예시 공고)",
        "company": company or "예시컴퍼니",
        "url": None,
        "required": ["분산 시스템 운영", "대규모 트래픽", "성능 최적화"],
        "preferred": ["Kafka", "Kubernetes"],
    }


class MockJob:
    is_mock = True

    def search(self, company: str, role: str) -> list[dict]:
        return [_mock_posting(company, role)]

    def details_by_ids(self, job_ids: list[str]) -> list[dict]:
        return [_mock_posting("", "") for _ in (job_ids or [None])][:3]


class MockRank:
    is_mock = True

    def reputation(self, company: str) -> dict:
        return {"company": company, "rankSignal": "업계 상위권", "cultureNote": "성장·자율 강조"}


class MockGw:
    is_mock = True

    def query(self, api: str, params: dict) -> dict:
        return {"api": api, "params": params, "result": "(mock gateway result)"}


class MockStt:
    is_mock = True

    def transcribe(self, audio: bytes, lang: str = "ko") -> dict:
        return {"text": "제가 맡았던 결제 API 성능 개선 프로젝트에서 음… 응답 속도를 꽤 많이 줄였습니다."}


class Qwen3Stt:
    """실 STT — Qwen3 ASR 서비스(/v1/transcribe). docs/prd/stt_서비스_명세서.md §3.4.

    STT 서버는 HTTP → 서버사이드(에이전트)에서 호출해 mixed-content 회피.
    인증은 query param(?api_key=). 응답 timestamps → wordTimestamps 매핑하여
    얼라이너 없이도 실 단어 타임스탬프 확보(머뭇거림/필러 분석 실데이터화).
    """

    is_mock = False

    def __init__(self) -> None:
        self.base = (os.getenv("STT_BASE_URL") or "").rstrip("/")
        self.api_key = os.getenv("STT_API_KEY", "")
        self.hotwords = os.getenv("STT_HOTWORDS", "")  # 쉼표 구분
        if not self.base:
            raise RuntimeError("STT_PROVIDER=qwen3 인데 STT_BASE_URL 미설정")

    @staticmethod
    def _to_wav(audio: bytes) -> tuple[bytes, str, str]:
        """브라우저 녹음(webm/opus 등)을 STT 서버가 받는 16k mono WAV로 변환.

        STT 서버는 WAV/MP3만 수용(webm 업로드는 400). ffmpeg 가 있으면 변환,
        없으면(로컬 등) 원본 그대로 보냄 → 실패 시 상위에서 STT_FAILED 폴백.
        """
        import shutil
        import subprocess

        if not shutil.which("ffmpeg"):
            return audio, "answer.webm", "audio/webm"
        p = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error",
             "-i", "pipe:0", "-ar", "16000", "-ac", "1", "-f", "wav", "pipe:1"],
            input=audio, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15,
        )
        if p.returncode != 0 or not p.stdout:
            raise RuntimeError(f"ffmpeg 변환 실패: {p.stderr[:200]!r}")
        return p.stdout, "answer.wav", "audio/wav"

    def transcribe(self, audio: bytes, lang: str = "ko") -> dict:
        import httpx

        url = f"{self.base}/v1/transcribe"
        params = {"api_key": self.api_key} if self.api_key else None
        # 브라우저 webm/opus → WAV 변환(STT 서버 수용 포맷). ffmpeg 없으면 원본.
        wav, fname, mime = self._to_wav(audio)
        files = {"file": (fname, wav, mime)}
        data = {"language": os.getenv("STT_LANGUAGE", lang), "enable_timestamps": "true"}
        if self.hotwords:
            data["hotwords"] = self.hotwords

        with httpx.Client(timeout=15.0) as client:
            res = client.post(url, params=params, files=files, data=data)
        res.raise_for_status()
        body = res.json()

        # 실 서버 스키마(words/segments, start_time/end_time)와 명세(timestamps, start/end) 모두 허용.
        # 우선순위: words(단어) → timestamps(명세) → segments(구간 폴백).
        src = body.get("words") or body.get("timestamps") or body.get("segments") or []
        word_ts = [
            {
                "word": t.get("word") or t.get("text") or "",
                "start": t.get("start", t.get("start_time", 0.0)),
                "end": t.get("end", t.get("end_time", 0.0)),
            }
            for t in src
        ]
        return {"text": (body.get("text") or "").strip(), "wordTimestamps": word_ts}


class MockAlign:
    """단어 타임스탬프 합성 — 머뭇거림/필러 결정론 생성 (랜덤 금지)."""

    is_mock = True

    def align(self, audio: bytes, transcript: str) -> list[dict]:
        return synth_word_timestamps(transcript, seed=len(transcript) % 7)


class MockTts:
    is_mock = True

    def synthesize(self, text: str, voice: str = "ko") -> dict:
        # 클라가 SpeechSynthesis로 폴백 → audioUrl 없음
        return {"audioUrl": None}


def synth_word_timestamps(text: str, seed: int = 0) -> list[dict]:
    words = [w for w in text.strip().split() if w]
    out: list[dict] = []
    t = 0.3 + (seed % 3) * 0.5
    for i, w in enumerate(words):
        pause = 0.8 + ((seed * 7) % 10) / 10 if (i + seed) % 5 == 0 else 0.05
        t += pause
        dur = 0.18 + len(w) * 0.04
        out.append({"word": w, "start": round(t, 2), "end": round(t + dur, 2)})
        t += dur
    return out


# ── 실 어댑터 (4개 API — 2026-05-31 E2E 실키 검증 완료) ──
_EXT_TIMEOUT = float(os.getenv("EXT_TIMEOUT_SEC", "8"))


class MisoOcr:
    """MISO 이력서 OCR (검증). 2-step: /files/upload → /chat(answer=JSON 문자열).

    base=MISO_BASE_URL(=https://api.miso.gs/ext/v1). 파일은 inputs.resume(top-level files 아님).
    응답 answer를 json.loads → {text, profile} 를 포트 dict로 매핑.
    """

    is_mock = False

    def __init__(self) -> None:
        self.base = (os.getenv("MISO_BASE_URL") or "https://api.miso.gs/ext/v1").rstrip("/")
        self.key = os.getenv("MISO_OCR_KEY") or os.getenv("MISO_OCR_API_KEY", "")
        self.timeout = float(os.getenv("MISO_TIMEOUT_SEC", "20"))
        if not self.key:
            raise RuntimeError("OCR_PROVIDER=miso 인데 MISO_OCR_KEY 미설정")

    def parse(self, file_bytes: bytes, filename: str) -> dict:
        import json

        import httpx

        is_pdf = filename.lower().endswith(".pdf")
        mime = "application/pdf" if is_pdf else "image/png"
        auth = {"Authorization": f"Bearer {self.key}"}
        with httpx.Client(timeout=self.timeout) as c:
            up = c.post(
                f"{self.base}/files/upload",
                headers=auth,
                files={"file": (filename, file_bytes, mime)},
                data={"user": "myeonji-bootstrap"},
            )
            up.raise_for_status()
            fid = up.json()["id"]
            r = c.post(
                f"{self.base}/chat",
                headers={**auth, "Content-Type": "application/json"},
                json={
                    "inputs": {
                        "resume": [
                            {
                                "type": "document" if is_pdf else "image",
                                "transfer_method": "local_file",
                                "upload_file_id": fid,
                            }
                        ]
                    },
                    "query": "이력서 파싱",
                    "mode": "blocking",
                    "conversation_id": "",
                    "user": "myeonji-bootstrap",
                },
            )
            r.raise_for_status()
            answer = r.json().get("answer", "")
        try:
            p = json.loads(answer)
        except Exception:
            p = {"text": answer, "profile": None}
        prof = p.get("profile") or {}
        sections = [
            x
            for x in [
                prof.get("name"),
                prof.get("education"),
                (f"경력 {prof.get('years')}년" if prof.get("years") else None),
            ]
            if x
        ]
        return {
            "sections": sections,
            "skills": prof.get("skills", []) or [],
            # ⚠️ MISO 프로필 스키마엔 projects 필드가 없다(name/years/skills/companies/education/summary).
            #    실제 프로젝트·성과 서술은 summary/text 에만 있으므로 그걸 살려 질문 생성에 흘린다.
            "projects": prof.get("companies", []) or [],  # 회사 경력 (검증 대상 항목)
            "summary": (prof.get("summary") or "").strip(),  # MISO 생성 요약 (프로젝트·성과 포함)
            "raw": p.get("text", "") or answer,
        }


class RocketpunchJob:
    """로켓펀치 채용공고 (검증). keyword 검색 → 상세에서 자격/우대 추출."""

    is_mock = False

    def __init__(self) -> None:
        self.base = (os.getenv("ROCKETPUNCH_BASE_URL") or "https://openapi.rocketpunch.com/api/v1").rstrip("/")
        self.key = os.getenv("ROCKETPUNCH_KEY") or os.getenv("ROCKETPUNCH_API_KEY", "")
        if not self.key:
            raise RuntimeError("JOB_PROVIDER=rocketpunch 인데 ROCKETPUNCH_KEY 미설정")

    @staticmethod
    def _lines(txt: str | None) -> list[str]:
        return [ln.strip("-•· \t") for ln in (txt or "").splitlines() if ln.strip()][:6]

    @staticmethod
    def _to_posting(d: dict) -> dict:
        return {
            "title": d.get("title", ""),
            "company": (d.get("company") or {}).get("name", ""),
            "url": d.get("webUrl"),
            "required": RocketpunchJob._lines(d.get("minimumQualification")),
            "preferred": RocketpunchJob._lines(d.get("preferredQualification")),
        }

    def search(self, company: str, role: str) -> list[dict]:
        import httpx

        h = {"X-OBA-API-Key": self.key, "Accept-Language": "ko"}
        with httpx.Client(timeout=_EXT_TIMEOUT, headers=h) as c:
            res = c.get(f"{self.base}/jobs", params={"keyword": role or company, "pageSize": 3})
            res.raise_for_status()
            items = res.json().get("items", [])
            if not items:
                return []
            d = c.get(f"{self.base}/jobs/{items[0]['jobId']}").json()
        return [self._to_posting(d)]

    def details_by_ids(self, job_ids: list[str]) -> list[dict]:
        """사용자가 지정한 로켓펀치 공고 URL(→jobId)들의 상세를 직접 조회."""
        import httpx

        h = {"X-OBA-API-Key": self.key, "Accept-Language": "ko"}
        out: list[dict] = []
        with httpx.Client(timeout=_EXT_TIMEOUT, headers=h) as c:
            for jid in (job_ids or [])[:5]:
                try:
                    d = c.get(f"{self.base}/jobs/{jid}").json()
                    out.append(self._to_posting(d))
                except Exception:
                    continue
        return out


class GenrankRank:
    """GenRank 회사 AI 평판/가시성 (검증). 무인증."""

    is_mock = False

    def __init__(self) -> None:
        self.base = (os.getenv("GENRANK_BASE") or "https://www.genrank.com/api").rstrip("/")

    def reputation(self, company: str) -> dict:
        import httpx

        with httpx.Client(timeout=_EXT_TIMEOUT) as c:
            s = c.get(f"{self.base}/search", params={"q": company, "limit": 1, "language": "ko"})
            s.raise_for_status()
            ents = s.json().get("entities", [])
            if not ents:
                return {"company": company, "rankSignal": "AI 추천 인덱스 미등록", "cultureNote": ""}
            d = c.get(f"{self.base}/entities/{ents[0]['id']}").json()
        rankings = d.get("rankings") or []
        rank = (rankings[0] if rankings else {}).get("rank")
        return {
            "company": company,
            "rankSignal": f"AI 추천 랭킹 {rank}위" if rank else "AI 가시성 측정됨",
            "cultureNote": ents[0].get("name", company),
        }


class ApiFuseGw:
    """API Fuse 게이트웨이 (검증). POST /v1/{provider}/{operation}."""

    is_mock = False

    def __init__(self) -> None:
        self.base = (os.getenv("APIFUSE_BASE_URL") or "https://api.apifuse.com").rstrip("/")
        self.key = os.getenv("APIFUSE_KEY") or os.getenv("APIFUSE_API_KEY", "")
        if not self.key:
            raise RuntimeError("GW_PROVIDER=apifuse 인데 APIFUSE_KEY 미설정")

    def query(self, api: str, params: dict) -> dict:
        import httpx

        with httpx.Client(timeout=_EXT_TIMEOUT) as c:
            r = c.post(
                f"{self.base}/v1/{api}",
                headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"},
                json=params,
            )
            r.raise_for_status()
            return {"api": api, "result": r.json()}


# 활성 어댑터 (provider env → 실/mock. STT 패턴 동일. 초기화 실패 시 안전 폴백)
def _provider(name: str) -> str:
    return os.getenv(name, "mock").strip().lower()


def _select(env_name: str, want: str, real_cls, mock_cls):
    if _provider(env_name) == want:
        try:
            return real_cls()
        except Exception as e:  # 키 미설정 등 → mock 폴백 (서버 크래시 방지)
            print(f"[ports] {env_name}={want} 초기화 실패 → mock 폴백: {e}")
    return mock_cls()


OCR: OcrPort = _select("OCR_PROVIDER", "miso", MisoOcr, MockOcr)
JOB: JobPort = _select("JOB_PROVIDER", "rocketpunch", RocketpunchJob, MockJob)
RANK: RankPort = _select("RANK_PROVIDER", "genrank", GenrankRank, MockRank)
GW: GwPort = _select("GW_PROVIDER", "apifuse", ApiFuseGw, MockGw)
STT: SttPort = Qwen3Stt() if _provider("STT_PROVIDER") == "qwen3" else MockStt()
ALIGN: AlignPort = MockAlign()
TTS: TtsPort = MockTts()
