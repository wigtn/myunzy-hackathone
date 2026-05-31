// POST /api/v1/sessions/{id}/replay — 분기 리플레이 (대안 답변 재시뮬).
import { fail, forward, isProxy, ok } from "@/lib/bff/agentClient";
import { processReplay } from "@/lib/bff/mockEngine";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (isProxy) return forward(req, `/api/v1/sessions/${id}/replay`);

  const body = (await req.json().catch(() => ({}))) as {
    momentId?: string;
    alternativeUtterance?: string;
  };
  if (!body.momentId) return fail("INVALID_INPUT", "momentId가 필요합니다.");

  const result = processReplay(id, body.momentId, body.alternativeUtterance);
  if ("notFound" in result) return fail("NOT_FOUND", "세션을 찾을 수 없습니다.");
  return ok(result);
}
