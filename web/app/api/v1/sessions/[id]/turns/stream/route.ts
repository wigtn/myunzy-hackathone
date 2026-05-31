// POST /api/v1/sessions/{id}/turns/stream — 사용자 1턴 → 면접관 응답을 SSE 토큰 스트리밍(TTFT).
// 프록시(Python 에이전트) 모드 전용: forwardStream으로 업스트림 SSE를 무버퍼 파이프한다.
// 비프록시(내장 mock) 모드는 스트리밍 미지원 → 503 → 클라가 비스트리밍 /turns 로 폴백.
import { fail, forwardStream, isProxy } from "@/lib/bff/agentClient";

// 스트리밍 응답이 라우트 캐시/정적화에 걸리지 않도록 동적 처리 강제.
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (!isProxy)
    return fail("UPSTREAM_UNAVAILABLE", "스트리밍은 에이전트 서비스 연결 시에만 지원됩니다.");
  return forwardStream(req, `/api/v1/sessions/${id}/turns/stream`);
}
