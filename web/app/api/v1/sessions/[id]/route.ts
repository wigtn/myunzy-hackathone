// GET /api/v1/sessions/{id} — 세션 스냅샷.
import { fail, forward, isProxy, ok } from "@/lib/bff/agentClient";
import { getSessionDTO } from "@/lib/bff/mockEngine";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (isProxy) return forward(req, `/api/v1/sessions/${id}`);

  const session = getSessionDTO(id);
  if (!session) return fail("NOT_FOUND", "세션을 찾을 수 없습니다.");
  return ok(session);
}
