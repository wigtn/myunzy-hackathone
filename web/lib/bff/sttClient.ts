// 서버전용 STT 클라이언트 — Qwen3 ASR 서비스(/v1/transcribe) 호출.
// STT 서버는 HTTP(<server-host>:12326)이므로 반드시 서버사이드(BFF)에서 호출해
// HTTPS 프론트의 mixed-content 차단을 회피한다. 브라우저에서 직접 import 금지.
// docs/prd/stt_서비스_명세서.md §3.4 계약 매핑.

import { extForMime } from "@/lib/audio";

export type SttResult = {
  text: string;
  wordTimestamps: { word: string; start: number; end: number }[];
};

// STT 미설정이면 undefined → 호출부가 mock 캔드 폴백을 쓰도록 함.
export function sttConfigured(): boolean {
  return Boolean(process.env.STT_BASE_URL);
}

// STT 서버 base URL 정규화 (끝 슬래시 제거).
function baseUrl(): string {
  return (process.env.STT_BASE_URL ?? "").replace(/\/+$/, "");
}

// 음성 Blob → 전사 텍스트 + 단어 타임스탬프.
// 실패 시 STT_FAILED 코드를 단 Error throw (UI가 폴백 토스트 처리).
export async function transcribe(audio: Blob): Promise<SttResult> {
  const base = baseUrl();
  if (!base) throw sttError("STT_FAILED", "STT 서버가 설정되지 않았습니다.");

  const apiKey = process.env.STT_API_KEY ?? "";
  const language = process.env.STT_LANGUAGE ?? "ko";
  const hotwords = process.env.STT_HOTWORDS ?? ""; // 쉼표 구분 (예: "면지,STAR")

  const fd = new FormData();
  // InputBar가 브라우저별 컨테이너(webm/opus 또는 Safari mp4)로 녹음 → 실제 mime로 확장자 결정.
  fd.append("file", audio, `answer.${extForMime(audio.type)}`);
  fd.append("language", language);
  fd.append("enable_timestamps", "true");
  if (hotwords) fd.append("hotwords", hotwords);

  // 인증은 query param(?api_key=) 방식 (명세 §5).
  const url = `${base}/v1/transcribe${apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : ""}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      body: fd,
      // 데모 안정성: 무한 대기 방지 (Final ~3s + 여유).
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw sttError("STT_FAILED", "STT 서버에 연결하지 못했습니다.");
  }

  if (!res.ok) {
    throw sttError("STT_FAILED", `STT 전사 실패 (HTTP ${res.status}).`);
  }

  let json: Record<string, unknown>;
  try {
    json = await res.json();
  } catch {
    throw sttError("STT_FAILED", "STT 응답을 해석하지 못했습니다.");
  }

  const text = String(json.text ?? "").trim();
  if (!text) throw sttError("STT_FAILED", "음성에서 텍스트를 인식하지 못했습니다.");

  // 실 서버 스키마(words/segments, start_time/end_time)와 명세 스키마(timestamps, start/end)를
  // 모두 허용. 우선순위: words(단어) → timestamps(명세) → segments(구간 폴백).
  const wordTimestamps = extractWordTimestamps(json);

  return { text, wordTimestamps };
}

type Raw = Record<string, unknown>;

// 다양한 필드 네이밍을 {word,start,end}로 정규화.
function extractWordTimestamps(json: Raw): { word: string; start: number; end: number }[] {
  const src =
    (Array.isArray(json.words) && json.words.length > 0 && json.words) ||
    (Array.isArray(json.timestamps) && json.timestamps) ||
    (Array.isArray(json.segments) && json.segments) ||
    [];
  return (src as Raw[]).map((t) => ({
    word: String(t.word ?? t.text ?? ""),
    start: Number(t.start ?? t.start_time ?? 0),
    end: Number(t.end ?? t.end_time ?? 0),
  }));
}

function sttError(code: string, message: string): Error & { code: string } {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}
