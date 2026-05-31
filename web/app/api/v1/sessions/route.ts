// POST /api/v1/sessions — 세션 시작 (multipart). 프록시 or mock 부트스트랩.
import { fail, forward, isProxy, ok } from "@/lib/bff/agentClient";
import { bootstrapSession } from "@/lib/bff/mockEngine";
import type { Mode } from "@/lib/contract/types";

const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024);

export async function POST(req: Request): Promise<Response> {
  if (isProxy) return forward(req, "/api/v1/sessions");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("INVALID_INPUT", "multipart/form-data 형식이 필요합니다.");
  }

  const resumes = form.getAll("resume").filter((r): r is File => r instanceof File);
  const company = String(form.get("company") ?? "").trim();
  const role = String(form.get("role") ?? "").trim();
  const mode = (String(form.get("mode") ?? "text") as Mode) || "text";
  const difficulty = Number(form.get("difficulty") ?? 1);
  const jobPostingText = String(form.get("jobPostingText") ?? "").trim();
  const stages = String(form.get("stages") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  if (!company || !role) return fail("INVALID_INPUT", "회사명과 직무는 필수입니다.");
  if (resumes.length === 0) return fail("INVALID_INPUT", "서류를 한 장 이상 올려주세요.");
  if (resumes.some((f) => f.size > MAX_UPLOAD))
    return fail("PAYLOAD_TOO_LARGE", "파일이 너무 큽니다(장당 최대 10MB). 다른 파일을 올려주세요.");

  const session = bootstrapSession({
    company,
    role,
    mode,
    difficulty,
    resumeCount: resumes.length,
    jobPostingText: jobPostingText || undefined,
    stages: stages.length ? stages : undefined,
  });
  return ok(session, 201);
}
