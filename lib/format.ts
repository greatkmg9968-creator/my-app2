// Design Ref: §2.2 ⑤ — 표에 보이는 숫자 모양을 한곳에서 정한다.
// Plan SC: 작업 5 — 지표 통합 현황 화면 (표)

/** 값이 없을 때 표에 보여주는 표시 */
export const EMPTY_MARK = "-";

/** 목표·실적 같은 일반 숫자: 천 단위 쉼표, 소수는 최대 2자리까지. 값이 없으면 "-" */
export function formatNumber(value: number | undefined): string {
  if (value === undefined) return EMPTY_MARK;
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

/** 퍼센트: 소수 첫째 자리까지 항상 보여준다. (예: 87.5%, 50.0%) */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
