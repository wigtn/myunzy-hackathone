// POST /api/v1/queue/{ticket}/release — 슬롯 반환(면접 종료/이탈). 프록시 or mock(no-op).
import { forward, isProxy, ok } from "@/lib/bff/agentClient";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ ticket: string }> },
): Promise<Response> {
  const { ticket } = await ctx.params;
  if (isProxy) return forward(req, `/api/v1/queue/${ticket}/release`);
  return ok({ released: true });
}
