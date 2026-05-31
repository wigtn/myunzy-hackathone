// 서버전용 TTS 클라이언트 — Qwen3-TTS 서비스(/v1/audio/speech) 호출.
// TTS 서버는 HTTP(<server-host>:12337)이므로 반드시 서버사이드(BFF)에서 호출해
// HTTPS 프론트의 mixed-content 차단을 회피한다. 브라우저에서 직접 import 금지.
// docs/prd/tts_서비스_명세서.md 계약 매핑 (응답: audio/wav, 24kHz mono 16-bit).

// TTS 미설정이면 false → 호출부가 클라 SpeechSynthesis 폴백을 쓰도록 함.
export function ttsConfigured(): boolean {
  return Boolean(process.env.TTS_BASE_URL);
}

// TTS 서버 base URL 정규화 (끝 슬래시 제거).
function baseUrl(): string {
  return (process.env.TTS_BASE_URL ?? "").replace(/\/+$/, "");
}

// 합성 보이스 ID. 미지정 시 안내용 teacher 보이스. 보이스 ID가 한글일 수 있어 JSON UTF-8로 전송.
function defaultVoice(): string {
  return process.env.TTS_VOICE ?? "teacher_female_kr";
}

// 텍스트 → 음성 합성. 업스트림 WAV 응답(Response)을 그대로 반환해 라우트가 스트리밍 파이프하게 한다.
// 실패 시 TTS_FAILED 코드를 단 Error throw (라우트가 JSON 폴백 응답으로 변환).
export async function synthesize(text: string, voice?: string): Promise<Response> {
  const base = baseUrl();
  if (!base) throw ttsError("TTS_FAILED", "TTS 서버가 설정되지 않았습니다.");

  const input = text.trim();
  if (!input) throw ttsError("TTS_FAILED", "합성할 텍스트가 없습니다.");

  const language = process.env.TTS_LANGUAGE ?? "Korean";

  let res: Response;
  try {
    res = await fetch(`${base}/v1/audio/speech`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // 스트리밍 권장(stream:true) — 첫 청크 빠르게 도착해 면접관 응답 체감 지연 감소.
      body: JSON.stringify({
        input,
        voice: voice || defaultVoice(),
        language,
        stream: true,
        response_format: "wav",
      }),
      // 데모 안정성: 긴 답변도 커버하되 무한 대기 방지.
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw ttsError("TTS_FAILED", "TTS 서버에 연결하지 못했습니다.");
  }

  if (!res.ok || !res.body) {
    throw ttsError("TTS_FAILED", `TTS 합성 실패 (HTTP ${res.status}).`);
  }

  return res;
}

function ttsError(code: string, message: string): Error & { code: string } {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}
