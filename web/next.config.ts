import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // BFF는 §5.1 REST 계약을 그대로 노출. 외부 에이전트 서비스 주소는 env로 주입.
  // 워크스페이스 루트를 web 디렉터리로 고정. 홈(C:\Users\KJM)에 떠돌이 package-lock.json이 있어
  // Next가 루트를 홈으로 오인 → dev 워커가 홈 전체 트리를 감시하다 크래시
  // ("Jest worker ... exceeding retry limit") + 페이지 500. root 고정으로 차단.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
