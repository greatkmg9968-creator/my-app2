// NEURAL 소개 화면. 영상 배경과 "대시보드 열기" 버튼이 있고, 실제 지표 화면은 /dashboard 에 있다.

import { Sora } from "next/font/google";
import NeuralLanding from "@/components/NeuralLanding";

// Sora 가변 글꼴(굵기 100~800). 명세의 424·506·531 같은 소수 굵기를 쓰려면 가변 축 글꼴이어야 한다.
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "block",
});

export default function Home() {
  return (
    <div className={sora.variable} style={{ display: "contents" }}>
      <NeuralLanding />
    </div>
  );
}
