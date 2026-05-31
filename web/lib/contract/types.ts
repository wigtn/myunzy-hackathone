// ── §5.1 REST 계약 타입 (PRD §5.1 + 05-DEV-HANDOFF 상태모델) ──
// FE / BFF / (프록시 대상)Python 에이전트 서비스가 공유하는 단일 진실원천.
// ⚠️ PRD 오타 activedPersona → activePersona 로 통일 (Dev Handoff m-2).

export type Mode = "voice" | "text";
export type PersonaId = "tech" | "culture" | "exec" | "hr";

export interface Persona {
  id: PersonaId;
  name: string;
  persona: string;
  openingLine: string;
}

export interface FitGap {
  attackPoints: string[];
}

// 분석한 실제 채용공고(로켓펀치) — UI 가 링크·요구사항으로 '실공고 기반' 증명.
export interface JobPosting {
  title: string;
  company: string;
  url: string | null; // 로켓펀치 공고 링크 (mock/직접입력은 null)
  required: string[];
  preferred: string[];
  mock?: boolean; // true면 예시 데이터(실 API 아님)
}

export type AgentLogStatus = "run" | "done" | "retry" | "error";

export interface AgentLog {
  seq?: number;
  ts?: string;
  step: string; // ocr.parse | job.search | fitgap.analyze | persona.build | harness.validate | tool.* | evolve.diff ...
  status: AgentLogStatus;
  detail?: string;
  mock?: boolean;
}

export interface ToolCall {
  name: string;
  summary: string;
  mock?: boolean;
}

export interface StateDelta {
  mood: string;
  pressure: number; // 0..1
  hiddenAgendaRevealed: boolean;
}

export interface Session {
  sessionId: string;
  company: string;
  role: string;
  mode: Mode;
  fitGap: FitGap;
  personas: Persona[];
  activePersona: PersonaId;
  personaSequence?: PersonaId[]; // 라운드별 면접 단계(페르소나)
  interviewLength?: number; // = personaSequence.length (면접 단계 수)
  round: number;
  agentLog: AgentLog[];
  status?: "active" | "ended";
  openingQuestion?: string | null; // 이력서 기반 동적 첫 질문. 있으면 persona.openingLine 대신 사용.
  jobPostings?: JobPosting[]; // 분석한 실제 채용공고 — UI 증명용.
}

// 동시 면접 대기열 (slots.py) — 동시 활성 면접을 capacity(기본 3)로 제한.
export interface QueueStatus {
  ticket: string;
  state: "active" | "waiting" | "released"; // released = 반환된 슬롯(재admit 안 함)

  position: number; // 대기 순번 (active면 0)
  estimatedWaitSec: number;
  capacity: number;
  activeCount: number;
}

export interface UserTurn {
  text: string;
  audioRef: string | null;
}

export interface CounterpartTurn {
  personaId: PersonaId;
  text: string;
  audioUrl: string | null;
  toolCalls: ToolCall[];
  stateDelta: StateDelta;
}

export interface TurnResult {
  userTurn: UserTurn;
  counterpartTurn: CounterpartTurn;
  passProbability: number; // 0..1
  agentLog: AgentLog[];
  round: number;
}

export interface VerdictScores {
  goalAchieved: number;
  evidence: number;
  composure: number;
  timing: number;
  assertiveness: number;
}

export interface TimingMetrics {
  avgResponseDelaySec: number;
  longestPauseSec: number;
  wordsPerSec: number;
  fillerCount: number;
}

export interface FrameworkReport {
  name: string;
  violations: string[];
}

export interface FitGapReport {
  covered: string[];
  stillWeak: string[];
}

export interface WeaknessProfile {
  patterns: string[];
  nextFocus: string;
}

export interface Moment {
  id: string;
  round: number;
  atSec: number;
  label: string;
  quote: string;
}

export interface Verdict {
  scores: VerdictScores;
  timingMetrics: TimingMetrics;
  framework: FrameworkReport;
  fitGapReport: FitGapReport;
  weaknessProfile: WeaknessProfile;
  weaknessBefore?: WeaknessProfile; // 자가진화 before/after diff 시각화용 (FR-011)
  moments: Moment[];
  summary: string;
  round?: number;
  status?: "active" | "ended"; // 면접 전체 종료 여부 (마지막 라운드 판정 시 "ended")
}

export interface ReplayResult {
  branchTranscript: { speaker: "user" | "ai"; text: string }[];
  outcomeDelta: string;
  passProbabilityDelta: number;
}

// 공통 응답 (§5.1.4)
export type ErrorCode =
  | "INVALID_INPUT"
  | "PAYLOAD_TOO_LARGE"
  | "OCR_FAILED"
  | "STT_FAILED"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "NOT_FOUND"
  | "INTERNAL";

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown[];
}

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = {
  success: false;
  error: ApiError;
  meta: { timestamp: string };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// 클라이언트 보조 타입 (Dev Handoff 상태모델)
export interface Turn {
  speaker: "user" | "ai";
  personaId?: PersonaId;
  text: string;
  audioUrl?: string;
  toolCalls?: ToolCall[];
}

export const ERROR_STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  PAYLOAD_TOO_LARGE: 413,
  OCR_FAILED: 422,
  STT_FAILED: 422,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 503,
  NOT_FOUND: 404,
  INTERNAL: 500,
};
