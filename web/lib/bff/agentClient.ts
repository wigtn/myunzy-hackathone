// BFF 디스패처: AGENT_SERVICE_URL 유무로 "프록시 vs 내장 TS mock" 분기.
//   - 미설정 → 내장 mock 엔진 (단독 데모, 의존성 0)
//   - 설정   → Python 에이전트 서비스로 원본 요청 그대로 프록시
//             (mock LLM → 팀원 EXAONE 승격 시 web 코드 무변경)
import { NextResponse } from "next/server";
import type { ApiError, ErrorCode } from "@/lib/contract/types";
import { ERROR_STATUS } from "@/lib/contract/types";

export const AGENT_URL = (process.env.AGENT_SERVICE_URL ?? "").trim().replace(/\/$/, "");
export const isProxy = AGENT_URL.length > 0;

/** 원본 요청을 Python 에이전트 서비스로 그대로 전달 (multipart/json 무관). */
export async function forward(req: Request, path: string): Promise<Response> {
  const url = `${AGENT_URL}${path}`;
  const method = req.method;
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");
  const body =
    method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer();
  try {
    const upstream = await fetch(url, { method, headers, body });
    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE", "에이전트 서비스에 연결할 수 없습니다. mock 폴백 또는 재시도하세요.");
  }
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(code: ErrorCode, message: string, details: unknown[] = []): NextResponse {
  const error: ApiError = { code, message, details };
  return NextResponse.json(
    { success: false, error, meta: { timestamp: new Date().toISOString() } },
    { status: ERROR_STATUS[code] },
  );
}
