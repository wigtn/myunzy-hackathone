import type { Metadata } from "next";
import { Noto_Serif_KR } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

// 명조 헤드라인 (Editorial) — Korean serif. 본문은 시스템 sans.
const notoSerif = Noto_Serif_KR({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-noto-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "면지 (面zy) — 한 번뿐인 면접, 실전처럼 미리 겪어라",
  description:
    "내 이력서와 실제 채용공고로 만들어진 AI 면접관과 모의면접 → 머뭇거림·근거까지 짚는 피드백.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={notoSerif.variable}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
