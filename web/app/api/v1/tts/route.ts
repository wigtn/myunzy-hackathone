// GET /api/v1/tts?text=...&voice=... — 면접관 응답 텍스트를 Qwen3-TTS 음성(WAV)으로 합성.
// 브라우저가 <audio src> / new Audio(url)로 직접 소비할 수 있도록 audio/wav를 스트리밍한다.
// HTTP TTS 서버를 BFF가 대리 호출 → HTTPS 프론트의 mixed-content 회피 (sttClient와 동일 전략).
import { fail, forwardStream, isProxy } from "@/lib/bff/agentClient";
import { synthesize } from "@/lib/bff/ttsClient";

// 합성 텍스트 상한 — 무제한 입력이 업스트림 TTS를 남용/증폭하는 것을 차단.
const MAX_TTS_TEXT = 2000;

export async function GET(req: Request): Promise<Response> {
  // 프록시 모드면 Python 에이전트 서비스가 TTS도 담당 → 스트리밍으로 그대로 전달.
  // (forward는 전체 버퍼링 → 첫 음성까지 지연. forwardStream은 청크 즉시 파이프.)
  if (isProxy) {
    const qs = new URL(req.url).search;
    return forwardStream(req, `/api/v1/tts${qs}`);
  }

  const url = new URL(req.url);
  const text = url.searchParams.get("text") ?? "";
  const voice = url.searchParams.get("voice") ?? undefined;
  if (!text.trim()) return fail("INVALID_INPUT", "합성할 텍스트가 필요합니다.");
  if (text.length > MAX_TTS_TEXT) return fail("INVALID_INPUT", "합성 텍스트가 너무 깁니다.");

  try {
    const upstream = await synthesize(text, voice);
    // 업스트림 WAV 스트림(chunked)을 그대로 흘려보냄. 스트리밍 본문이 중간에 끊겨도
    // 공유/CDN 캐시에 잘린 응답이 남지 않도록 동일 출처 브라우저 캐시(private)만 허용.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": "audio/wav",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    // TTS 실패/미설정 → 에러 응답. 클라가 audio onerror로 감지해 SpeechSynthesis 폴백으로 전환.
    return fail("UPSTREAM_UNAVAILABLE", "음성 합성에 실패했습니다.");
  }
}
