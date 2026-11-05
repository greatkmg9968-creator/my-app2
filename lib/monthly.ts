// Design Ref: §13 월별 실적 추이 — 그 달 실적을 누적(또는 월말값)으로 바꾸고, 목표 경로와 비교할 값을 만든다.
// Plan SC: 작업 17 — 각 지표 월별 실적 추이 시각화

import { DEFAULT_AGGREGATION, MONTHS_IN_YEAR, type Indicator } from "@/types/indicator";

/** 월별 추이의 한 달 */
export interface MonthPoint {
  /** 1~12 */
  month: number;
  /** 그 달에 입력한 실적. 입력하지 않았으면 null */
  entered: number | null;
  /**
   * 그 달까지의 값. 누적이면 그 달까지 더한 값, 월말값이면 그 달 이전 가장 가까운 입력값.
   * 마지막으로 입력한 달 이후와, 첫 입력 이전은 null
   */
  level: number | null;
  /** 목표 경로: 기준값에서 목표값까지 시간에 비례해 움직일 때 그 달 말에 있어야 하는 값. 수치 지표만 */
  plan: number | null;
}

/** 소수 계산 오차를 줄인다. */
function clean(value: number): number {
  return Number(value.toPrecision(12));
}

/** 월별 실적 12칸을 만든다. 비어 있거나 길이가 맞지 않으면 모두 null로 채운다. */
export function normalizeMonthly(monthly: readonly (number | null)[] | undefined): (number | null)[] {
  return Array.from({ length: MONTHS_IN_YEAR }, (_, index) => {
    const value = monthly?.[index];
    return value === undefined || value === null || !Number.isFinite(value) ? null : value;
  });
}

/**
 * 지표의 월별 추이 12개월을 만든다.
 * 월별 실적이 하나도 없으면 entered·level이 모두 null이고, 목표 경로(plan)만 있다.
 */
export function monthlySeries(indicator: Indicator): MonthPoint[] {
  const entered = normalizeMonthly(indicator.monthly);
  const mode = indicator.aggregation ?? DEFAULT_AGGREGATION;
  // 마지막으로 값을 입력한 달의 위치 (없으면 -1)
  let lastEntered = -1;
  entered.forEach((value, index) => {
    if (value !== null) lastEntered = index;
  });

  const { baseValue, targetValue } = indicator;
  let running = 0;
  let latest: number | null = null;

  return entered.map((value, index) => {
    if (value !== null) {
      running += value;
      latest = value;
    }
    // 첫 입력 이전과 마지막 입력 이후의 달은 값이 없다. 중간에 비어 있는 달은 앞 달의 값을 이어 간다.
    const hasLevel = index <= lastEntered && latest !== null;
    const level = !hasLevel ? null : mode === "cumulative" ? clean(running) : latest;

    const month = index + 1;
    const plan =
      baseValue !== undefined && targetValue !== undefined
        ? clean(baseValue + ((targetValue - baseValue) * month) / MONTHS_IN_YEAR)
        : null;

    return { month, entered: value, level, plan };
  });
}
