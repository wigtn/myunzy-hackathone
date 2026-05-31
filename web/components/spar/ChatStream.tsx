"use client";

import { useEffect, useRef } from "react";
import type { Persona, Turn } from "@/lib/contract/types";
import { MockBadge } from "@/components/MockBadge";

// 대화 스트림 — 에디토리얼: 면접관 질문은 큰 명조, 사용자 답은 차분한 카드.
export function ChatStream({
  turns,
  personas,
  thinking,
}: {
  turns: Turn[];
  personas: Persona[];
  thinking: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, thinking]);

  const nameOf = (id?: string) => personas.find((p) => p.id === id)?.name ?? "면접관";

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-10 py-8 space-y-8">
      {turns.map((t, i) =>
        t.speaker === "ai" ? (
          <div key={i} className="max-w-2xl rise">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[11px] uppercase tracking-[0.15em] text-accent">
                {nameOf(t.personaId)}
              </span>
            </div>
            <p className="font-display text-xl sm:text-[1.6rem] leading-snug text-ink">{t.text}</p>
            {t.toolCalls && t.toolCalls.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {t.toolCalls.map((tc, j) => (
                  <span
                    key={j}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-[11px] text-live"
                  >
                    <span aria-hidden>◷</span>
                    {tc.summary}
                    {tc.mock && <MockBadge />}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div key={i} className="flex justify-end rise">
            <div className="max-w-xl rounded-2xl rounded-tr-md bg-sunken px-5 py-3.5 text-[15px] leading-relaxed text-ink">
              {t.text}
            </div>
          </div>
        ),
      )}
      {thinking && (
        <div className="max-w-2xl">
          <div className="flex items-center gap-1.5 text-faint">
            <span className="typing-dot size-1.5 rounded-full bg-faint" />
            <span className="typing-dot size-1.5 rounded-full bg-faint" />
            <span className="typing-dot size-1.5 rounded-full bg-faint" />
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
