"use client";

// 분기 리플레이 (FR-016) ⭐데모 클라이맥스 — 에디토리얼.
import { useState } from "react";
import type { Moment, ReplayResult } from "@/lib/contract/types";
import { postReplay } from "@/lib/client/api";

export function MomentTimeline({
  moments,
  onPick,
  activeId,
}: {
  moments: Moment[];
  onPick: (m: Moment) => void;
  activeId?: string;
}) {
  if (moments.length === 0) {
    return <p className="text-sm text-faint">기록된 분기 진입점이 없어요.</p>;
  }
  return (
    <div className="space-y-2.5">
      {moments.map((m) => (
        <button
          key={m.id}
          onClick={() => onPick(m)}
          className={`w-full text-left rounded-xl border px-4 py-3 transition ${
            activeId === m.id ? "border-accent bg-accent-soft" : "border-line bg-card hover:border-accent/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-faint">R{m.round} · {m.atSec}s</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-pressure/8 text-pressure border border-pressure/20">
              {m.label}
            </span>
            <span className="ml-auto text-xs text-accent">이 답변 다시 →</span>
          </div>
          <p className="mt-1.5 text-sm text-ink truncate">&ldquo;{m.quote}&rdquo;</p>
        </button>
      ))}
    </div>
  );
}

export function ReplayPanel({ sessionId, moment }: { sessionId: string; moment: Moment | null }) {
  const [alt, setAlt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [err, setErr] = useState<string>();

  async function run(useModel: boolean) {
    if (!moment) return;
    setLoading(true);
    setErr(undefined);
    setResult(null);
    try {
      const r = await postReplay(sessionId, moment.id, useModel ? undefined : alt.trim() || undefined);
      setResult(r);
    } catch {
      setErr("리플레이 생성 실패. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  if (!moment) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-faint">
        왼쪽 타임라인에서 다시 해볼 순간을 선택하세요.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-6 space-y-4 card-soft">
      <div className="text-sm text-muted">
        선택: <span className="text-ink">&ldquo;{moment.quote}&rdquo;</span>
      </div>
      <textarea
        value={alt}
        onChange={(e) => setAlt(e.target.value)}
        rows={2}
        placeholder="다르게 답한다면? (비워두면 AI 모범안 생성)"
        className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 resize-none transition"
      />
      <div className="flex gap-2.5">
        <button
          onClick={() => run(false)}
          disabled={loading}
          className="rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-40 hover:bg-accent transition-colors"
        >
          {loading ? "시뮬레이션 중…" : "다시 시뮬레이션"}
        </button>
        <button
          onClick={() => run(true)}
          disabled={loading}
          className="rounded-full border border-line px-4 py-2.5 text-sm hover:border-accent disabled:opacity-40 transition"
        >
          AI 모범안으로
        </button>
      </div>

      {loading && <p className="text-sm text-faint">그 순간을 다시 시뮬레이션 중…</p>}
      {err && <p className="text-sm text-err">{err}</p>}

      {result && (
        <div className="space-y-3 pt-3 border-t border-line">
          <div className="flex items-center gap-2">
            <span className="text-xs text-faint">합격 가능성 변화</span>
            <span className={`font-display text-base ${result.passProbabilityDelta >= 0 ? "text-pass" : "text-err"}`}>
              {result.passProbabilityDelta >= 0 ? "+" : ""}
              {Math.round(result.passProbabilityDelta * 100)}%p
            </span>
          </div>
          <div className="rounded-xl bg-sunken p-4 space-y-2">
            {result.branchTranscript.map((t, i) => (
              <p key={i} className="text-sm text-ink">
                <span className={`text-[11px] uppercase tracking-wide mr-2 ${t.speaker === "ai" ? "text-accent" : "text-pass"}`}>
                  {t.speaker === "ai" ? "면접관" : "나(분기)"}
                </span>
                {t.text}
              </p>
            ))}
          </div>
          <p className="text-sm text-pressure">↳ {result.outcomeDelta}</p>
        </div>
      )}
    </div>
  );
}
