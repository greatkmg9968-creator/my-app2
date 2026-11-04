// Design Ref: §2.2 ① 상단 바 — 서비스 이름 · 내 부점 (로그아웃 버튼은 작업 13에서 추가)
// Plan SC: 작업 4 — 기본 화면 틀 (공통 레이아웃, 제목, 메뉴)

import type { ReactNode } from "react";

/** 서비스 이름. 상단 바와 브라우저 탭 제목에서 같은 이름을 쓴다. */
export const SERVICE_NAME = "부점 성과지표 관리";

interface AppShellProps {
  /** 로그인한 사용자의 부점. 로그인 기능(작업 13) 전에는 없을 수 있다. */
  branch?: string;
  /** 화면 본문 */
  children: ReactNode;
}

/**
 * 로그인 후 화면이 공통으로 쓰는 틀: 위쪽에 상단 바, 아래쪽에 본문 영역.
 * 로그인 화면은 상단 바가 필요 없으므로 이 틀을 쓰지 않는다.
 */
export default function AppShell({ branch, children }: AppShellProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-black/10 bg-background dark:border-white/15">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <h1 className="text-lg font-semibold tracking-tight">{SERVICE_NAME}</h1>
          <p className="text-sm text-foreground/70">
            내 부점:{" "}
            <span className="font-medium text-foreground">
              {branch ?? "(로그인 전)"}
            </span>
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
