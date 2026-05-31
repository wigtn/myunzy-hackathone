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

// ── 턴 스트리밍(TTFT) — 면접관 질문을 토큰 단위로 받는다 (SSE) ──
export type TurnStreamHandlers = {
  // start: 사용자 텍스트(STT 결과 포함)와 응답할 면접관 id를 먼저 받는다(UI 자리 선점).
  onStart?: (userText: string, personaId?: string) => void;
  onToken: (delta: string) => void; // 질문 토큰 델타 (누적 append)
  onReset?: () => void; // 스트림 도중 폴백 → 지금까지 받은 질문 토큰 폐기
  onDone: (result: TurnResult) => void; // 전체 TurnResult(상태/로그/오디오 포함)
};

// 스트리밍 턴 전송. 실패(비프록시·STT오류 등) 시 throw → 호출부가 비스트리밍 폴백.
// STT 실패는 err.code="STT_FAILED" 로 전달(토스트 분기용).
export async function postTurnStream(
  id: string,
  payload: { text?: string; audio?: Blob },
  h: TurnStreamHandlers,
): Promise<void> {
  let res: Response;
  if (payload.audio) {
    const form = new FormData();
    form.append("audio", payload.audio, `turn.${extForMime(payload.audio.type)}`);
    res = await fetch(`/api/v1/sessions/${id}/turns/stream`, { method: "POST", body: form });
  } else {
    res = await fetch(`/api/v1/sessions/${id}/turns/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: payload.text ?? "" }),
    });
  }
  // 시작 전 오류(JSON)면 코드 보존해 throw → 폴백/토스트 분기.
  if (!res.ok || !res.body) {
    let code: string | undefined;
    let message = `스트리밍 응답 오류 (${res.status})`;
    try {
      const j = (await res.json()) as ApiResponse<unknown>;
      if (!j.success) {
        code = j.error.code;
        message = j.error.message;
      }
    } catch {
      /* SSE/빈 본문 — 기본 메시지 유지 */
    }
    const err = new Error(message) as Error & { code?: string };
    err.code = code;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    outer: for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // SSE 이벤트 경계는 빈 줄(\n\n).
      let sep: number;
      while ((sep = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        let evt: { type: string; t?: string; userText?: string; personaId?: string; result?: TurnResult; message?: string };
        try {
          evt = JSON.parse(dataLine.slice(5).trim());
        } catch {
          continue;
        }
        if (evt.type === "start") h.onStart?.(evt.userText ?? "", evt.personaId);
        else if (evt.type === "token") h.onToken(evt.t ?? "");
        else if (evt.type === "reset") h.onReset?.();
        else if (evt.type === "done" && evt.result) {
          h.onDone(evt.result);
          break outer; // 완료 → 즉시 스트림 종료(불필요한 read 방지)
        } else if (evt.type === "error") {
          // 서버가 이미 턴 처리를 시작한 뒤 실패 → 비스트리밍 재실행 시 중복 턴 발생.
          // STREAM_ERROR 코드로 표시해 호출부가 폴백하지 않도록 한다.
          const err = new Error(evt.message || "스트리밍 오류") as Error & { code?: string };
          err.code = "STREAM_ERROR";
          throw err;
        }
      }
    }
  } finally {
    // 정상/예외 모두 업스트림 스트림을 즉시 해제 (BFF·agent 연결 회수).
    reader.cancel().catch(() => {});
  }
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
