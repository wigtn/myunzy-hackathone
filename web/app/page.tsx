import Link from "next/link";

// P1. / — 랜딩 (FR-001). 에디토리얼 히어로: 명조 헤드라인 + 넓은 여백 + 절제.
const STEPS = [
  { n: "01", t: "서류 업로드", d: "이력서·자소서 여러 장을 한 번에" },
  { n: "02", t: "면접관 자동 생성", d: "실제 채용공고로 만든 4인 패널" },
  { n: "03", t: "압박 면접 · 근거 피드백", d: "머뭇거림·근거까지 짚는 판정" },
];

// 활용 스택 — 실제 구동 우선(EXAONE/DeepAgents/Qwen STT·TTS) + 통합 어댑터(MISO/Rocketpunch)
const STACK = [
  "EXAONE-4.5",
  "DeepAgents · LangGraph",
  "Hermes tool-calling",
  "Qwen3-ASR · TTS",
  "MISO · OCR",
  "Rocketpunch",
  "Next.js · FastAPI",
  "self-evolving harness",
];

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 sm:px-8">
      {/* Hero */}
      <section className="pt-20 sm:pt-32 pb-16">
        <p className="text-xs tracking-[0.2em] uppercase text-accent rise">
          AI Interview Sparring
        </p>
        <h1 className="mt-6 font-display text-[2.6rem] sm:text-[4.2rem] leading-[1.05] text-ink rise">
          한 번뿐인 면접,
          <br />
          <span className="italic text-accent">실전처럼</span> 미리 겪다.
        </h1>
        <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted rise">
          내 이력서와 실제 채용공고로 만들어진 AI 면접관과 음성으로 모의면접.
          머뭇거린 순간과 부족한 근거까지 짚어, 다음 라운드에 바로 고쳐봅니다.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3 rise">
          <Link
            href="/setup"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-base font-medium text-paper hover:bg-accent transition-colors"
          >
            면접 시작하기
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/setup"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-7 py-3.5 text-base font-medium text-ink hover:border-accent hover:text-accent transition-colors"
          >
            샘플로 60초 체험
          </Link>
        </div>
        <p className="mt-4 text-sm text-faint rise">
          심사위원이세요? 서류 없이 <span className="text-muted">개발자·PM 샘플</span>로 전 과정을 둘러볼 수 있어요 · 사용법은 상단 ‘사용법’ · 로그인 없이 바로 · 서류는 세션 종료 시 폐기
        </p>
      </section>

      {/* How it works */}
      <section className="border-t border-line/70 py-14">
        <div className="grid sm:grid-cols-3 gap-px bg-line/60 rounded-2xl overflow-hidden border border-line/60">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-paper p-7">
              <div className="font-display text-sm text-accent">{s.n}</div>
              <h3 className="mt-3 font-display text-xl text-ink">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stack strip */}
      <section className="pb-24">
        <p className="text-xs uppercase tracking-[0.18em] text-faint mb-4">활용 스택</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {STACK.map((x) => (
            <span key={x} className="font-serif text-base text-muted">
              {x}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
