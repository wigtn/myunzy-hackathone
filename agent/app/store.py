"""인메모리 세션 스토어 (데모 휘발). 이력서=PII → 세션 종료 시 폐기."""
from __future__ import annotations

import secrets
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


@dataclass
class StoredTurn:
    round: int
    speaker: str  # "user" | "ai"
    text: str
    persona_id: Optional[str] = None
    word_timestamps: list[dict] = field(default_factory=list)


@dataclass
class Session:
    session_id: str
    company: str
    role: str
    mode: str
    difficulty: int
    fit_gap: dict
    personas: list[dict]
    active_persona: str
    playbook: str = "general"          # 선택된 스킬 id (FR-005 — 모델 주도 select_skill, 폴백 detect_playbook)
    skill_probes: list[str] = field(default_factory=list)  # 선택된 스킬 본문(progressive disclosure 2단계) — 질문 앵글로 주입
    persona_sequence: list[str] = field(default_factory=lambda: ["tech"])  # 라운드별 면접 단계(페르소나)
    interview_length: int = 3          # = len(persona_sequence). 면접 단계 수 = 라운드 수
    round: int = 1                     # 현재 면접 단계 번호 (1-based)
    followups_in_round: int = 0        # 현재 라운드에서 던진 꼬리질문 수 (0~MAX)
    round_weak_signals: list[str] = field(default_factory=list)  # 현재 라운드 누적 약점 신호
    interview_complete: bool = False   # 모든 메인질문 소진 → 종료 임박
    status: str = "active"             # active | ended
    turns: list[StoredTurn] = field(default_factory=list)
    weakness_profile: dict = field(
        default_factory=lambda: {"patterns": [], "nextFocus": "근거 있는 답변 유도"}
    )
    agent_logs: list[dict] = field(default_factory=list)
    pass_probability: float = 0.4
    resume: dict = field(default_factory=dict)        # OCR 추출 이력서(skills/projects/summary) — 질문 개인화 입력
    opening_question: Optional[str] = None            # 이력서 기반 동적 첫 질문 (없으면 프론트가 persona.openingLine 폴백)
    job_postings: list[dict] = field(default_factory=list)  # 분석한 실제 채용공고(로켓펀치) — UI 증명용 {title,company,url,required,preferred}
    _seq: int = 0


_lock = threading.Lock()
_sessions: dict[str, Session] = {}


def new_id(prefix: str = "sess") -> str:
    return f"{prefix}_{secrets.token_hex(5)}"


def put(s: Session) -> None:
    with _lock:
        _sessions[s.session_id] = s


def get(session_id: str) -> Optional[Session]:
    return _sessions.get(session_id)


def emit(s: Session, step: str, status: str, detail: str | None = None, mock: bool = False) -> dict:
    """작업 로그 방출 (FR-012) — LangGraph 스트리밍 이벤트 analog."""
    s._seq += 1
    entry = {
        "seq": s._seq,
        "ts": datetime.now(timezone.utc).isoformat(),
        "step": step,
        "status": status,
        "detail": detail,
        "mock": mock,
    }
    s.agent_logs.append(entry)
    return entry
