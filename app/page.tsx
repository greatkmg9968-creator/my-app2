// Design Ref: §2.2 — 지표 관리 화면(메인). 지금은 화면 틀만 있고, 표는 작업 5에서 채운다.

import AppShell from "@/components/AppShell";
import { SAMPLE_BRANCH, SAMPLE_INDICATORS } from "@/lib/sampleData";

export default function Home() {
  return (
    // 로그인 기능(작업 13) 전이라 샘플 부점을 임시로 보여준다.
    <AppShell branch={SAMPLE_BRANCH}>
      <section
        aria-label="지표 현황 자리"
        className="rounded-lg border border-dashed border-black/20 p-8 text-center dark:border-white/25"
      >
        <p className="text-base font-medium">지표 현황 화면이 들어올 자리입니다.</p>
        <p className="mt-2 text-sm text-foreground/70">
          개발 확인용 샘플 지표 {SAMPLE_INDICATORS.length}건이 준비되어 있습니다.
        </p>
      </section>
    </AppShell>
  );
}
