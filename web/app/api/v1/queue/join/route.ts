// POST /api/v1/queue/join — 동시 면접 슬롯 요청. 프록시 or mock(단독 데모는 즉시 active).
import { forward, isProxy, ok } from "@/lib/bff/agentClient";

export async function POST(req: Request): Promise<Response> {
  if (isProxy) return forward(req, "/api/v1/queue/join");
  // mock 단독 데모: 대기열 개념 없음 → 항상 즉시 입장.
  return ok({ ticket: "tk_mock", state: "active", position: 0, estimatedWaitSec: 0, capacity: 10, activeCount: 1 });
}
