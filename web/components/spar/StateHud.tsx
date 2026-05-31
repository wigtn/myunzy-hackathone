"use client";

import type { StateDelta } from "@/lib/contract/types";

// 면접관 상태 미니: mood · pressure · hiddenAgenda (FR-017). 절제된 라벨.
export function StateHud({ state }: { state: StateDelta | null }) {
  if (!state) return null;
  const p = Math.round(state.pressure * 100);
  return (
    <div className="flex items-center gap-3 text-[11px] text-faint">
      <span>
        분위기 <span className="text-muted">{state.mood}</span>
      </span>
      <span className="flex items-center gap-1.5">
        압박
        <span className="inline-block w-14 h-1 rounded-full bg-sunken overflow-hidden align-middle">
          <span className="block h-full bg-pressure transition-all" style={{ width: `${p}%` }} />
        </span>
      </span>
      <span className="flex items-center gap-1">
        의중
        <span className={`size-1.5 rounded-full ${state.hiddenAgendaRevealed ? "bg-err dot-live" : "bg-line"}`} />
      </span>
    </div>
  );
}
