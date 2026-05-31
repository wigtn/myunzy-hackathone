"""§5.1 REST 계약 — pydantic 모델. web BFF가 이 모양 그대로 프록시한다."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel

Mode = Literal["voice", "text"]
PersonaId = Literal["tech", "culture", "exec", "hr"]


class Persona(BaseModel):
    id: PersonaId
    name: str
    persona: str
    openingLine: str


class FitGap(BaseModel):
    attackPoints: list[str]


class AgentLog(BaseModel):
    seq: Optional[int] = None
    ts: Optional[str] = None
    step: str
    status: Literal["run", "done", "retry", "error"]
    detail: Optional[str] = None
    mock: bool = False


class ToolCall(BaseModel):
    name: str
    summary: str
    mock: bool = False


class StateDelta(BaseModel):
    mood: str
    pressure: float
    hiddenAgendaRevealed: bool


class SessionDTO(BaseModel):
    sessionId: str
    company: str
    role: str
    mode: Mode
    fitGap: FitGap
    personas: list[Persona]
    activePersona: PersonaId
    playbook: str = "general"
    interviewLength: int = 3
    round: int
    agentLog: list[AgentLog]
    status: Literal["active", "ended"] = "active"


class UserTurn(BaseModel):
    text: str
    audioRef: Optional[str] = None


class CounterpartTurn(BaseModel):
    personaId: PersonaId
    text: str
    audioUrl: Optional[str] = None
    toolCalls: list[ToolCall] = []
    stateDelta: StateDelta


class TurnResult(BaseModel):
    userTurn: UserTurn
    counterpartTurn: CounterpartTurn
    passProbability: float
    agentLog: list[AgentLog]
    round: int
    isFollowup: bool = False
    followupsInRound: int = 0
    interviewLength: int = 3
    interviewComplete: bool = False
    evolve: Optional[dict] = None  # {before, after, round} — 라운드 전진 시 자가진화 diff


class VerdictScores(BaseModel):
    goalAchieved: float
    evidence: float
    composure: float
    timing: float
    assertiveness: float


class TimingMetrics(BaseModel):
    avgResponseDelaySec: float
    longestPauseSec: float
    wordsPerSec: float
    fillerCount: int


class FrameworkReport(BaseModel):
    name: str
    violations: list[str]


class FitGapReport(BaseModel):
    covered: list[str]
    stillWeak: list[str]


class WeaknessProfile(BaseModel):
    patterns: list[str]
    nextFocus: str


class Moment(BaseModel):
    id: str
    round: int
    atSec: float
    label: str
    quote: str


class Verdict(BaseModel):
    scores: VerdictScores
    timingMetrics: TimingMetrics
    framework: FrameworkReport
    fitGapReport: FitGapReport
    weaknessProfile: WeaknessProfile
    weaknessBefore: Optional[WeaknessProfile] = None
    moments: list[Moment]
    summary: str
    round: int
    status: Literal["active", "ended"] = "ended"


class ReplayTurn(BaseModel):
    speaker: Literal["user", "ai"]
    text: str


class ReplayResult(BaseModel):
    branchTranscript: list[ReplayTurn]
    outcomeDelta: str
    passProbabilityDelta: float


class TurnTextRequest(BaseModel):
    text: str


class ReplayRequest(BaseModel):
    momentId: str
    alternativeUtterance: Optional[str] = None


# 공통 응답 래퍼 (§5.1.4)
def ok(data: Any) -> dict:
    return {"success": True, "data": data}
