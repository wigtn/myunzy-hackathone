"""턴 컨트롤러 + 부트스트랩 + verdict + 리플레이.

LangGraph 결정론 컨트롤러 analog (AGENT_ARCHITECTURE.md §3):
  - 턴 루프 = 결정론 tool-calling (저지연·고신뢰)
  - verdict = 순수코드 집계 (LLM 없이, 폴백 경로 먼저 확보)
점수/합격확률은 결정론적 순수함수 — 심사위원이 일관성 확인. 랜덤 금지.
"""
from __future__ import annotations

import os

from . import ports
from .harness import TOOL_SUMMARY, call_with_retry, curate_tools
from .llm import get_llm
from .skills import (
    ATTACK_POINTS,
    FILLER_WORDS,
    HEDGE_WORDS,
    FRAMEWORK,
    LENGTH_PRESETS,
    MAX_FOLLOWUP,
    PERSONAS,
    PLAYBOOKS,
    detect_playbook,
)
from .state import analyze_answer, update_weakness_profile
from .store import Session, StoredTurn, emit, new_id, put


def _clamp01(n: float) -> float:
    return max(0.02, min(0.98, n))


# 면접 단계(페르소나) 시퀀스 해석 — 사용자가 고른 단계 우선, 없으면 length 프리셋.
_VALID_PERSONAS = [p["id"] for p in PERSONAS]  # tech, culture, exec, hr
_DEFAULT_SEQUENCE = {
    "short": ["tech", "exec"],
    "standard": ["tech", "culture", "exec"],
    "deep": ["tech", "culture", "exec", "hr"],
}


def _resolve_sequence(stages: list[str] | None, length: str) -> list[str]:
    seq = [s for s in (stages or []) if s in _VALID_PERSONAS]
    if not seq:
        seq = list(_DEFAULT_SEQUENCE.get(length, _DEFAULT_SEQUENCE["standard"]))
    return seq


# 공고·이력서 어디서도 갭을 못 뽑았을 때의 '역할 중립' 폴백. 특정 직무(백엔드) 색이 없어야
# 비기술직에 "대규모 트래픽" 같은 가짜 전제가 새지 않는다. 이 폴백이 쓰이면 로그에 정직히 표시.
_GENERIC_ATTACK = [
    "이력서의 핵심 성과를 정량 지표(숫자)로 입증할 수 있는가",
    "강점 주장에 구체적 사례(상황·행동·결과)가 뒷받침되는가",
    "지원 직무의 핵심 역량에 대한 직접 경험 근거가 충분한가",
]


# 외부 데이터 소스에 기대는 도구 → 실제 활성 어댑터의 is_mock 반영 (부트스트랩 로그와 일관).
# 나머지(품질평가·플레이북 등)는 순수 결정론 구현이라 mock 아님.
_TOOL_PORT = {"lookup_job_posting": "JOB", "lookup_company_reputation": "RANK"}


def _tool_is_mock(tool_name: str) -> bool:
    port_name = _TOOL_PORT.get(tool_name)
    if port_name is None:
        return False
    return getattr(getattr(ports, port_name), "is_mock", False)


# ── 부트스트랩 (FR-002~005): subagent 병렬 수집 analog ──
def bootstrap(
    files: list[tuple[bytes, str]],
    company: str,
    role: str,
    mode: str,
    difficulty: int,
    job_posting_text: str | None = None,
    length: str = "standard",
    job_urls: list[str] | None = None,
    stages: list[str] | None = None,
) -> Session:
    playbook = detect_playbook(company, role)
    # 면접 단계 = 사용자가 고른 페르소나 시퀀스. 각 단계가 한 라운드(한 면접관). 없으면 length 프리셋.
    sequence = _resolve_sequence(stages, length)
    s = Session(
        session_id=new_id(),
        company=company,
        role=role,
        mode=mode,
        difficulty=max(1, min(3, difficulty)),
        fit_gap={"attackPoints": ATTACK_POINTS},
        personas=PERSONAS,
        active_persona=sequence[0],
        playbook=playbook,
        persona_sequence=sequence,
        interview_length=len(sequence),
    )
    # 격리 컨텍스트 수집 → 작업 로그에 펼쳐지는 게 최강 agentic 시각 신호.
    # 실 어댑터는 네트워크 실패 가능 → 각 호출 graceful: 실패해도 부트스트랩은 폴백으로 완주(PRD §4.2).
    docs = f"서류 {len(files)}장" if len(files) > 1 else "이력서"
    ocr_result: dict | None = None
    for data, filename in files:
        try:
            ocr_result = ports.OCR.parse(data, filename)
        except Exception as e:
            emit(s, "ocr.parse", "error", f"OCR 호출 실패 → 폴백 진행: {e}", mock=False)
            ocr_result = None
    ocr_skills = (ocr_result or {}).get("skills", []) if ocr_result else []
    ocr_projects = (ocr_result or {}).get("projects", []) if ocr_result else []
    ocr_sections = (ocr_result or {}).get("sections", []) if ocr_result else []
    ocr_summary = (ocr_result or {}).get("summary", "") if ocr_result else ""
    # 이력서 내용을 세션에 보존 → 첫 질문·턴별 질문 생성에 실제로 주입(개인화 핵심).
    s.resume = {
        "skills": ocr_skills,
        "projects": ocr_projects,
        "sections": ocr_sections,
        # MISO가 준 풍부한 요약(프로젝트·성과 서술 포함) 우선. 없으면 파편으로 합성(mock/타 어댑터 폴백).
        "summary": ocr_summary or _resume_summary(ocr_sections, ocr_skills, ocr_projects, (ocr_result or {}).get("raw", "")),
    }
    ocr_detail = f"{docs} 파싱" + (f" · 추출 스킬 {', '.join(ocr_skills[:4])}" if ocr_skills else " · 경력·스킬 추출")
    emit(s, "ocr.parse", "done", ocr_detail, mock=getattr(ports.OCR, "is_mock", False))

    # 채용공고 분석 → s.job_postings(UI 증명용 실공고) + attack_points.
    # 우선순위: 사용자 지정 URL > 자동 검색 > 직접 붙여넣은 텍스트 > 이력서 파생.
    attack_points: list[str] = []
    postings: list[dict] = []
    job_mock = getattr(ports.JOB, "is_mock", False)
    if job_urls:
        ids = [j for j in (ports.job_id_from_url(u) for u in job_urls) if j]
        try:
            postings = ports.JOB.details_by_ids(ids) if ids else []
        except Exception as e:
            emit(s, "job.urls", "error", f"지정 공고 조회 실패 → 폴백: {e}", mock=False)
            postings = []
        emit(s, "job.urls", "done", f"사용자 지정 로켓펀치 공고 {len(postings)}건 분석", mock=job_mock)
    elif job_posting_text:
        emit(s, "job.manual", "done", f"사용자 제공 공고 사용 ({len(job_posting_text)}자)", mock=False)
    else:
        # 원래 기획: 부트스트랩 컨텍스트 수집 = DeepAgents 에이전트(subagents+write_todos+wrap_tool_call).
        # HARNESS=deepagents 일 때만 활성(로그 연출). 실패/지연 시 아래 결정론 검색이 데이터 보장.
        collected = _deepagents_collect(s, company, role) if os.getenv("HARNESS") == "deepagents" else None
        try:
            postings = ports.JOB.search(company, role)
        except Exception as e:
            emit(s, "job.search", "error", f"채용공고 조회 실패 → 폴백: {e}", mock=False)
            postings = []
        src = "DeepAgents" if (collected and collected.get("required")) else "검색"
        n = len([r for p in postings for r in (p.get("required") or [])])
        emit(s, "job.search", "done",
             f"{company} {role} 채용공고 수집({src})" + (f" · 요구 {n}항목" if n else ""), mock=job_mock)
    # 출처(mock/real) 플래그를 각 공고에 부착 → UI 가 '실제 공고'/'예시' 배지 표시.
    for p in postings:
        p["mock"] = job_mock
    s.job_postings = postings

    # attack_points: (실)공고 요구사항 > 이력서 파생 > 역할중립 일반(정직 표시).
    # ⚠️ 더 이상 백엔드 색 정적 더미(ATTACK_POINTS)로 폴백하지 않는다 — 가짜 전제 주입 금지.
    req = [r for p in postings for r in (p.get("required") or [])]
    fit_source = "공고"
    if req and not job_mock:
        attack_points = [f"공고 요구 대비 근거 부족: {r}" for r in req[:3]]
    else:
        attack_points = _attack_points_from_resume(ocr_skills, ocr_projects)
        fit_source = "이력서"
        if not attack_points:
            attack_points = list(_GENERIC_ATTACK)
            fit_source = "일반"  # 공고·이력서 근거 없음 → 정직하게 일반 기준
    s.fit_gap = {"attackPoints": attack_points}

    try:
        rep = ports.RANK.reputation(company)
    except Exception as e:
        emit(s, "reputation.lookup", "error", f"평판 조회 실패 → 스킵: {e}", mock=False)
        rep = None
    rep_detail = "회사 평판 신호 수집" + (f" · {rep.get('rankSignal')}" if rep else "")
    emit(s, "reputation.lookup", "done", rep_detail, mock=getattr(ports.RANK, "is_mock", False))

    _name_by_id = {p["id"]: p["name"] for p in PERSONAS}
    stage_names = " → ".join(_name_by_id.get(p, p) for p in sequence)
    emit(s, "fitgap.analyze", "done", f"공격 포인트 {len(attack_points)}개 ({fit_source} 기반)", mock=(fit_source == "일반"))
    emit(s, "playbook.select", "done", f"플레이북={PLAYBOOKS[playbook]['label']} · 면접 단계 {len(sequence)}개")
    emit(s, "persona.build", "done", f"면접 단계 구성: {stage_names}")

    # 첫 질문을 이력서 기반으로 동적 생성 (LLM=EXAONE, 장애 시 mock→페르소나 openingLine 폴백).
    # 이전엔 persona.openingLine 상수가 무조건 나갔다 → 이력서 무관 하드코딩. 그 구멍을 메운다.
    s.opening_question = _generate_opening(s)
    emit(s, "question.opening", "done", "이력서 기반 첫 질문 생성")
    put(s)
    return s


# ── DeepAgents 부트스트랩 수집 (HARNESS=deepagents) — 실패 시 None → 엔진이 결정론 폴백 ──
def _deepagents_collect(s: Session, company: str, role: str) -> dict | None:
    emit(s, "agent.bootstrap", "done", "DeepAgents 컨텍스트 수집 (subagent · write_todos · wrap_tool_call)", mock=False)
    try:
        from .harness_da import run_bootstrap_agent

        return run_bootstrap_agent(company, role, lambda step, status, detail: emit(s, step, status, detail))
    except Exception as e:
        emit(s, "harness.fallback", "retry", f"DeepAgents 수집 실패 → 결정론 폴백: {e}")
        return None


# ── 이력서 → 질문 개인화 헬퍼 ──
def _resume_summary(sections: list, skills: list, projects: list, raw: str) -> str:
    """LLM 프롬프트에 넣을 짧은 이력서 요약 한 줄. raw 전문은 토큰 과다 → 핵심만."""
    parts: list[str] = []
    if sections:
        parts.append(" · ".join(str(x) for x in sections[:3]))
    if skills:
        parts.append("스킬: " + ", ".join(str(x) for x in skills[:8]))
    if projects:
        parts.append("경력/프로젝트: " + ", ".join(str(x) for x in projects[:5]))
    summary = " / ".join(parts)
    if not summary and raw:
        summary = raw.strip().replace("\n", " ")[:300]
    return summary


def _attack_points_from_resume(skills: list, projects: list) -> list[str]:
    """실 공고가 없을 때, 이력서에 기재된 항목 자체를 검증 대상(공략 포인트)으로 전환."""
    pts: list[str] = []
    for proj in (projects or [])[:2]:
        pts.append(f"이력서 기재 '{proj}'에서 본인 기여와 정량 성과가 분리·입증되는가")
    for skill in (skills or [])[:2]:
        pts.append(f"'{skill}' 보유를 실제 깊이로 증명할 정량·경험 근거가 있는가")
    return pts[:3]


def _generate_opening(s: Session) -> str:
    """이력서·페르소나·공략포인트로 첫 질문 생성. 실패 시 페르소나 openingLine 폴백."""
    persona = next((p for p in PERSONAS if p["id"] == s.active_persona), PERSONAS[0])
    ctx = {
        "opening": True,
        "persona": s.active_persona,
        "round": 1,
        "turn_idx": 0,
        "company": s.company,
        "role": s.role,
        "resume_summary": s.resume.get("summary", ""),
        "resume_skills": s.resume.get("skills", []),
        "resume_projects": s.resume.get("projects", []),
        "attack_points": s.fit_gap.get("attackPoints", []),
    }
    try:
        res = get_llm().chat([ctx], curate_tools(persona["tools"]))
        q = (res.text or "").strip()
    except Exception:
        q = ""
    return q or persona["openingLine"]


def session_dto(s: Session) -> dict:
    return {
        "sessionId": s.session_id,
        "company": s.company,
        "role": s.role,
        "mode": s.mode,
        "fitGap": s.fit_gap,
        "personas": s.personas,
        "activePersona": s.active_persona,
        "playbook": s.playbook,
        "personaSequence": s.persona_sequence,
        "interviewLength": s.interview_length,
        "round": s.round,
        "agentLog": s.agent_logs,
        "status": s.status,
        # 이력서 기반 동적 첫 질문 — 프론트는 이게 있으면 persona.openingLine 대신 사용.
        "openingQuestion": s.opening_question,
        # 분석한 실제 채용공고(로켓펀치) — UI 가 링크·요구사항으로 '실공고 기반' 증명.
        "jobPostings": s.job_postings,
    }


# ── 턴 처리 (FR-008~010, 015, 017) ──
def process_turn(
    s: Session,
    user_text: str,
    is_voice: bool,
    word_timestamps: list[dict] | None = None,
) -> dict:
    llm = get_llm()
    turn_idx = sum(1 for t in s.turns if t.speaker == "user")
    logs_before = len(s.agent_logs)

    def on_log(step: str, status: str, detail):
        emit(s, step, status, detail)

    # 페르소나 로테이션: R1 tech, R2+ exec (압박↑)
    # 면접 단계 = 라운드별로 정해진 페르소나(사용자가 고른 시퀀스). 임의 전환 없음.
    seq = s.persona_sequence or ["tech"]
    persona_id = seq[min(s.round - 1, len(seq) - 1)]
    s.active_persona = persona_id
    persona = next(p for p in PERSONAS if p["id"] == persona_id)

    # 사용자 턴 저장. 실 STT 타임스탬프가 있으면 사용, 없으면 얼라이너로 합성.
    ts = word_timestamps if word_timestamps else ports.ALIGN.align(b"", user_text)
    s.turns.append(StoredTurn(round=s.round, speaker="user", text=user_text, word_timestamps=ts))

    # 약점 신호 분석 → 라운드 누적 (verdict의 자가진화 입력) + 꼬리질문 게이팅 (FR-009)
    signals = analyze_answer(user_text)
    s.round_weak_signals.extend(signals)
    is_followup = bool(signals) and s.followups_in_round < MAX_FOLLOWUP
    if is_followup:
        s.followups_in_round += 1
        emit(s, "followup.fire", "done", f"약점 신호({signals[0]}) 포착 → 꼬리질문 {s.followups_in_round}/{MAX_FOLLOWUP}")

    # 라이브 툴콜 (단일 턴 = 단일 도구, 큐레이션). 짝수 턴=페르소나 고유 컨텍스트 도구,
    # 홀수 턴=답변 품질 평가. ⚠️ 반드시 '이 페르소나가 가진 도구'에서만 고른다
    # (예: 컬처핏/HR 면접관은 lookup_job_posting 이 없음 → 호출하면 큐레이션 위반).
    tools = curate_tools(persona["tools"])
    context_tool = next((t for t in persona["tools"] if t.startswith("lookup")), "check_answer_quality")
    tool_name = context_tool if turn_idx % 2 == 0 else "check_answer_quality"
    _TOOL_ARGS = {
        "lookup_job_posting": {"company": s.company, "role": s.role},
        "lookup_company_reputation": {"company": s.company},
        "lookup_playbook": {"framework": FRAMEWORK["name"]},
        "check_answer_quality": {"user_utterance": user_text, "framework": FRAMEWORK["name"]},
    }
    tool_args = _TOOL_ARGS.get(tool_name, {"user_utterance": user_text, "framework": FRAMEWORK["name"]})
    call_with_retry(
        llm,
        [{"persona": persona_id, "round": s.round, "turn_idx": turn_idx, "want_tool": tool_name, "tool_args": tool_args}],
        tools,
        on_log,
    )
    emit(s, f"tool.{tool_name}", "done", TOOL_SUMMARY.get(tool_name), mock=_tool_is_mock(tool_name))

    # 닫힌 루프(FR-011): R2+는 직전 라운드 약점(weakness_profile.kind)을 질문 생성에 주입.
    #   verdict에서 갱신 후 round++ 했으므로, R2 시점 s.weakness_profile은 R1 측정 결과를 담고 있다.
    carried_kind = s.weakness_profile.get("kind") if s.round >= 2 else None
    if carried_kind:
        emit(
            s,
            "evolve.adapt",
            "done",
            f"R{s.round} 자가진화 적용: 직전 약점({carried_kind}) 공략 질문 생성 · 전략={s.weakness_profile.get('nextFocus')}",
        )

    # 면접관 다음 질문 (LLM — mock이면 캔드). 컨텍스트에 약점/전략 주입 → 실 EXAONE도 이걸 받아 적응.
    q_res = call_with_retry(
        llm,
        [{
            "persona": persona_id,
            "round": s.round,
            "turn_idx": turn_idx,
            "weakness_kind": carried_kind,  # 자가진화 입력 (PRD FR-011)
            "next_focus": s.weakness_profile.get("nextFocus"),
            # 실 LLM(GPT/EXAONE)이 동적 질문 생성에 쓰는 재료 (mock은 무시)
            "company": s.company,
            "role": s.role,
            "user_answer": user_text,
            "attack_points": s.fit_gap.get("attackPoints", []),
            # 이력서 주입(개인화): 꼬리질문도 '이 지원자' 이력서 근거로 파고들도록.
            "resume_summary": s.resume.get("summary", ""),
            "resume_skills": s.resume.get("skills", []),
            "resume_projects": s.resume.get("projects", []),
        }],
        tools,
        on_log,
    )
    question = q_res.text or "조금 더 구체적으로 말씀해 주세요."
    s.turns.append(StoredTurn(round=s.round, speaker="ai", text=question, persona_id=persona_id))

    # stateDelta: 난이도/라운드에 따라 pressure 상승 (에스컬레이션 FR-017)
    pressure = _clamp01(0.35 + 0.12 * s.difficulty + 0.15 * (s.round - 1) + 0.05 * turn_idx)
    state_delta = {
        "mood": "냉정·압박" if pressure > 0.7 else "회의적" if pressure > 0.5 else "탐색적",
        "pressure": round(pressure, 2),
        "hiddenAgendaRevealed": s.round >= 2 and turn_idx >= 1,
    }

    s.pass_probability = _pass_probability(s)
    new_logs = s.agent_logs[logs_before:]
    put(s)

    audio_url = ports.TTS.synthesize(question)["audioUrl"] if is_voice else None
    return {
        "userTurn": {"text": user_text, "audioRef": f"audio_{turn_idx}" if is_voice else None},
        "counterpartTurn": {
            "personaId": persona_id,
            "text": question,
            "audioUrl": audio_url,
            "toolCalls": [
                {"name": tool_name, "summary": TOOL_SUMMARY.get(tool_name, tool_name), "mock": _tool_is_mock(tool_name)}
            ],
            "stateDelta": state_delta,
        },
        "passProbability": s.pass_probability,
        "agentLog": new_logs,
        "round": s.round,
        "isFollowup": is_followup,
        "followupsInRound": s.followups_in_round,
        "interviewLength": s.interview_length,
        "interviewComplete": s.round >= s.interview_length,
        # 닫힌 루프 추적(FR-011): 이 R2+ 질문이 R(n-1) 약점에 매핑됐음을 UI가 보이게
        "evolve": (
            {
                "round": s.round,
                "kind": carried_kind,
                "fromWeakness": s.weakness_profile.get("patterns", []),
                "strategy": s.weakness_profile.get("nextFocus"),
                "note": f"이 질문은 R{s.round - 1}에서 측정된 약점({carried_kind})을 공략합니다.",
            }
            if carried_kind
            else None
        ),
    }


def _pass_probability(s: Session) -> float:
    user_turns = [t for t in s.turns if t.speaker == "user"]
    if not user_turns:
        return 0.4
    # 답변 '품질'이 곧 합격확률 — 엉망이면 확실히 바닥, 좋으면 높게 (반응성↑).
    total = 0.0
    for t in user_turns:
        txt = t.text
        q = 0.5
        q += 0.25 if any(c.isdigit() for c in txt) else -0.18  # 정량 근거
        n = len(txt)
        q += 0.1 if n >= 60 else (-0.2 if n < 25 else 0.0)     # 답변 분량(너무 짧으면 큰 감점)
        if any(f in txt for f in FILLER_WORDS):
            q -= 0.15  # 머뭇거림(필러)
        if any(h in txt for h in HEDGE_WORDS):
            q -= 0.15  # 모호·회피(보통·그냥·아마)
        if any(k in txt for k in ("상황", "결과", "그래서", "결국", "때문", "위해")):
            q += 0.1  # 구조·인과(STAR 신호)
        total += max(0.0, min(1.0, q))
    avg = total / len(user_turns)
    return _clamp01(avg - 0.05 * (s.difficulty - 1))


# ── verdict (FR-013~014): 순수코드 집계 + 자가진화 ──
def process_verdict(s: Session) -> dict:
    emit(s, "align.process", "done", "단어 타임스탬프 후처리", mock=getattr(ports.ALIGN, "is_mock", False))
    user_turns = [t for t in s.turns if t.speaker == "user" and t.round == s.round]
    timing = _timing_metrics(user_turns)
    all_text = " ".join(t.text for t in user_turns)
    scores = _scores(s, all_text, timing)

    violations: list[str] = []
    if not any(k in all_text for k in ("상황", "당시", "그때")):
        violations.append("STAR: Situation(상황) 맥락 누락")
    if not any(c.isdigit() for c in all_text):
        violations.append("정량 성과 미제시")
    if len(all_text) < 80:
        violations.append("답변 근거량 부족")

    before = {"patterns": list(s.weakness_profile["patterns"]), "nextFocus": s.weakness_profile["nextFocus"]}
    # process_turn이 라운드 내내 누적한 약점 신호 → 프로파일 (자가진화 입력)
    s.weakness_profile = update_weakness_profile(s.round_weak_signals, all_text, timing)
    emit(s, "evolve.diff", "done", f"R{s.round} 약점={','.join(s.weakness_profile['patterns'])} → {s.weakness_profile['nextFocus']}")

    moments = _moments(user_turns, s.round)
    summary = f"R{s.round}: {s.weakness_profile['patterns'][0]} 신호가 두드러짐. {s.weakness_profile['nextFocus']}."
    verdict_round = s.round

    # 면접 종료 판정: 마지막 메인질문이면 종료, 아니면 다음 라운드로 진화
    s.interview_complete = verdict_round >= s.interview_length
    if s.interview_complete:
        s.status = "ended"
    else:
        s.round += 1
        s.followups_in_round = 0
        s.round_weak_signals = []  # 라운드별 신호 리셋
        # 다음 라운드의 면접 단계(페르소나)로 전환 → getSession/UI 가 올바른 단계를 표시.
        if s.round - 1 < len(s.persona_sequence):
            s.active_persona = s.persona_sequence[s.round - 1]
    put(s)

    return {
        "scores": scores,
        "timingMetrics": timing,
        "framework": {"name": FRAMEWORK["name"], "violations": violations},
        "fitGapReport": {
            "covered": ["기본 기술 스택 매칭", "직무 도메인 경험"],
            "stillWeak": s.fit_gap["attackPoints"][:2],
        },
        "weaknessProfile": s.weakness_profile,
        "weaknessBefore": before,
        "moments": moments,
        "summary": summary,
        "round": verdict_round,
        "status": "ended" if s.interview_complete else "active",
    }


def _timing_metrics(turns: list[StoredTurn]) -> dict:
    ts = [w for t in turns for w in t.word_timestamps]
    if not ts:
        return {"avgResponseDelaySec": 0.0, "longestPauseSec": 0.0, "wordsPerSec": 0.0, "fillerCount": 0}
    longest, delay_sum = 0.0, 0.0
    for t in turns:
        w = t.word_timestamps
        if w:
            delay_sum += w[0]["start"]
        for i in range(1, len(w)):
            longest = max(longest, w[i]["start"] - w[i - 1]["end"])
    total_dur = max(1e-6, ts[-1]["end"] - ts[0]["start"])
    fillers = sum(1 for t in turns for word in t.text.split() if word in FILLER_WORDS)
    return {
        "avgResponseDelaySec": round(delay_sum / len(turns), 2),
        "longestPauseSec": round(longest, 2),
        "wordsPerSec": round(len(ts) / total_dur, 2),
        "fillerCount": fillers,
    }


def _scores(s: Session, all_text: str, timing: dict) -> dict:
    has_num = any(c.isdigit() for c in all_text)
    evidence = _clamp01(0.4 + (0.3 if has_num else 0) + min(0.2, len(all_text) / 1000))
    timing_score = _clamp01(0.8 - timing["longestPauseSec"] * 0.08 - timing["fillerCount"] * 0.03)
    composure = _clamp01(0.7 - timing["fillerCount"] * 0.04)
    goal = _clamp01((evidence + s.pass_probability) / 2)
    assertiveness = _clamp01(0.5 + (0.2 if "제가" in all_text else -0.05))
    return {
        "goalAchieved": round(goal, 2),
        "evidence": round(evidence, 2),
        "composure": round(composure, 2),
        "timing": round(timing_score, 2),
        "assertiveness": round(assertiveness, 2),
    }


def _moments(turns: list[StoredTurn], rnd: int) -> list[dict]:
    out: list[dict] = []
    for idx, t in enumerate(turns):
        w = t.word_timestamps
        max_pause, at_sec = 0.0, (w[0]["start"] if w else 0.0)
        for i in range(1, len(w)):
            p = w[i]["start"] - w[i - 1]["end"]
            if p > max_pause:
                max_pause, at_sec = p, w[i - 1]["end"]
        if max_pause >= 0.8 or idx == 0:
            out.append({
                "id": f"m_{rnd}_{idx}",
                "round": rnd,
                "atSec": round(at_sec, 2),
                "label": "머뭇거림 후 응답" if max_pause >= 0.8 else "핵심 답변",
                "quote": t.text[:40] + ("…" if len(t.text) > 40 else ""),
            })
    return out


# ── 분기 리플레이 (FR-016): 순수코드 폴백 ──
def process_replay(s: Session, moment_id: str, alternative: str | None) -> dict:
    alt = alternative or "당시 주문 정산 시스템에서 일 200만 건을 처리했고, 인덱스 재설계로 p99 레이턴시를 1.8초에서 320ms로 82% 줄였습니다."
    better = any(c.isdigit() for c in alt) and len(alt) >= 40
    delta = 0.18 if better else -0.05
    s.pass_probability = _clamp01(s.pass_probability + delta)
    put(s)
    return {
        "branchTranscript": [
            {"speaker": "user", "text": alt},
            {
                "speaker": "ai",
                "text": "좋습니다. 그 수치라면 설득력이 다릅니다. 그럼 그 재설계에서 가장 위험했던 결정은 뭐였죠?"
                if better
                else "여전히 근거가 약하네요. 숫자로 말씀해 주셔야 합니다.",
            },
        ],
        "outcomeDelta": "정량 근거를 제시하자 면접관이 압박을 풀고 심화 질문으로 전환 — 합격확률 상승."
        if better
        else "근거 보강이 부족해 동일한 압박이 반복됨.",
        "passProbabilityDelta": round(delta, 2),
    }
