"use client";

// 에이전트 작업 로그 — 우아한 수직 타임라인 (FR-012). 하네스/툴콜/자가진화 가시화.
// 심사 핵심 신호(agentic/자동/하네스)를 차분한 에디토리얼 타임라인으로 보여준다.
import { useEffect, useRef } from "react";
import type { AgentLog, AgentLogStatus } from "@/lib/contract/types";
import { MockBadge } from "@/components/MockBadge";

const DOT: Record<AgentLogStatus, string> = {
  run: "border-live bg-live/15",
  done: "border-pass bg-pass",
  retry: "border-pressure bg-pressure/20",
  error: "border-err bg-err",
};

export function AgentLogPanel({
  logs,
  title = "에이전트 작업 로그",
  emptyHint = "에이전트 대기 중…",
  className = "",
}: {
  logs: AgentLog[];
  title?: string;
  emptyHint?: string;
  className?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logs.length]);

  return (
    <div
      className={`flex flex-col rounded-2xl border border-line bg-card/70 backdrop-blur-sm overflow-hidden ${className}`}
      role="log"
      aria-live="polite"
      aria-label="에이전트 작업 로그"
    >
      <div className="shrink-0 px-5 py-3.5 border-b border-line flex items-center gap-2">
        <h3 className="font-display text-sm text-ink">{title}</h3>
        <span className="ml-auto text-[11px] text-faint tabular-nums">{logs.length} steps</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {logs.length === 0 ? (
          <p className="text-sm text-faint py-2 leading-relaxed">{emptyHint}</p>
        ) : (
          <ol className="relative">
            {/* 타임라인 라인 */}
            <span className="absolute left-[5px] top-1 bottom-1 w-px bg-line" aria-hidden />
            {logs.map((l, i) => (
              <li key={l.seq ?? i} className="relative pl-6 pb-3.5 last:pb-0 rise">
                <span
                  className={`absolute left-0 top-1 size-[11px] rounded-full border-2 ${DOT[l.status]} ${
                    l.status === "run" || l.status === "retry" ? "dot-live" : ""
                  }`}
                />
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-mono text-[12px] text-ink">{l.step}</span>
                  {l.status === "retry" && (
                    <span className="text-[10px] text-pressure">재시도</span>
                  )}
                  {l.mock && <MockBadge />}
                </div>
                {l.detail && (
                  <p className="mt-0.5 text-[12px] leading-snug text-muted">{l.detail}</p>
                )}
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
