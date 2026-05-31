"use client";

// 판정 카드 모음 (FR-014) — 에디토리얼 라이트.
import type {
  FitGapReport,
  FrameworkReport,
  TimingMetrics,
  VerdictScores,
} from "@/lib/contract/types";

const SCORE_LABELS: Record<keyof VerdictScores, string> = {
  goalAchieved: "목표달성",
  evidence: "근거력",
  composure: "감정조절",
  timing: "타이밍",
  assertiveness: "단호함",
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-6 card-soft">
      <h3 className="text-[11px] uppercase tracking-[0.15em] text-accent mb-4">{title}</h3>
      {children}
    </div>
  );
}

export function SummaryBar({ text }: { text: string }) {
  return (
    <p className="font-display text-2xl sm:text-[1.8rem] leading-snug text-ink">{text}</p>
  );
}

export function ScoreCard({ scores }: { scores: VerdictScores }) {
  return (
    <Card title="다차원 점수">
      <div className="space-y-3.5">
        {(Object.keys(scores) as (keyof VerdictScores)[]).map((k) => {
          const pct = Math.round(scores[k] * 100);
          const color = pct >= 60 ? "bg-pass" : pct >= 40 ? "bg-pressure" : "bg-err";
          return (
            <div key={k} className="flex items-center gap-3">
              <span className="w-16 text-sm text-muted shrink-0">{SCORE_LABELS[k]}</span>
              <div className="flex-1 h-1.5 rounded-full bg-sunken overflow-hidden">
                <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
              </div>
              <span className="font-display text-sm tabular-nums w-8 text-right text-ink">{pct}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function TimingMetricsCard({ m }: { m: TimingMetrics }) {
  const items = [
    { k: "평균 응답 지연", v: `${m.avgResponseDelaySec}s`, warn: m.avgResponseDelaySec >= 2.5 },
    { k: "최장 머뭇거림", v: `${m.longestPauseSec}s`, warn: m.longestPauseSec >= 3 },
    { k: "발화 속도", v: `${m.wordsPerSec} w/s`, warn: false },
    { k: "필러 사용", v: `${m.fillerCount}회`, warn: m.fillerCount >= 4 },
  ];
  return (
    <Card title="타이밍 지표 · 단어 타임스탬프">
      <div className="grid grid-cols-2 gap-3">
        {items.map((it) => (
          <div key={it.k} className="rounded-xl bg-sunken px-4 py-3">
            <div className="text-xs text-muted">{it.k}</div>
            <div className={`font-display text-2xl mt-0.5 ${it.warn ? "text-pressure" : "text-ink"}`}>
              {it.v}
            </div>
          </div>
        ))}
      </div>
      {m.longestPauseSec >= 3 && (
        <p className="mt-3 text-sm text-pressure">{m.longestPauseSec}초 망설인 뒤 응답한 구간이 있어요.</p>
      )}
    </Card>
  );
}

export function FrameworkCard({ f }: { f: FrameworkReport }) {
  return (
    <Card title={`프레임워크 근거 · ${f.name}`}>
      {f.violations.length === 0 ? (
        <p className="text-sm text-pass">구조적 결함 없음</p>
      ) : (
        <ul className="space-y-2">
          {f.violations.map((v) => (
            <li key={v} className="flex items-start gap-2.5 text-sm text-ink">
              <span className="text-err mt-0.5">✗</span>
              <span>{v}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function FitGapReportCard({ r }: { r: FitGapReport }) {
  return (
    <Card title="Fit Gap 리포트 · 이력서 ↔ JD">
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <div className="text-xs text-pass mb-2">충족</div>
          <ul className="space-y-1.5">
            {r.covered.map((c) => (
              <li key={c} className="flex items-start gap-2 text-sm text-ink">
                <span className="text-pass mt-0.5">✓</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs text-err mb-2">여전히 약함</div>
          <ul className="space-y-1.5">
            {r.stillWeak.map((c) => (
              <li key={c} className="flex items-start gap-2 text-sm text-ink">
                <span className="text-err mt-0.5">✗</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
