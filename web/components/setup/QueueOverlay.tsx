"use client";

import type { QueueStatus } from "@/lib/contract/types";

// 동시 면접 정원 초과 시 대기 화면 — 순번·예상 대기시간 표시 (slots.py 연동).
export function QueueOverlay({ status, onCancel }: { status: QueueStatus; onCancel: () => void }) {
  const mins = Math.max(1, Math.ceil((status.estimatedWaitSec || 0) / 60));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 backdrop-blur-sm px-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-paper p-8 text-center shadow-2xl rise">
        <div className="mx-auto mb-5 size-10 rounded-full border-2 border-line border-t-accent animate-spin" aria-hidden />
        <h2 className="font-display text-xl text-ink">현재 다른 지원자의 면접이 진행 중입니다</h2>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          면접은 동시에 {status.capacity}명까지 진행돼요. 자리가 나면 <b className="text-ink">자동으로</b> 시작됩니다.
        </p>

        <div className="mt-6 rounded-xl border border-accent/25 bg-accent-soft/50 px-5 py-4">
          <div className="font-display text-3xl text-accent">대기 {status.position}번</div>
          <p className="mt-1 text-xs text-muted">예상 대기 약 {mins}분</p>
        </div>

        <p className="mt-4 text-[11px] text-faint">
          현재 {status.activeCount}/{status.capacity}명 면접 진행 중 · 이 창을 닫지 마세요
        </p>

        <button
          type="button"
          onClick={onCancel}
          className="mt-5 text-xs text-faint hover:text-pressure underline underline-offset-2"
        >
          대기 취소
        </button>
      </div>
    </div>
  );
}
