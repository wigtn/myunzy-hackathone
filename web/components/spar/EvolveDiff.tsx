"use client";

import type { WeaknessProfile } from "@/lib/contract/types";

// 자가진화 diff (FR-011): R1 약점 → R2 전략. before/after 대비로 "무엇이 달라졌나" 가시화.
export function EvolveDiff({
  before,
  after,
  round,
}: {
  before?: WeaknessProfile;
  after: WeaknessProfile;
  round: number;
}) {
  return (
    <div className="rounded-2xl border border-accent/25 bg-accent-soft/50 p-5 rise">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] uppercase tracking-[0.15em] text-accent">자가진화</span>
        <span className="text-[11px] text-faint">R{round} → R{round + 1}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
        <div>
          <div className="text-[11px] text-faint mb-1.5">R{round} 약점</div>
          <div className="flex flex-wrap gap-1.5">
            {(after.patterns.length ? after.patterns : ["—"]).map((p) => (
              <span key={p} className="rounded-full bg-card border border-line px-2.5 py-0.5 text-xs text-ink">
                {p}
              </span>
            ))}
          </div>
          {before && before.patterns.length > 0 && (
            <div className="mt-1.5 text-[11px] text-faint line-through">
              이전: {before.patterns.join(", ")}
            </div>
          )}
        </div>
        <span className="font-display text-accent text-2xl">→</span>
        <div>
          <div className="text-[11px] text-faint mb-1.5">R{round + 1} 전략</div>
          <div className="rounded-xl bg-card border border-accent/30 px-3 py-2 text-sm text-accent leading-snug">
            {after.nextFocus}
          </div>
        </div>
      </div>
    </div>
  );
}
