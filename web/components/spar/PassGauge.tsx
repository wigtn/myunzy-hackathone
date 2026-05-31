"use client";

// 합격 가능성 게이지 (FR-015). 결정론 점수 가중합. 에디토리얼: 가는 막대 + 명조 수치.
export function PassGauge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 60 ? "bg-pass" : pct >= 40 ? "bg-pressure" : "bg-err";
  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <span className="text-xs text-faint shrink-0">합격 가능성</span>
      <div className="flex-1 h-1.5 rounded-full bg-sunken overflow-hidden">
        <div className={`h-full ${color} transition-all duration-700 ease-out`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-display text-base tabular-nums w-10 text-right text-ink">{pct}%</span>
    </div>
  );
}
