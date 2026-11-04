// Design Ref: §2.2 — 지표 관리 화면(메인). 지금은 지표 표만 있고, 기준 정보·요약·도구 줄은 뒤 작업에서 더한다.

import AppShell from "@/components/AppShell";
import IndicatorTable from "@/components/IndicatorTable";
import { SAMPLE_BRANCH, SAMPLE_INDICATORS } from "@/lib/sampleData";

export default function Home() {
  return (
    // 로그인(작업 13)·지표 입력(작업 9, 11) 전이라 샘플 지표와 샘플 부점을 임시로 보여준다.
    <AppShell branch={SAMPLE_BRANCH}>
      <h2 className="mb-3 text-base font-semibold">
        지표 현황{" "}
        <span className="font-normal text-foreground/70">
          (전체 {SAMPLE_INDICATORS.length}건)
        </span>
      </h2>
      <IndicatorTable indicators={SAMPLE_INDICATORS} />
    </AppShell>
  );
}
