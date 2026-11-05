// Design Ref: §3.3 — 계산 규칙을 한곳에 모은다. 화면을 모른 채 단독으로 동작해야 한다.
// Plan SC: 작업 2 — 진척률, 일 단위 경과율, 부진지표 판정, 0~200 범위 검증

import {
  DEFAULT_AGGREGATION,
  MONTHS_IN_YEAR,
  type Indicator,
} from "@/types/indicator";

/** 진척률·예상달성도가 가질 수 있는 최솟값(%) */
export const PERCENT_MIN = 0;

/** 진척률·예상달성도가 가질 수 있는 최댓값(%). 목표 초과 달성을 200%까지 허용한다. */
export const PERCENT_MAX = 200;

/** 부진 판정 결과. delayed는 진척률이 경과율보다 낮은 부진(= 보완이 필요한) 지표다. */
export type IndicatorStatus = "delayed" | "normal";

/** 지표 한 건을 자료 기준일로 평가한 결과 */
export interface IndicatorEvaluation {
  /** 진척률(%) */
  progress: number;
  /** 화면에 표시할 진척률. 0~200으로 잘라 표시한다. */
  displayProgress: number;
  /** 자료 기준일의 경과율(%) */
  elapsedRate: number;
  /** 부진 여부 */
  status: IndicatorStatus;
  /** 진척률 − 경과율(%p). 부진이면 음수 */
  gap: number;
  /**
   * 자료 기준일 시점의 실적값. 월별 실적이 있으면 거기서 구한 값이고, 없으면 입력한 실적값이다.
   * 수치로 평가하지 않는 지표(비계량)는 null이다.
   */
  actual: number | null;
}

/**
 * 소수 첫째 자리까지 반올림한다. (0.5는 올림, 음수는 절댓값 기준으로 반올림)
 * toPrecision으로 부동소수점 오차(예: 11.499999999999998)를 먼저 걷어낸다.
 */
export function round1(value: number): number {
  const rounded = Math.round(Number((Math.abs(value) * 10).toPrecision(12))) / 10;
  // -0이 되지 않도록 0이면 그대로 0을 돌려준다.
  return rounded === 0 ? 0 : Math.sign(value) * rounded;
}

/**
 * 진척률(%) = (실적값 − 기준값) ÷ (목표값 − 기준값) × 100, 소수 첫째 자리 반올림.
 * 높을수록/낮을수록 좋은 지표 모두 같은 식을 쓴다.
 * 목표값 = 기준값이면 분모가 0이라 계산하지 않고 null("직접 입력 필요")을 돌려준다.
 */
export function calcProgress(
  baseValue: number,
  targetValue: number,
  actualValue: number,
): number | null {
  const denominator = targetValue - baseValue;
  if (denominator === 0) return null;
  return round1(((actualValue - baseValue) / denominator) * 100);
}

/** 윤년이면 true */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Date를 "YYYY-MM-DD" 문자열로 바꾼다. (그 컴퓨터의 현지 날짜 기준) */
export function toDateString(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "YYYY-MM-DD" 문자열을 연·월·일로 나눈다. 없는 날짜(예: 2026-02-30)면 RangeError */
function parseDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new RangeError(`날짜 형식이 올바르지 않습니다: "${date}" (YYYY-MM-DD)`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError(`존재하지 않는 날짜입니다: "${date}"`);
  }
  return { year, month, day };
}

/** "YYYY-MM-DD" 날짜가 몇 월인지(1~12). 올바르지 않은 날짜면 RangeError */
export function monthOfDate(date: string): number {
  return parseDate(date).month;
}

/** "YYYY-MM-DD" 형식의 실제로 있는 날짜면 true */
export function isValidDateString(date: string): boolean {
  try {
    parseDate(date);
    return true;
  } catch {
    return false;
  }
}

/**
 * 경과율(%) = 연중 일수 ÷ 연간 일수 × 100, 소수 첫째 자리 반올림.
 * 연중 일수는 1월 1일을 1일째로 센다. 연간 일수는 평년 365, 윤년 366이다.
 * (예: 2026-10-15는 288일째 → 78.9%)
 */
export function calcElapsedRate(date: string): number {
  const { year, month, day } = parseDate(date);
  const dayOfYear =
    (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000 + 1;
  const daysInYear = isLeapYear(year) ? 366 : 365;
  return round1((dayOfYear / daysInYear) * 100);
}

/**
 * 부진지표 판정: 진척률 < 경과율이면 true. 같으면 정상(false).
 * 화면에 보이는 숫자와 판정이 같도록, 둘 다 소수 첫째 자리로 반올림한 값으로 비교한다.
 */
export function isDelayed(progress: number, elapsedRate: number): boolean {
  return round1(progress) < round1(elapsedRate);
}

/** 차이(%p) = 진척률 − 경과율. 둘 다 반올림한 값으로 계산하며 부진이면 음수다. */
export function calcGap(progress: number, elapsedRate: number): number {
  return round1(round1(progress) - round1(elapsedRate));
}

/**
 * 보완사항이 빠진 부진지표인지. 부진지표는 보완사항을 반드시 적어야 하므로, 부진인데 비어 있으면 true다.
 * 공백만 적은 경우도 비어 있는 것으로 본다.
 */
export function hasMissingNote(indicator: Indicator, status: IndicatorStatus): boolean {
  return status === "delayed" && (indicator.note ?? "").trim() === "";
}

/** 0~200 범위 안의 숫자면 true. NaN·무한대는 false. (직접 입력값 검증에 쓴다) */
export function isInPercentRange(value: number): boolean {
  return Number.isFinite(value) && value >= PERCENT_MIN && value <= PERCENT_MAX;
}

/** 화면 표시용으로 0~200 밖의 값을 잘라낸다. 저장하는 값은 바꾸지 않는다. */
export function clampForDisplay(value: number): number {
  return Math.min(PERCENT_MAX, Math.max(PERCENT_MIN, value));
}

/**
 * 월별 실적에서 "자료 기준일이 속한 달까지"의 현재 실적을 구한다.
 * - 누적: 입력한 달들의 실적을 모두 더한다.
 * - 월말값: 입력한 달 중 가장 늦은 달의 값을 그대로 쓴다.
 * 기준일이 속한 달 이후에 입력한 값은 쓰지 않는다. 그 달까지 입력한 값이 하나도 없으면 null이다.
 * @param monthly 1~12월의 "그 달 실적". 입력하지 않은 달은 null
 */
export function aggregateMonthly(
  monthly: readonly (number | null)[],
  mode: Indicator["aggregation"],
  referenceMonth: number,
): number | null {
  const upTo = monthly.slice(0, Math.min(referenceMonth, MONTHS_IN_YEAR));
  const entered = upTo.filter((value): value is number => value !== null && Number.isFinite(value));
  if (entered.length === 0) return null;

  if ((mode ?? DEFAULT_AGGREGATION) === "latest") {
    return entered[entered.length - 1];
  }
  // 소수 계산 오차(0.1 + 0.2 = 0.30000000000000004)를 줄인다.
  return Number(entered.reduce((sum, value) => sum + value, 0).toPrecision(12));
}

/** 월별 실적이 하나라도 입력되어 있으면 true */
export function hasMonthlyValues(indicator: Pick<Indicator, "monthly">): boolean {
  return (indicator.monthly ?? []).some((value) => value !== null && Number.isFinite(value));
}

/**
 * 지표의 "현재 실적"을 정한다. (수치로 평가하지 않는 지표는 null)
 * - 월별 실적이 있고 자료 기준일까지 입력된 값이 있으면 거기서 구한다.
 * - 그렇지 않으면 직접 입력한 실적값을 쓴다.
 * @param referenceDate 자료 기준일. 주지 않으면 월별 실적은 쓰지 않고 실적값만 쓴다.
 */
export function resolveActual(indicator: Indicator, referenceDate?: string): number | null {
  if (referenceDate !== undefined && indicator.monthly && hasMonthlyValues(indicator)) {
    const aggregated = aggregateMonthly(
      indicator.monthly,
      indicator.aggregation,
      monthOfDate(referenceDate),
    );
    if (aggregated !== null) return aggregated;
  }
  return indicator.actualValue ?? null;
}

/**
 * 지표의 진척률을 정한다.
 * - 기준값·목표값·실적(월별 실적에서 구한 값 포함)이 모두 있는 수치 지표는 올린/입력한 진척률과
 *   관계없이 항상 다시 계산한다.
 * - 수치 지표인데 목표값 = 기준값이면 계산할 수 없으므로 직접 입력한 진척률을 쓴다.
 * - 수치로 나타낼 수 없는 지표는 직접 입력한 진척률을 쓴다.
 * - 쓸 수 있는 값이 없으면 null을 돌려준다. (입력 규칙상 만들 수 없는 지표라 예외적인 경우다)
 */
export function resolveProgress(indicator: Indicator, referenceDate?: string): number | null {
  const { baseValue, targetValue, progress } = indicator;
  const actual = resolveActual(indicator, referenceDate);
  if (baseValue !== undefined && targetValue !== undefined && actual !== null) {
    const calculated = calcProgress(baseValue, targetValue, actual);
    if (calculated !== null) return calculated;
  }
  return progress ?? null;
}

/**
 * 지표 한 건을 자료 기준일로 평가한다.
 * 진척률을 알 수 없는 지표는 입력 규칙상 만들 수 없다. 혹시 그런 자료가 들어오면 진행이 없는 것(0%)으로 본다.
 */
export function evaluateIndicator(
  indicator: Indicator,
  referenceDate: string,
): IndicatorEvaluation {
  const elapsedRate = calcElapsedRate(referenceDate);
  const progress = resolveProgress(indicator, referenceDate) ?? 0;

  return {
    progress,
    displayProgress: clampForDisplay(progress),
    elapsedRate,
    status: isDelayed(progress, elapsedRate) ? "delayed" : "normal",
    gap: calcGap(progress, elapsedRate),
    actual: indicator.baseValue === undefined ? null : resolveActual(indicator, referenceDate),
  };
}
