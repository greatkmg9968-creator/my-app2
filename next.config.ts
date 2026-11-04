import type { NextConfig } from "next";

/**
 * 모든 쪽에 붙이는 보안 헤더. (로그인이 없는 공개 화면이므로 기본적인 것만 둔다)
 * - nosniff: 브라우저가 파일 종류를 멋대로 추측하지 못하게 한다.
 * - X-Frame-Options: 다른 사이트가 이 화면을 자기 쪽에 끼워 넣는 것을 막는다.
 * - Referrer-Policy: 다른 사이트로 이동할 때 이 화면의 주소 전체를 알려주지 않는다.
 * - Permissions-Policy: 이 앱이 쓰지 않는 카메라·마이크·위치 기능을 꺼 둔다.
 * (CSP는 Next.js의 인라인 스크립트와 맞추는 설정이 필요해 이번에는 두지 않았다)
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // 응답 헤더에서 "Next.js로 만들었다"는 표시(X-Powered-By)를 지운다.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
