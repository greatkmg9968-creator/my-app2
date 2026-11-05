// Design Ref: §2.2 ① 상단 바 — 서비스 이름. (로그인을 만들지 않으므로 로그아웃 버튼과 로그인 정보는 없다)
// Plan SC: 작업 4 — 기본 화면 틀 (공통 레이아웃, 제목, 메뉴)

import type { ReactNode } from "react";

/** 서비스 이름. 상단 바와 브라우저 탭 제목에서 같은 이름을 쓴다. */
export const SERVICE_NAME = "성과지표 통합 대시보드";

interface AppShellProps {
  /** 화면 본문 */
  children: ReactNode;
}

/** 화면이 공통으로 쓰는 틀: 위쪽에 상단 바, 아래쪽에 본문 영역. */
export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0A0A0B]/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <h1 className="text-gradient text-xl font-semibold tracking-tight">{SERVICE_NAME}</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1800px] flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
