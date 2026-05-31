"use client";

import type { Persona, PersonaId } from "@/lib/contract/types";

// 활성 페르소나 표시 (FR-005). 라운드 진행 시 tech→exec 압박 상승.
export function PersonaTabs({ personas, active }: { personas: Persona[]; active: PersonaId }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {personas.map((p) => {
        const on = p.id === active;
        return (
          <span
            key={p.id}
            title={p.persona}
            className={`px-3 py-1 rounded-full text-xs transition border ${
              on
                ? "border-accent/40 bg-accent-soft text-accent"
                : "border-transparent text-faint hover:text-muted"
            }`}
          >
            {on && <span className="mr-1">●</span>}
            {p.name}
          </span>
        );
      })}
    </div>
  );
}
