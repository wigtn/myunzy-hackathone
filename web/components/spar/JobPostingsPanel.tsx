"use client";

import type { JobPosting } from "@/lib/contract/types";

// 분석한 실제 채용공고를 카드로 노출 → "진짜 로켓펀치 공고 기반"임을 클릭으로 증명.
export function JobPostingsPanel({
  postings,
  className = "",
}: {
  postings?: JobPosting[];
  className?: string;
}) {
  if (!postings || postings.length === 0) return null;
  return (
    <section className={className}>
      <h3 className="text-xs uppercase tracking-[0.15em] text-faint mb-2">
        분석한 채용공고 <span className="text-faint/60">({postings.length})</span>
      </h3>
      <div className="space-y-2.5">
        {postings.map((p, i) => (
          <article key={i} className="rounded-xl border border-line bg-card px-3.5 py-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-muted truncate">{p.company || "회사 미상"}</p>
                <p className="text-sm text-ink font-medium leading-snug">{p.title || "채용공고"}</p>
              </div>
              <span
                className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                  p.mock ? "bg-line/60 text-faint" : "bg-accent-soft text-accent"
                }`}
              >
                {p.mock ? "예시" : "실제 공고"}
              </span>
            </div>

            {p.required.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {p.required.slice(0, 5).map((r, j) => (
                  <span
                    key={j}
                    className="rounded-md border border-line bg-paper px-1.5 py-0.5 text-[10px] text-muted"
                  >
                    {r}
                  </span>
                ))}
              </div>
            )}

            {p.url && (
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
              >
                로켓펀치에서 보기 ↗
              </a>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
