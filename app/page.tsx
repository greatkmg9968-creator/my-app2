// Design Ref: §2.2 — 성과지표 통합 대시보드(메인). 지표 구분별 도넛과, 눌러서 아래로 펼치는 세부 지표가 있다.

import AppShell from "@/components/AppShell";
import DashboardLoader from "@/components/DashboardLoader";

export default function Home() {
  return (
    // 이 컴퓨터의 브라우저에 저장해 둔 자료가 있으면 그것으로, 처음이면 샘플 부점 이름과 샘플 지표 30건으로 시작한다.
    // 화면에서 "전체 지우기"로 샘플을 지운 뒤 부점 이름을 바꾸고 직접 입력할 수 있다.
    <AppShell>
      <DashboardLoader />
    </AppShell>
  );
}
