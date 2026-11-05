// Design Ref: §12 필요 실적 역산 — 목표를 이루려면 앞으로 얼마가 더 필요한지 거꾸로 계산한다.
// Plan SC: 작업 16 — 각 지표별 목표 달성을 위한 필요 실적 역산
//
// 저장하는 값이 아니라, 지표와 자료 기준일로 매번 계산하는 값이다.

import {
  calcProgress,
  monthOfDate,
  resolveActual,
  resolveProgress,
  calcElapsedRate,
} from "@/lib/calc";
import { DEFAULT_AGGREGATION, MONTHS_IN_YEAR, type Indicator } from "@/types/indicator";

/** 목표까지 필요한 양을 계산한 결과 */
export interface TargetPlan {
  /** quantitative: 수치(계량) 지표라 실적값 기준 / qualitative: 진척률(%) 기준 */
  kind: "quantitative" | "qualitative";
  /** 목표를 이미 이루었는가 */
  achieved: boolean;
  /**
   * 목표를 이루려면 앞으로 더 필요한 양.
   * 수치 지표는 실적값 단위, 진척률 기준은 %p. 이미 이루었으면 0
   */
  remaining: number;
  /** 수치 지표에서 목표 쪽으로 늘려야 하면 increase, 줄여야 하면 decrease. 진척률 기준은 null */
  direction: "increase" | "decrease" | null;
  /** 자료 기준일 이후 남은 개월 수 (12 − 기준월) */
  monthsLeft: number;
  /**
   * 남은 기간에 매달 필요한 양(월평균). 달성 전이고 남은 개월이 있을 때만 구한다.
   * 수치 지표는 집계 방식이 "누적"일 때만 의미가 있어서, "월말값" 지표는 null이다.
   */
  perMonth: number | null;
  /** 지금 시점의 실적(수치 지표) 또는 진척률(%) */
  current: number;
  /** 지금 부진에서 벗어나려면(경과율 선에 닿으려면) 필요한 실적 수준 또는 진척률(%) */
  catchUpLevel: number;
  /** 부진 탈출선까지 더 필요한 양. 이미 넘었으면 0 */
  catchUpRemaining: number;
}

/** 소수 둘째 자리까지 반올림 (부동소수점 오차를 먼저 걷어낸다) */
function round2(value: number): number {
  const rounded = Math.round(Number((Math.abs(value) * 100).toPrecision(12))) / 100;
  return rounded === 0 ? 0 : Math.sign(value) * rounded;
}

/**
 * 목표 달성에 필요한 실적을 역산한다.
 * - 수치(계량) 지표: 목표값까지 남은 양, 남은 달의 월평균 필요량(누적 지표만), 부진 탈출선(경과율에
 *   맞춘 목표 경로)까지 필요한 양
 * - 진척률로 평가하는 지표(비계량, 또는 목표값 = 기준값인 계량 지표): 진척률 100%까지와 부진 탈출선까지
 * 낮을수록 좋은 지표(목표값 < 기준값)는 "줄여야 할 양"으로 계산한다.
 */
export function planToTarget(indicator: Indicator, referenceDate: string): TargetPlan {
  const elapsedRate = calcElapsedRate(referenceDate);
  const monthsLeft = Math.max(0, MONTHS_IN_YEAR - monthOfDate(referenceDate));
  const { baseValue, targetValue } = indicator;
  const actual = resolveActual(indicator, referenceDate);

  const quantitative =
    baseValue !== undefined &&
    targetValue !== undefined &&
    actual !== null &&
    targetValue !== baseValue;

  if (quantitative) {
    const direction = targetValue > baseValue ? "increase" : "decrease";
    const sign = direction === "increase" ? 1 : -1;
    const toGo = sign * (targetValue - actual);
    const achieved = toGo <= 0;
    const remaining = achieved ? 0 : round2(toGo);

    // 경과율에 맞춘 목표 경로 위의 값: 기준값에서 목표값까지 시간에 비례해 움직인다고 본다.
    const catchUpLevel = round2(baseValue + ((targetValue - baseValue) * elapsedRate) / 100);
    const catchUpRemaining = Math.max(0, round2(sign * (catchUpLevel - actual)));

    const cumulative = (indicator.aggregation ?? DEFAULT_AGGREGATION) === "cumulative";
    const perMonth = !achieved && monthsLeft > 0 && cumulative ? round2(remaining / monthsLeft) : null;

    return {
      kind: "quantitative",
      achieved,
      remaining,
      direction,
      monthsLeft,
      perMonth,
      current: round2(actual),
      catchUpLevel,
      catchUpRemaining,
    };
  }

  // 진척률로 평가하는 지표
  const progress = resolveProgress(indicator, referenceDate) ?? 0;
  const achieved = progress >= 100;
  const remaining = achieved ? 0 : round2(100 - progress);
  return {
    kind: "qualitative",
    achieved,
    remaining,
    direction: null,
    monthsLeft,
    perMonth: !achieved && monthsLeft > 0 ? round2(remaining / monthsLeft) : null,
    current: progress,
    catchUpLevel: elapsedRate,
    catchUpRemaining: Math.max(0, round2(elapsedRate - progress)),
  };
}

/** 목표값·기준값·실적을 알면 그 달까지의 진척률을 돌려준다. (월별 추이의 "그 달 진척률"에 쓴다) */
export function progressAtLevel(indicator: Indicator, level: number): number | null {
  if (indicator.baseValue === undefined || indicator.targetValue === undefined) return null;
  return calcProgress(indicator.baseValue, indicator.targetValue, level);
}
