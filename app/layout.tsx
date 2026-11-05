import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_KR, Sora } from "next/font/google";
import "./globals.css";

// 영문·숫자용 Sora(가변 굵기)와 한글용 Noto Sans KR. 어두운 배경에서 또렷하고 단정한 글꼴이다.
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
});

const notoKr = Noto_Sans_KR({
  variable: "--font-noto-kr",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "성과지표 통합 대시보드",
  description:
    "부점평가 담당자가 성과평가 지표의 진척률·예상달성도·보완사항을 한 화면에서 확인하는 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${sora.variable} ${notoKr.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
