// GET /api/v1/sessions/{id}/logs?since=<seq> — AgentLogPanel 폴링 소스.
import { fail, forward, isProxy, ok } from "@/lib/bff/agentClient";
import { getSession } from "@/lib/bff/store";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const since = Number(url.searchParams.get("since") ?? 0);

  if (isProxy) return forward(req, `/api/v1/sessions/${id}/logs?since=${since}`);

  const s = getSession(id);
  if (!s) return fail("NOT_FOUND", "세션을 찾을 수 없습니다.");
  const logs = s.agentLog.filter((l) => (l.seq ?? 0) > since);
  return ok({ logs });
}
