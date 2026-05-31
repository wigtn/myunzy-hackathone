// 인메모리 세션 스토어 (BFF TS mock 경로 전용 — 데모 휘발).
// 이력서=PII → 세션 종료 시 폐기 (NFR §4.5). 영속 필요 시 Python 서비스/DB로.
import type {
  AgentLog,
  FitGap,
  Persona,
  PersonaId,
  WeaknessProfile,
} from "@/lib/contract/types";

export interface StoredTurn {
  round: number;
  speaker: "user" | "ai";
  personaId?: PersonaId;
  text: string;
  wordTimestamps?: { word: string; start: number; end: number }[];
}

export interface StoredSession {
  sessionId: string;
  company: string;
  role: string;
  mode: "voice" | "text";
  difficulty: number;
  fitGap: FitGap;
  personas: Persona[];
  activePersona: PersonaId;
  personaSequence: PersonaId[]; // 라운드별 면접 단계(페르소나)
  interviewLength: number; // = personaSequence.length
  round: number;
  status: "active" | "ended";
  turns: StoredTurn[];
  weaknessProfile: WeaknessProfile;
  agentLog: AgentLog[];
  passProbability: number;
  createdAt: number;
}

// globalThis 보관 → Next dev HMR 간 유지 (store + logSeq 모두 보존해야 폴링 seq 단조 증가 유지)
const g = globalThis as unknown as {
  __myeonjiStore?: Map<string, StoredSession>;
  __myeonjiLogSeq?: number;
};
const store: Map<string, StoredSession> = g.__myeonjiStore ?? new Map();
g.__myeonjiStore = store;
g.__myeonjiLogSeq ??= 0;

export function putSession(s: StoredSession): void {
  store.set(s.sessionId, s);
}

export function getSession(id: string): StoredSession | undefined {
  return store.get(id);
}

export function appendLog(
  s: StoredSession,
  log: Omit<AgentLog, "seq" | "ts">,
): AgentLog {
  const entry: AgentLog = {
    ...log,
    seq: (g.__myeonjiLogSeq = (g.__myeonjiLogSeq ?? 0) + 1),
    ts: new Date().toISOString(),
  };
  s.agentLog.push(entry);
  return entry;
}

export function newId(prefix = "sess"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
