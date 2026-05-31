// GET /api/v1/queue/{ticket} — 슬롯 상태 폴링 + 하트비트. 프록시 or mock(즉시 active).
import { forward, isProxy, ok } from "@/lib/bff/agentClient";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ ticket: string }> },
): Promise<Response> {
  const { ticket } = await ctx.params;
  if (isProxy) return forward(req, `/api/v1/queue/${ticket}`);
  return ok({ ticket, state: "active", position: 0, estimatedWaitSec: 0, capacity: 10, activeCount: 1 });
}
