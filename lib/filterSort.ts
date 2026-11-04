// Design Ref: §2.2 ④ 도구 줄 — 필터(부진지표만, 지표 구분별)와 정렬(진척률, 차이(%p), 지표명, 배점)
// Plan SC: 작업 8 — 필터·정렬. 보이는 목록만 바뀔 뿐 원래 지표 데이터는 바뀌지 않는다.

import type { IndicatorEvaluation } from "@/lib/calc";
import type { Indicator } from "@/types/indicator";

/** 표 한 줄: 지표와, 자료 기준일로 평가한 결과 */
export interface IndicatorRow {
  indicator: Indicator;
  evaluation: IndicatorEvaluation;
}

/** 정렬 기준. "default"는 지표를 등록한 순서 그대로 둔다. */
export type SortKey = "default" | "progress" | "gap" | "name" | "weight";

/** 정렬 방향 */
export type SortDirection = "asc" | "desc";

/** 필터 조건 */
export interface RowFilters {
  /** true면 부진지표만 보여준다. */
  delayedOnly: boolean;
  /** 보여줄 지표 구분. 빈 문자열이면 모든 구분을 보여준다. */
  category: string;
}

/** 필터를 하나도 켜지 않은 상태 */
export const NO_FILTERS: RowFilters = { delayedOnly: false, category: "" };

/** 필터가 하나라도 켜져 있으면 true */
export function hasActiveFilters(filters: RowFilters): boolean {
  return filters.delayedOnly || filters.category !== "";
}

/** 조건에 맞는 줄만 남긴다. 원래 순서는 유지한다. */
export function filterRows(rows: IndicatorRow[], filters: RowFilters): IndicatorRow[] {
  return rows.filter(({ indicator, evaluation }) => {
    if (filters.delayedOnly && evaluation.status !== "delayed") return false;
    if (filters.category !== "" && indicator.category !== filters.category) return false;
    return true;
  });
}

/** 지표 구분 목록. 처음 나온 순서대로, 중복 없이 돌려준다. */
export function uniqueCategories(rows: IndicatorRow[]): string[] {
  return [...new Set(rows.map((row) => row.indicator.category))];
}

/** 정렬에 쓸 값. 진척률·차이를 알 수 없는(판정 보류) 줄은 null */
function sortValue(row: IndicatorRow, key: Exclude<SortKey, "default">): number | string | null {
  switch (key) {
    case "progress":
      return row.evaluation.progress;
    case "gap":
      return row.evaluation.gap;
    case "name":
      return row.indicator.name;
    case "weight":
      return row.indicator.weight;
  }
}

/**
 * 정렬한 새 목록을 돌려준다. (원래 목록은 바꾸지 않는다)
 * - 값이 같으면 원래 순서를 유지한다.
 * - 값을 알 수 없는 줄(판정 보류)은 방향과 관계없이 항상 맨 뒤에 둔다.
 * - 지표명은 한글 가나다 순이다.
 */
export function sortRows(
  rows: IndicatorRow[],
  key: SortKey,
  direction: SortDirection,
): IndicatorRow[] {
  if (key === "default") return [...rows];

  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const valueA = sortValue(a, key);
    const valueB = sortValue(b, key);

    if (valueA === null && valueB === null) return 0;
    if (valueA === null) return 1;
    if (valueB === null) return -1;

    if (typeof valueA === "string" && typeof valueB === "string") {
      return sign * valueA.localeCompare(valueB, "ko");
    }
    return sign * (Number(valueA) - Number(valueB));
  });
}
