// POST /api/v1/sessions/{id}/verdict — 라운드 종료 판정 + 자가진화 약점 갱신.
import { fail, forward, isProxy, ok } from "@/lib/bff/agentClient";
import { processVerdict } from "@/lib/bff/mockEngine";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (isProxy) return forward(req, `/api/v1/sessions/${id}/verdict`);

  const result = processVerdict(id);
  if ("notFound" in result) return fail("NOT_FOUND", "세션을 찾을 수 없습니다.");
  return ok(result);
}
