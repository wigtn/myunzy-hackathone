"use client";

import { useRef, useState } from "react";

// 이력서/자소서 멀티 드롭존: pdf/png/jpg, 장당 ≤10MB, 여러 장. drag&drop + 파일선택.
export function Dropzone({
  files,
  onFiles,
  error,
  disabled = false,
}: {
  files: File[];
  onFiles: (f: File[]) => void;
  error?: string;
  disabled?: boolean;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function add(list: FileList | null) {
    if (disabled || !list || !list.length) return; // 분석 중 변경 차단
    const incoming = Array.from(list);
    // 이름+크기 기준 중복 제거 후 누적
    const merged = [...files];
    for (const f of incoming) {
      if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
    }
    onFiles(merged);
  }

  function remove(idx: number) {
    onFiles(files.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <label htmlFor="resume-input" className="block text-sm text-ink mb-2">
        이력서 · 자소서 <span className="text-accent">*</span>
        <span className="ml-2 text-xs text-faint font-normal">여러 장 올릴 수 있어요</span>
      </label>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="서류 파일 드롭 또는 선택"
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files); // add()가 disabled 가드
        }}
        className={`rounded-2xl border border-dashed px-5 py-9 text-center transition ${
          disabled
            ? "cursor-not-allowed opacity-50 border-line bg-card"
            : error
              ? "cursor-pointer border-err bg-err/5"
              : drag
                ? "cursor-pointer border-accent bg-accent-soft"
                : "cursor-pointer border-line bg-card hover:border-accent/60 hover:bg-accent-soft/40"
        }`}
      >
        <input
          ref={inputRef}
          id="resume-input"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          multiple
          disabled={disabled}
          className="sr-only"
          onChange={(e) => add(e.target.files)}
        />
        <div className="text-muted">
          <span className="text-ink font-medium">파일을 끌어다 놓거나</span> 클릭해 선택
          <div className="mt-1 text-xs text-faint">PDF 권장 · PNG/JPG · 장당 최대 10MB · 다중 선택</div>
        </div>
      </div>

      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-sm"
            >
              <span className="text-accent" aria-hidden>
                ◷
              </span>
              <span className="flex-1 truncate text-ink">{f.name}</span>
              <span className="text-xs text-faint tabular-nums">{(f.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) remove(i);
                }}
                aria-label={`${f.name} 제거`}
                className="text-faint hover:text-err transition-colors px-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-sm text-err">{error}</p>}
    </div>
  );
}
