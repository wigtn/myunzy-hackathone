"use client";

// P2. /setup — 업로드 + 컨텍스트 입력 (FR-001~005, 022). 에디토리얼 2단.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Dropzone } from "@/components/setup/Dropzone";
import { AgentLogPanel } from "@/components/AgentLogPanel";
import { QueueOverlay } from "@/components/setup/QueueOverlay";
import { createSession, joinQueue, pollQueue, releaseSlot } from "@/lib/client/api";
import { SAMPLES, getSample, sampleFiles, type Sample } from "@/lib/samples";
import type { AgentLog, Mode, PersonaId, QueueStatus } from "@/lib/contract/types";

const BOOT = [
  { step: "ocr.parse", d: "서류 분석 중…" },
  { step: "job.search", d: "채용공고 조회 중…" },
  { step: "fitgap.analyze", d: "약점 분석 중…" },
  { step: "persona.build", d: "면접관 생성 중…" },
];

// 면접 단계(=면접관 패널). 고른 단계가 라운드 순서가 됨 (실제 면접처럼 단계 분리).
const STAGE_OPTS: { id: PersonaId; name: string }[] = [
  { id: "tech", name: "기술 면접" },
  { id: "culture", name: "컬처핏 면접" },
  { id: "exec", name: "임원 면접" },
  { id: "hr", name: "HR 면접" },
];

// 음성 보이스 (TTS). 키값은 TTS 서버 보이스 ID 그대로. 이명박은 보류(주석).
const VOICE_OPTS: { id: string; name: string }[] = [
  { id: "teacher_female_kr", name: "여성 (차분)" },
  { id: "teacher_male_kr", name: "남성 (차분)" },
  { id: "박명수", name: "박명수" },
  { id: "유해진", name: "유해진" },
  // { id: "이명박", name: "이명박" }, // 보류 — 필요 시 주석 해제
];

export default function SetupPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobText, setJobText] = useState("");
  const [jobUrls, setJobUrls] = useState(""); // 로켓펀치 공고 URL (여러 개, 줄바꿈 구분)
  const [mode, setMode] = useState<Mode>("voice");
  const [difficulty, setDifficulty] = useState(1);
  const [stages, setStages] = useState<PersonaId[]>(["tech", "culture", "exec"]);
  const [voice, setVoice] = useState("teacher_female_kr");
  const [consent, setConsent] = useState(false);

  // 단계 토글 (정규 순서 유지). 최소 1개.
  function toggleStage(id: PersonaId) {
    setStages((prev) => {
      const has = prev.includes(id);
      if (has && prev.length === 1) return prev; // 최소 1개 유지
      const next = STAGE_OPTS.filter((o) => (o.id === id ? !has : prev.includes(o.id))).map((o) => o.id);
      return next;
    });
  }

  const [loading, setLoading] = useState(false);
  const [fileErr, setFileErr] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [sampled, setSampled] = useState<Sample | null>(null);
  const [queue, setQueue] = useState<QueueStatus | null>(null); // 대기열 상태(있으면 오버레이)
  const cancelWaitRef = useRef(false); // 대기 취소 플래그
  const timers = useRef<number[]>([]); // BOOT 진행로그/네비 타임아웃 — 에러·이탈 시 정리

  const canSubmit = files.length > 0 && company.trim() && role.trim() && consent && !loading;

  // 언마운트 시 예약된 타임아웃 정리 (이탈 후 setState 방지).
  useEffect(() => () => timers.current.forEach((id) => clearTimeout(id)), []);

  // 샘플로 체험: 서류 없이도 전체 흐름을 둘러보도록 폼을 채우고 이력서·자소서를 첨부.
  async function fillSample(s: Sample) {
    setCompany(s.company);
    setRole(s.role);
    setJobText(s.jobPosting);
    setConsent(true);
    setFileErr(undefined);
    setSampled(s);
    setStages(s.stages); // 샘플 직군에 맞는 면접 단계(영업/PM은 기술 면접관 제외)
    setFiles(await sampleFiles(s)); // 이력서(정적 PDF) + 자기소개서 멀티파일
  }

  // 랜딩/가이드에서 ?sample=dev|pm|1 로 들어오면 자동으로 해당 샘플 채우기.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const param = new URLSearchParams(window.location.search).get("sample");
    const s = getSample(param);
    if (s) fillSample(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setFileErr(undefined);
    setBanner(undefined);
    if (files.length === 0) return setFileErr("서류를 한 장 이상 올려주세요.");
    setLoading(true);

    let ticket: string | null = null;
    try {
      // 1) 동시 면접 슬롯 확보. 정원 초과면 대기열 → 오버레이로 순번 표시.
      cancelWaitRef.current = false;
      let q = await joinQueue();
      ticket = q.ticket;
      while (q.state === "waiting") {
        setQueue(q);
        await new Promise((r) => setTimeout(r, 3000));
        if (cancelWaitRef.current) {
          await releaseSlot(ticket);
          setQueue(null);
          setLoading(false);
          return;
        }
        q = await pollQueue(ticket);
      }
      setQueue(null);
      sessionStorage.setItem("slotTicket", ticket); // spar 가 하트비트/슬롯 반환에 사용

      // 2) 부트스트랩 진행 로그 + 세션 생성
      BOOT.forEach((b, i) =>
        timers.current.push(
          window.setTimeout(
            () => setLogs((prev) => [...prev, { step: b.step, status: "run", detail: b.d }]),
            i * 480,
          ),
        ),
      );
      const form = new FormData();
      files.forEach((f) => form.append("resume", f)); // 멀티 파일
      form.append("company", company.trim());
      form.append("role", role.trim());
      if (jobText.trim()) form.append("jobPostingText", jobText.trim()); // 공고 직접 입력
      if (jobUrls.trim()) form.append("jobPostingUrls", jobUrls.trim()); // 로켓펀치 공고 URL 지정
      form.append("mode", mode);
      form.append("difficulty", String(difficulty));
      form.append("stages", stages.join(",")); // 면접 단계(페르소나) 순서
      if (mode === "voice") form.append("voice", voice); // TTS 보이스
      const session = await createSession(form);
      setLogs(session.agentLog);
      // 선택한 면접관 목소리를 spar 재생에 전달 (계약 변경 없이 클라 보관).
      if (mode === "voice") sessionStorage.setItem(`voice_${session.sessionId}`, voice);
      timers.current.push(window.setTimeout(() => router.push(`/spar/${session.sessionId}`), 600));
    } catch (e) {
      const err = e as Error & { code?: string };
      // 실패 시 확보한 슬롯 반환 (다음 사람에게 양보)
      if (ticket) releaseSlot(ticket);
      setQueue(null);
      // 진행로그 타임아웃 취소 + 가짜 'run' 로그 제거 (에러 시 영원히 남던 버그)
      timers.current.forEach((id) => clearTimeout(id));
      timers.current = [];
      setLogs([]);
      setLoading(false);
      if (err.code === "PAYLOAD_TOO_LARGE")
        setFileErr("파일이 너무 큽니다(장당 최대 10MB). 다른 파일을 올려주세요.");
      else if (err.code === "OCR_FAILED")
        setFileErr("서류를 읽지 못했어요. 다른 형식(PDF 권장)으로 다시 올려주세요.");
      else if (err.code === "UPSTREAM_UNAVAILABLE")
        setBanner("일부 데이터 소스가 불안정해요. 예시 데이터로 계속 진행합니다.");
      else setBanner(err.message || "세션 생성에 실패했어요. 다시 시도해 주세요.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 sm:px-8 py-12 sm:py-16">
      {queue && (
        <QueueOverlay status={queue} onCancel={() => (cancelWaitRef.current = true)} />
      )}
      <header className="rise">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">Step 1</p>
        <h1 className="mt-3 font-display text-3xl sm:text-4xl text-ink">면접 준비</h1>
        <p className="mt-3 text-muted leading-relaxed">
          서류를 올리고 지원 정보를 입력하면, 면접관 패널이 자동으로 만들어집니다.
        </p>
      </header>

      {/* 샘플 체험 (서류 없는 사람·심사위원이 바로 둘러보도록) */}
      {sampled ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-accent/25 bg-accent-soft/50 px-4 py-3 text-sm rise">
          <span className="size-1.5 rounded-full bg-accent shrink-0" aria-hidden />
          <span className="text-ink font-medium">‘{sampled.label}’ 샘플을 채웠어요.</span>
          <span className="text-muted">아래 ‘면접관 생성하기’를 누르면 바로 체험할 수 있어요.</span>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setSampled(null);
              setFiles([]);
              setCompany("");
              setRole("");
              setJobText("");
            }}
            className="ml-auto text-xs text-faint hover:text-accent underline underline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            직접 입력으로
          </button>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-line bg-card px-4 py-4 rise">
          <p className="text-sm text-ink">
            이력서가 없으세요? <span className="text-muted">샘플 한 명을 골라 바로 체험해 보세요.</span>
          </p>
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={loading}
                onClick={() => fillSample(s)}
                className="text-left rounded-xl border border-line bg-paper hover:border-accent hover:bg-accent-soft/40 transition px-4 py-3 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2">
                  <span className="font-display text-base text-ink">{s.label}</span>
                  <span className="text-[11px] text-faint">· {s.company}</span>
                  <span className="ml-auto text-accent opacity-0 group-hover:opacity-100 transition" aria-hidden>
                    →
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{s.tagline}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {banner && (
        <div className="mt-6 rounded-xl border border-pressure/30 bg-pressure/8 px-4 py-3 text-sm text-pressure rise">
          {banner}
        </div>
      )}

      <div className="mt-10 grid lg:grid-cols-[1.4fr_1fr] gap-8">
        {/* 좌: 입력 폼 */}
        <fieldset disabled={loading} className="space-y-7 disabled:opacity-60 transition-opacity">
          <Dropzone files={files} onFiles={setFiles} error={fileErr} disabled={loading} />

          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="지원 회사" required>
              <input
                value={company}
                maxLength={40}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="예: 토스"
                className={inputCls}
              />
            </Field>
            <Field label="지원 직무" required>
              <input
                value={role}
                maxLength={40}
                onChange={(e) => setRole(e.target.value)}
                placeholder="예: 백엔드 엔지니어"
                className={inputCls}
              />
            </Field>
          </div>

          <Field
            label="채용공고 (선택)"
            hint="로켓펀치에서 자동 조회합니다. 공고가 없거나 더 정확히 하려면 여기에 붙여넣으세요."
          >
            <textarea
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              rows={4}
              placeholder="채용공고 본문을 붙여넣으면 면접관이 이 내용으로 압박합니다…"
              className={`${inputCls} resize-y leading-relaxed`}
            />
          </Field>

          <Field
            label="로켓펀치 공고 URL (선택)"
            hint="지원할 실제 공고 링크를 한 줄에 하나씩 넣으면, 그 공고들의 요구사항에 정확히 맞춰 면접을 준비합니다. (여러 개 가능)"
          >
            <textarea
              value={jobUrls}
              onChange={(e) => setJobUrls(e.target.value)}
              rows={3}
              placeholder={"https://www.rocketpunch.com/jobs/158582\nhttps://www.rocketpunch.com/jobs/157038"}
              className={`${inputCls} resize-y leading-relaxed font-mono text-xs`}
            />
          </Field>

          <Field label="면접 단계" hint="고른 단계가 라운드 순서가 됩니다. 단계마다 다른 면접관이 진행해요.">
            <div className="flex flex-wrap gap-2">
              {STAGE_OPTS.map((o) => {
                const on = stages.includes(o.id);
                const order = stages.indexOf(o.id) + 1;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => toggleStage(o.id)}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm border transition ${
                      on
                        ? "border-accent bg-accent-soft text-ink"
                        : "border-line bg-card text-muted hover:border-accent/50"
                    }`}
                  >
                    {on && <span className="text-accent font-mono text-xs">{order}</span>}
                    {o.name}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="면접 모드" hint="원활한 진행을 위해 음성 모드 + 마이크 사용을 권장합니다.">

              <div className="inline-flex rounded-full border border-line bg-card p-1">
                {(["voice", "text"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`px-5 py-2 rounded-full text-sm transition ${
                      mode === m ? "bg-ink text-paper" : "text-muted hover:text-ink"
                    }`}
                  >
                    {m === "voice" ? "음성" : "텍스트"}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="압박 강도">
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value))}
                className={inputCls}
              >
                <option value={1}>1 · 부드럽게</option>
                <option value={2}>2 · 현실적</option>
                <option value={3}>3 · 압박 면접</option>
              </select>
            </Field>
          </div>

          {mode === "voice" && (
            <Field label="면접관 목소리" hint="음성 모드 면접관의 TTS 보이스입니다.">
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {VOICE_OPTS.map((v) => (
                  <label key={v.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="voice"
                      value={v.id}
                      checked={voice === v.id}
                      onChange={() => setVoice(v.id)}
                      className="size-4 accent-accent"
                    />
                    <span className={voice === v.id ? "text-ink" : "text-muted"}>{v.name}</span>
                  </label>
                ))}
              </div>
            </Field>
          )}

          <label className="flex items-start gap-3 text-sm text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-4 accent-accent"
            />
            <span>녹음·서류 처리에 동의합니다. 업로드한 서류는 세션 종료 시 폐기됩니다.</span>
          </label>

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="w-full rounded-full bg-ink px-6 py-4 text-base font-medium text-paper disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent transition-colors"
          >
            {loading ? "면접관 생성 중…" : "면접관 생성하기 →"}
          </button>
          {!consent && (
            <p className="text-xs text-faint text-center -mt-4">
              진행하려면 녹음·서류 처리에 동의해 주세요.
            </p>
          )}
        </fieldset>

        {/* 우: 작업 로그 */}
        <AgentLogPanel
          logs={logs}
          title="부트스트랩"
          emptyHint="제출하면 OCR → 채용공고 수집 → 약점 분석 → 면접관 생성 과정이 여기 실시간으로 펼쳐집니다."
          className="h-[440px] lg:sticky lg:top-20"
        />
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-line bg-card px-4 py-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition placeholder:text-faint";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-ink mb-2">
        {label} {required && <span className="text-accent">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-faint leading-relaxed">{hint}</p>}
    </div>
  );
}
