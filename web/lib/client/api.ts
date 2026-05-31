// 프론트엔드 → BFF(§5.1) fetch 래퍼. 모든 화면이 이 모듈만 호출.
import { extForMime } from "@/lib/audio";
import type {
  AgentLog,
  ApiResponse,
  QueueStatus,
  ReplayResult,
  Session,
  TurnResult,
  Verdict,
} from "@/lib/contract/types";

async function unwrap<T>(res: Response): Promise<T> {
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    const err = new Error(json.error.message) as Error & { code?: string };
    err.code = json.error.code;
    throw err;
  }
  return json.data;
}

// ── 동시 면접 대기열 ──
export async function joinQueue(): Promise<QueueStatus> {
  const res = await fetch("/api/v1/queue/join", { method: "POST" });
  return unwrap<QueueStatus>(res);
}

export async function pollQueue(ticket: string): Promise<QueueStatus> {
  const res = await fetch(`/api/v1/queue/${ticket}`);
  return unwrap<QueueStatus>(res);
}

export async function releaseSlot(ticket: string): Promise<void> {
  // 면접 종료/이탈 시 슬롯 반환. 페이지 언로드 중에도 가도록 keepalive.
  try {
    await fetch(`/api/v1/queue/${ticket}/release`, { method: "POST", keepalive: true });
  } catch {
    /* best-effort */
  }
}

export async function createSession(form: FormData): Promise<Session> {
  const res = await fetch("/api/v1/sessions", { method: "POST", body: form });
  return unwrap<Session>(res);
}

export async function getSession(id: string): Promise<Session> {
  const res = await fetch(`/api/v1/sessions/${id}`);
  return unwrap<Session>(res);
}

export async function postTurnText(id: string, text: string): Promise<TurnResult> {
  const res = await fetch(`/api/v1/sessions/${id}/turns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return unwrap<TurnResult>(res);
}

export async function postTurnVoice(id: string, audio: Blob): Promise<TurnResult> {
  const form = new FormData();
  // 파일 확장자를 실제 mime에 맞춤 (Safari mp4 등) → STT 서버 디코더 호환.
  form.append("audio", audio, `turn.${extForMime(audio.type)}`);
  const res = await fetch(`/api/v1/sessions/${id}/turns`, { method: "POST", body: form });
  return unwrap<TurnResult>(res);
}

export async function postVerdict(id: string): Promise<Verdict> {
  const res = await fetch(`/api/v1/sessions/${id}/verdict`, { method: "POST" });
  return unwrap<Verdict>(res);
}

export async function postReplay(
  id: string,
  momentId: string,
  alternativeUtterance?: string,
): Promise<ReplayResult> {
  const res = await fetch(`/api/v1/sessions/${id}/replay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ momentId, alternativeUtterance }),
  });
  return unwrap<ReplayResult>(res);
}

export async function fetchLogs(id: string, since: number): Promise<AgentLog[]> {
  const res = await fetch(`/api/v1/sessions/${id}/logs?since=${since}`);
  const data = await unwrap<{ logs: AgentLog[] }>(res);
  return data.logs;
}
