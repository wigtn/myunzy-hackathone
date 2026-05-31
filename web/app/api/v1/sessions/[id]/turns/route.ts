// POST /api/v1/sessions/{id}/turns — 사용자 1턴 → 면접관 응답.
// voice: multipart(audio) / text: json{text}
import { fail, forward, isProxy, ok } from "@/lib/bff/agentClient";
import { processTurn } from "@/lib/bff/mockEngine";
import { sttConfigured, transcribe } from "@/lib/bff/sttClient";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (isProxy) return forward(req, `/api/v1/sessions/${id}/turns`);

  const ct = req.headers.get("content-type") ?? "";
  let text = "";
  let isVoice = false;
  let wordTimestamps: { word: string; start: number; end: number }[] | undefined;

  if (ct.includes("multipart/form-data")) {
    isVoice = true;
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File))
      return fail("STT_FAILED", "음성을 인식하지 못했어요. 다시 말씀하거나 텍스트로 입력하세요.");
    const manual = String(form.get("text") ?? "");
    if (manual) {
      // 텍스트 동봉 시 STT 생략 (디버그/폴백 경로)
      text = manual;
    } else if (sttConfigured()) {
      // 실 STT(서버사이드) — HTTP STT 서버를 BFF가 대리 호출해 mixed-content 회피.
      try {
        const r = await transcribe(audio);
        text = r.text;
        wordTimestamps = r.wordTimestamps;
      } catch {
        return fail("STT_FAILED", "음성을 인식하지 못했어요. 다시 말씀하거나 텍스트로 입력하세요.");
      }
    } else {
      // STT 미설정 → 캔드 transcript 폴백 (단독 데모 완주용)
      text = "제가 맡았던 결제 API 성능 개선 프로젝트에서 음… 응답 속도를 꽤 많이 줄였습니다.";
    }
  } else {
    const body = (await req.json().catch(() => ({}))) as { text?: string };
    text = (body.text ?? "").trim();
    if (!text) return fail("INVALID_INPUT", "답변 텍스트가 필요합니다.");
  }

  const result = processTurn(id, text, isVoice, wordTimestamps);
  if ("notFound" in result) return fail("NOT_FOUND", "세션을 찾을 수 없습니다.");
  return ok(result);
}
