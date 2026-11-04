// Design Ref: §2.2 — 지표 관리 화면(메인). 지금은 기준 정보·요약 카드·지표 표가 있고, 도구 줄은 뒤 작업에서 더한다.

import AppShell from "@/components/AppShell";
import IndicatorDashboard from "@/components/IndicatorDashboard";
import { SAMPLE_BRANCH, SAMPLE_INDICATORS } from "@/lib/sampleData";

export default function Home() {
  return (
    // 로그인(작업 13)·지표 입력(작업 9, 11) 전이라 샘플 지표와 샘플 부점을 임시로 보여준다.
    <AppShell branch={SAMPLE_BRANCH}>
      <IndicatorDashboard indicators={SAMPLE_INDICATORS} />
    </AppShell>
  );
}
