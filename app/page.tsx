// Design Ref: §2.2 — 지표 관리 화면(메인). 기준 정보·요약 카드·지표 입력·필터·정렬·지표 표가 있다.

import AppShell from "@/components/AppShell";
import IndicatorDashboard from "@/components/IndicatorDashboard";
import { SAMPLE_BRANCH, SAMPLE_INDICATORS } from "@/lib/sampleData";

export default function Home() {
  return (
    // 로그인이 없으므로 부점 이름은 화면에서 직접 입력한다. 처음에는 샘플 부점 이름과 샘플 지표 30건을 보여주고,
    // 화면에서 "전체 지우기"로 샘플을 지운 뒤 부점 이름을 바꾸고 직접 입력할 수 있다.
    <AppShell>
      <IndicatorDashboard initialIndicators={SAMPLE_INDICATORS} initialBranch={SAMPLE_BRANCH} />
    </AppShell>
  );
}
