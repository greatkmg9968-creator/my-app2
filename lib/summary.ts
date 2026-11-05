// Design Ref: §2.2 대시보드 — 지표 구분 네 가지마다 정상·보완(부진) 지표의 개수와 비율을 센다.
// Plan SC: 작업 14 — 성과지표 통합 대시보드(게이지형 도넛). 달성율은 만들지 않는다. (세부 지표에서 확인)

import { round1 } from "@/lib/calc";
import type { IndicatorRow } from "@/lib/filterSort";
import { INDICATOR_CATEGORIES, type IndicatorCategory } from "@/types/indicator";

/** 지표 구분 하나의 정상·보완 요약 */
export interface CategorySummary {
  category: IndicatorCategory;
  /** 이 구분의 지표 수 */
  total: number;
  /** 정상 지표 수 (진척률이 경과율 이상) */
  normal: number;
  /** 보완이 필요한 지표 수 (= 부진지표, 진척률이 경과율보다 낮음) */
  delayed: number;
  /** 정상 비율(%). 지표가 없으면 null */
  normalRate: number | null;
  /** 보완 비율(%). 정상 비율과 합하면 항상 100. 지표가 없으면 null */
  delayedRate: number | null;
}

/** 지표 구분 네 가지(정해진 순서)마다 정상·보완 개수와 비율을 계산한다. 지표가 없는 구분도 total 0으로 포함한다. */
export function summarizeByCategory(rows: IndicatorRow[]): CategorySummary[] {
  return INDICATOR_CATEGORIES.map((category) => {
    const inCategory = rows.filter((row) => row.indicator.category === category);
    const delayed = inCategory.filter((row) => row.evaluation.status === "delayed").length;
    const total = inCategory.length;
    const normal = total - delayed;
    const normalRate = total === 0 ? null : round1((normal / total) * 100);
    return {
      category,
      total,
      normal,
      delayed,
      normalRate,
      // 두 비율의 합이 반올림 때문에 99.9나 100.1이 되지 않게 한쪽을 나머지로 정한다.
      delayedRate: normalRate === null ? null : round1(100 - normalRate),
    };
  });
}
