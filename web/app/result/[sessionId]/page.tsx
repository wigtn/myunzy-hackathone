"use client";

// P4. /result/[sessionId] — 판정 + 분기 리플레이 (FR-014, 016, 018). 에디토리얼.
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FitGapReportCard,
  FrameworkCard,
  ScoreCard,
  SummaryBar,
  TimingMetricsCard,
} from "@/components/result/Cards";
import { MomentTimeline, ReplayPanel } from "@/components/result/ReplayPanel";
import { EvolveDiff } from "@/components/spar/EvolveDiff";
import { postVerdict } from "@/lib/client/api";
import type { Moment, Verdict } from "@/lib/contract/types";

export default function ResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [err, setErr] = useState(false);
  const [picked, setPicked] = useState<Moment | null>(null);

  useEffect(() => {
    const cached = sessionStorage.getItem(`verdict_${sessionId}`);
    if (cached) {
      setVerdict(JSON.parse(cached) as Verdict);
      return;
    }
    postVerdict(sessionId)
      .then((v) => {
        sessionStorage.setItem(`verdict_${sessionId}`, JSON.stringify(v));
        setVerdict(v);
      })
      .catch(() => setErr(true));
  }, [sessionId]);

  if (err) {
    return (
      <div className="min-h-full grid place-items-center px-6 text-center">
        <div>
          <p className="text-muted">판정을 불러오지 못했어요.</p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 rounded-full border border-line px-5 py-2.5 text-sm hover:border-accent transition"
          >
            처음으로
          </button>
        </div>
      </div>
    );
  }

  if (!verdict) {
    return (
      <div className="min-h-full grid place-items-center">
        <span className="text-sm text-faint">얼라인·판정 생성 중…</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 sm:px-8 py-12 sm:py-16">
      <header className="flex items-start gap-4 flex-wrap rise">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent">판정 · R{verdict.round ?? 1}</p>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl text-ink">면접 리포트</h1>
        </div>
        <div className="ml-auto flex gap-2.5">
          {verdict.status !== "ended" && (
            <button
              onClick={() => router.push(`/spar/${sessionId}`)}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:bg-accent transition-colors"
            >
              면접으로 돌아가기
            </button>
          )}
          <button
            onClick={() => router.push("/")}
            className="rounded-full border border-line px-5 py-2.5 text-sm hover:border-accent transition"
          >
            처음으로
          </button>
        </div>
      </header>

      <div className="mt-8 rise">
        <SummaryBar text={verdict.summary} />
      </div>

      <div className="mt-10 grid md:grid-cols-2 gap-5">
        <ScoreCard scores={verdict.scores} />
        <TimingMetricsCard m={verdict.timingMetrics} />
        <FrameworkCard f={verdict.framework} />
        <FitGapReportCard r={verdict.fitGapReport} />
      </div>

      <div className="mt-5">
        <EvolveDiff before={verdict.weaknessBefore} after={verdict.weaknessProfile} round={verdict.round ?? 1} />
      </div>

      <section className="mt-12">
        <h2 className="font-display text-2xl text-ink mb-1">그 순간을 다시</h2>
        <p className="text-sm text-muted mb-5">아쉬웠던 답변을 골라 다르게 답하면, 결과가 어떻게 달라지는지 시뮬레이션합니다.</p>
        <div className="grid md:grid-cols-2 gap-5">
          <MomentTimeline moments={verdict.moments} onPick={setPicked} activeId={picked?.id} />
          <ReplayPanel sessionId={sessionId} moment={picked} />
        </div>
      </section>
    </div>
  );
}
