// Design Ref: §7 오류 처리 — 새로고침·창 닫기 직전에 "저장되지 않는다"는 확인 창을 띄운다.
// Plan SC: 작업 6 — "저장 안 됨" 안내와 새로고침·창 닫기 확인 창

"use client";

import { useEffect } from "react";

/**
 * active가 true인 동안, 새로고침·창 닫기·다른 주소로 이동하려 하면 브라우저가 확인 창을 띄운다.
 * (확인 창의 문구는 브라우저가 정하므로 바꿀 수 없다.)
 */
export function useBeforeUnloadWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // 일부 브라우저는 returnValue가 있어야 확인 창을 띄운다.
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [active]);
}
