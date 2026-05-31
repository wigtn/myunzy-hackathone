"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// 헤더 '사용법' → 60초 가이드 모달. 심사위원이 혼자서도 막힘없이 쓰도록.
const STEPS = [
  {
    n: "01",
    t: "서류 올리기 — 또는 ‘샘플로 체험’",
    d: "이력서·자소서를 여러 장 올립니다. 지금 서류가 없으면 ‘샘플로 체험’ 한 번이면 끝.",
  },
  {
    n: "02",
    t: "면접관이 자동으로 만들어집니다",
    d: "실제 채용공고를 끌어와 기술·컬처핏·임원·HR 4인 면접관 패널을 생성합니다.",
  },
  {
    n: "03",
    t: "음성 또는 텍스트로 답변",
    d: "면접관이 내 이력서와 공고를 근거로 꼬리질문하며 압박합니다. 마이크가 없으면 텍스트로.",
  },
  {
    n: "04",
    t: "라운드 종료 → 판정",
    d: "한 라운드를 마치면 ‘라운드 종료·판정’으로 다차원 점수·머뭇거림·근거 피드백을 받습니다.",
  },
  {
    n: "05",
    t: "다음 라운드 — 이어서, 더 날카롭게",
    d: "‘다음 라운드’를 누르면 같은 면접이 이어집니다. 면접관이 직전 라운드에서 드러난 약점을 더 집중 공략해요(자가진화). 판정 화면의 ‘이 답변 다시’로 특정 순간을 다르게 재시뮬할 수도 있어요.",
  },
];

const JUDGE_POINTS = [
  ["작업 로그 패널", "에이전트가 스스로 OCR→공고수집→약점분석→면접관생성하는 과정이 우측에 실시간으로 펼쳐집니다."],
  ["세션 내 자가진화", "라운드가 지날수록 면접관이 내 약점을 더 집중 공략합니다. 약점 before/after diff로 확인."],
  ["근거 있는 피드백", "막연한 총평이 아니라 프레임워크·타임스탬프로 ‘왜 부족했는지’를 짚습니다."],
];

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 포털 대상(document.body)은 클라이언트에서만 — SSR 가드.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] text-muted hover:text-accent transition-colors underline-offset-4 hover:underline"
      >
        사용법
      </button>

      {open &&
        mounted &&
        createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="면지 사용법"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-ink/30 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl my-6 rounded-2xl border border-line bg-paper card-soft rise"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="닫기"
              className="absolute right-4 top-4 size-8 rounded-full text-faint hover:text-ink hover:bg-sunken transition grid place-items-center"
            >
              ✕
            </button>

            <div className="px-7 sm:px-9 pt-8 pb-7">
              <p className="text-xs uppercase tracking-[0.2em] text-accent">60초 가이드</p>
              <h2 className="mt-2 font-display text-2xl sm:text-3xl text-ink">면지, 이렇게 써보세요</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                내 이력서와 실제 채용공고로 만든 AI 면접관과 모의면접 → 머뭇거림·근거까지 짚는 피드백.
                <br className="hidden sm:block" />
                로그인 없이 바로, 올린 서류는 세션이 끝나면 폐기됩니다.
              </p>

              {/* 단계 */}
              <ol className="mt-6 space-y-px rounded-xl overflow-hidden border border-line bg-line/60">
                {STEPS.map((s) => (
                  <li key={s.n} className="flex gap-4 bg-card px-5 py-4">
                    <span className="font-display text-sm text-accent shrink-0 pt-0.5">{s.n}</span>
                    <div>
                      <h3 className="font-display text-base text-ink">{s.t}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{s.d}</p>
                    </div>
                  </li>
                ))}
              </ol>

              {/* 심사 포인트 */}
              <div className="mt-6 rounded-xl border border-accent/25 bg-accent-soft/50 px-5 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-accent">심사하실 때 보면 좋은 곳</p>
                <ul className="mt-3 space-y-2.5">
                  {JUDGE_POINTS.map(([t, d]) => (
                    <li key={t} className="text-sm leading-relaxed">
                      <span className="text-ink font-medium">{t}</span>
                      <span className="text-muted"> — {d}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/setup?sample=1"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper hover:bg-accent transition-colors"
                >
                  샘플로 바로 체험
                  <span aria-hidden>→</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm text-muted hover:text-ink transition-colors px-2"
                >
                  닫고 둘러보기
                </button>
              </div>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
