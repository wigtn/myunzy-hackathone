import Link from "next/link";
import { HelpButton } from "@/components/HelpButton";

// 라이트 에디토리얼 셸 + 미니 헤더 (명조 로고 + 사용법 + 세션 상태 dot). 전 페이지 공유.
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <header className="h-14 shrink-0 flex items-center px-5 sm:px-8 gap-4 border-b border-line/70 bg-paper/70 backdrop-blur-md z-20">
        <Link href="/" className="flex items-baseline gap-2 group">
          <span className="font-display text-lg text-ink">면지</span>
          <span className="font-serif text-sm text-faint group-hover:text-accent transition-colors">
            面zy
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-4 sm:gap-5">
          <HelpButton />
          <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-faint tracking-wide">
            <span className="size-1.5 rounded-full bg-pass dot-live" />
            interview sparring
          </span>
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
    </div>
  );
}
