// Design Ref: §2.3 지표 입력 창 — 입력한 글자를 검사해 지표 한 건으로 바꾼다. 화면(폼)은 이 함수의 결과만 쓴다.
// Plan SC: 작업 9 — 지표 직접 입력 폼. 지표 구분은 부점 계량 / 부점 비계량 / 공통 계량 / 공통 비계량 중 하나를 고른다.
//
// 계량 지표: 기준값·목표값·실적값을 입력하면 진척률을 자동 계산한다.
//   (목표값 = 기준값이라 계산할 수 없을 때만 진척률을 직접 입력한다.)
// 비계량 지표: 수치로 나타낼 수 없으므로 진척률을 직접 입력한다.
// Plan SC: 작업 10 — 부진지표는 개선, 추진사항이 필수다. 목표값을 바꾸면 진척률은 저장해 둔 값이 아니라
//          바뀐 목표값으로 매번 다시 계산하므로, 이전 목표값 기준의 진척률이 남지 않는다.
// Plan SC: 작업 15·17 — 계량 지표는 집계 방식(누적 / 월말값)과 월별 실적(그 달 실적 12칸)을 입력할 수 있다.
//          월별 실적이 있으면 자료 기준일이 속한 달까지의 값으로 현재 실적을 자동으로 구한다.
//
// 이 검사가 만드는 지표에는 id·개선조치·추진과제·첨부파일 정보가 없다. (그건 입력 폼이 아니라 세부 화면에서
// 다루는 값이라, 수정할 때는 부르는 쪽에서 기존 지표의 값을 이어 붙인다.)

import {
  aggregateMonthly,
  calcElapsedRate,
  calcProgress,
  isDelayed,
  isInPercentRange,
  isValidDateString,
  monthOfDate,
} from "@/lib/calc";
import { formatPercent } from "@/lib/format";
import {
  DEFAULT_AGGREGATION,
  MONTHS_IN_YEAR,
  isIndicatorCategory,
  isQuantitativeCategory,
  type AggregationMode,
  type Indicator,
} from "@/types/indicator";

/** 폼에서 입력한 값. 숫자도 입력 중에는 글자이므로 모두 문자열로 다룬다. */
export interface IndicatorFormValues {
  category: string;
  name: string;
  item: string;
  method: string;
  weight: string;
  baseValue: string;
  targetValue: string;
  actualValue: string;
  /** "cumulative"(누적) 또는 "latest"(월말값). 비어 있으면 누적으로 본다. */
  aggregation: string;
  /** 1~12월의 "그 달 실적" 12칸 (비워 둔 달은 빈 글자) */
  monthly: string[];
  progress: string;
  expected: string;
  note: string;
  evalDate: string;
}

/** 칸별 오류 문구. 오류가 없는 칸은 없다. (월별 실적 오류는 monthly 하나에 모아서 적는다) */
export type IndicatorFormErrors = Partial<Record<keyof IndicatorFormValues, string>>;

/** 검사 결과. 오류가 하나도 없으면 indicator가 채워지고, 하나라도 있으면 null */
export interface IndicatorFormResult {
  errors: IndicatorFormErrors;
  indicator: Indicator | null;
}

/** 새 지표를 입력할 때의 빈 폼. 평가 기준일은 화면의 자료 기준일로 미리 채워 둔다. */
export function emptyFormValues(evalDate: string): IndicatorFormValues {
  return {
    category: "",
    name: "",
    item: "",
    method: "",
    weight: "",
    baseValue: "",
    targetValue: "",
    actualValue: "",
    aggregation: DEFAULT_AGGREGATION,
    monthly: Array.from({ length: MONTHS_IN_YEAR }, () => ""),
    progress: "",
    expected: "",
    note: "",
    evalDate,
  };
}

function toText(value: number | undefined | null): string {
  return value === undefined || value === null ? "" : String(value);
}

/** 이미 있는 지표를 수정할 때 폼에 채울 값 */
export function valuesFromIndicator(indicator: Indicator): IndicatorFormValues {
  return {
    category: indicator.category,
    name: indicator.name,
    item: indicator.item,
    method: indicator.method,
    weight: toText(indicator.weight),
    baseValue: toText(indicator.baseValue),
    targetValue: toText(indicator.targetValue),
    actualValue: toText(indicator.actualValue),
    aggregation: indicator.aggregation ?? DEFAULT_AGGREGATION,
    monthly: Array.from({ length: MONTHS_IN_YEAR }, (_, index) => toText(indicator.monthly?.[index])),
    progress: toText(indicator.progress),
    expected: toText(indicator.expected),
    note: indicator.note ?? "",
    evalDate: indicator.evalDate,
  };
}

/**
 * 글자를 숫자로 바꾼다. 천 단위 쉼표와 앞뒤 공백은 무시한다.
 * 비어 있거나 숫자가 아니면 null
 */
export function parseNumber(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** 집계 방식 글자를 읽는다. 비어 있으면 기본값(누적), 올바르지 않으면 null */
export function parseAggregation(text: string): AggregationMode | null {
  const cleaned = text.trim();
  if (cleaned === "") return DEFAULT_AGGREGATION;
  return cleaned === "cumulative" || cleaned === "latest" ? cleaned : null;
}

/** 월별 실적 12칸을 숫자(입력 안 한 달과 숫자가 아닌 칸은 null)로 바꾼다. */
export function monthlyNumbers(values: IndicatorFormValues): (number | null)[] {
  return Array.from({ length: MONTHS_IN_YEAR }, (_, index) => parseNumber(values.monthly[index] ?? ""));
}

/** 월별 실적 칸이 하나라도 채워져 있으면 true (숫자가 아닌 글자를 적은 칸도 채워진 것으로 본다) */
export function hasMonthlyText(values: IndicatorFormValues): boolean {
  return values.monthly.some((text) => text.trim() !== "");
}

/**
 * 입력한 값으로 "현재 실적"을 알아낸다.
 * 월별 실적이 있으면 자료 기준일이 속한 달까지의 값(집계 방식에 따라 누적 또는 월말값)을 쓰고,
 * 없으면 직접 입력한 실적값을 쓴다. 아직 알 수 없으면 null
 */
export function actualFromValues(values: IndicatorFormValues, referenceDate?: string): number | null {
  const mode = parseAggregation(values.aggregation);
  if (referenceDate !== undefined && isValidDateString(referenceDate) && mode !== null) {
    const monthly = monthlyNumbers(values);
    if (monthly.some((value) => value !== null)) {
      const aggregated = aggregateMonthly(monthly, mode, monthOfDate(referenceDate));
      if (aggregated !== null) return aggregated;
    }
  }
  return parseNumber(values.actualValue);
}

/** 계량 지표인데 목표값과 기준값이 같아 진척률을 자동 계산할 수 없는지 */
function isTargetEqualToBase(values: IndicatorFormValues): boolean {
  const base = parseNumber(values.baseValue);
  const target = parseNumber(values.targetValue);
  return base !== null && target !== null && base === target;
}

/**
 * 진척률을 직접 입력해야 하는지.
 * - 비계량 지표는 항상 직접 입력한다.
 * - 계량 지표는 목표값 = 기준값일 때만 직접 입력한다. (그 밖에는 자동 계산)
 */
export function needsDirectProgress(values: IndicatorFormValues): boolean {
  if (!isIndicatorCategory(values.category)) return false;
  if (!isQuantitativeCategory(values.category)) return true;
  return isTargetEqualToBase(values);
}

/** 개선, 추진사항 필수 검사 결과 */
export interface NoteCheck {
  /** true면 부진지표인데 개선, 추진사항이 비어 있어 저장할 수 없다. */
  required: boolean;
  /** 사용자에게 보여줄 안내 문구. required가 false면 null */
  message: string | null;
}

/**
 * 입력한 값으로 진척률을 알아낸다. (아직 알 수 없으면 null)
 * - 계량 지표(목표값 ≠ 기준값): 기준값·목표값·현재 실적(월별 실적에서 구한 값 포함)으로 자동 계산
 * - 그 밖: 직접 입력한 진척률 (숫자가 아니면 null)
 */
export function progressFromValues(values: IndicatorFormValues, referenceDate?: string): number | null {
  if (!isIndicatorCategory(values.category)) return null;
  if (isQuantitativeCategory(values.category) && !needsDirectProgress(values)) {
    const base = parseNumber(values.baseValue);
    const target = parseNumber(values.targetValue);
    const actual = actualFromValues(values, referenceDate);
    if (base === null || target === null || actual === null) return null;
    return calcProgress(base, target, actual);
  }
  return parseNumber(values.progress);
}

/**
 * 부진지표는 개선, 추진사항이 필수다. 입력한 값이 부진지표인데 개선, 추진사항이 비어 있으면 required를 true로 돌려준다.
 * 진척률이나 자료 기준일을 아직 알 수 없으면(입력 중) 판단하지 않고 required는 false다.
 * @param referenceDate 화면의 자료 기준일. 이 날짜의 경과율로 부진 여부를 판단한다.
 */
export function checkNoteRequired(values: IndicatorFormValues, referenceDate: string): NoteCheck {
  const none: NoteCheck = { required: false, message: null };
  if (values.note.trim() !== "") return none;
  if (!isValidDateString(referenceDate)) return none;

  const progress = progressFromValues(values, referenceDate);
  if (progress === null) return none;

  const elapsedRate = calcElapsedRate(referenceDate);
  if (!isDelayed(progress, elapsedRate)) return none;

  return {
    required: true,
    message: `부진지표입니다. (진척률 ${formatPercent(progress)} < 경과율 ${formatPercent(elapsedRate)}) 개선, 추진사항을 입력해 주세요.`,
  };
}

/** 검사에 곁들이는 정보 */
export interface ValidateOptions {
  /** 이미 있는 다른 지표들의 이름. 같은 이름이면 저장할 수 없다. (수정할 때는 자기 자신의 이름을 빼고 준다) */
  otherNames?: readonly string[];
}

/**
 * 입력한 값을 검사해 지표 한 건으로 바꾼다.
 * @param values 폼에 입력한 값
 * @param branch 화면에 입력한 부점 이름. 폼에서 입력받지 않고 자동으로 넣는다.
 * @param referenceDate 화면의 자료 기준일. 주면 부진지표의 개선, 추진사항 필수 검사도 하고,
 *                      월별 실적에서 그 달까지의 현재 실적을 구할 수 있는지도 확인한다.
 */
export function validateIndicatorForm(
  values: IndicatorFormValues,
  branch: string,
  referenceDate?: string,
  options: ValidateOptions = {},
): IndicatorFormResult {
  const errors: IndicatorFormErrors = {};

  // 지표 구분 (큰 범주)
  const category = values.category;
  if (!isIndicatorCategory(category)) {
    errors.category = "지표 구분을 선택해 주세요.";
  }

  // 글자 칸 (세부 평가항목은 지표 구분 안에서 직접 입력한다)
  const name = values.name.trim();
  const item = values.item.trim();
  const method = values.method.trim();
  if (name === "") errors.name = "지표명을 입력해 주세요.";
  else if (
    (options.otherNames ?? []).some((other) => other.trim().toLowerCase() === name.toLowerCase())
  ) {
    errors.name = "같은 이름의 지표가 이미 있습니다. 다른 이름으로 적어 주세요.";
  }
  if (item === "") errors.item = "세부 평가항목을 입력해 주세요.";
  if (method === "") errors.method = "평가방법을 입력해 주세요.";

  // 배점
  const weight = parseNumber(values.weight);
  if (weight === null || weight <= 0) {
    errors.weight = "배점은 0보다 큰 숫자로 입력해 주세요.";
  }

  // 예상달성도
  const expected = parseNumber(values.expected);
  if (expected === null || !isInPercentRange(expected)) {
    errors.expected = "예상달성도를 0~200 사이 숫자로 입력해 주세요.";
  }

  // 평가 기준일
  if (!isValidDateString(values.evalDate)) {
    errors.evalDate = "평가 기준일을 올바른 날짜로 선택해 주세요.";
  }

  // 계량 / 비계량에 따라 달라지는 칸
  const quantitative = isIndicatorCategory(category) && isQuantitativeCategory(category);
  const baseValue = parseNumber(values.baseValue);
  const targetValue = parseNumber(values.targetValue);
  const actualValue = parseNumber(values.actualValue);
  const progress = parseNumber(values.progress);
  const directProgress = needsDirectProgress(values);
  const aggregation = parseAggregation(values.aggregation);

  // 월별 실적 (계량 지표만, 숫자가 아닌 칸이 있으면 어느 달인지 알려준다)
  let monthly: (number | null)[] | null = null;
  if (quantitative) {
    const badMonths = values.monthly
      .map((text, index) => (text.trim() !== "" && parseNumber(text) === null ? index + 1 : 0))
      .filter((month) => month > 0);
    if (badMonths.length > 0) {
      errors.monthly = `월별 실적은 숫자로 입력해 주세요. (${badMonths.map((m) => `${m}월`).join(", ")})`;
    } else if (hasMonthlyText(values)) {
      monthly = monthlyNumbers(values);
    }
    if (aggregation === null) errors.aggregation = "집계 방식은 누적 / 월말값 중 하나여야 합니다.";
  }

  if (quantitative) {
    if (baseValue === null) errors.baseValue = "기준값을 숫자로 입력해 주세요.";
    if (targetValue === null) errors.targetValue = "목표값을 숫자로 입력해 주세요.";
    // 월별 실적이 있으면 실적값은 비워 둘 수 있다. (월별 실적에서 현재 실적을 구한다)
    if (actualValue === null && monthly === null && !errors.monthly) {
      errors.actualValue = "실적값을 숫자로 입력하거나 월별 실적을 입력해 주세요.";
    }
    // 월별 실적을 입력했는데 자료 기준일까지 입력된 달이 없고 실적값도 없으면 현재 실적을 구할 수 없다.
    if (
      monthly !== null &&
      actualValue === null &&
      referenceDate !== undefined &&
      isValidDateString(referenceDate) &&
      aggregation !== null &&
      aggregateMonthly(monthly, aggregation, monthOfDate(referenceDate)) === null
    ) {
      errors.monthly = `자료 기준일(${monthOfDate(referenceDate)}월)까지 입력된 월별 실적이 없어 현재 실적을 구할 수 없습니다. 그 달까지의 실적을 입력하거나 실적값을 함께 입력해 주세요.`;
    }
  }
  if (directProgress && (progress === null || !isInPercentRange(progress))) {
    errors.progress = quantitative
      ? "목표값과 기준값이 같아 자동 계산할 수 없습니다. 진척률을 0~200 사이 숫자로 직접 입력해 주세요."
      : "진척률을 0~200 사이 숫자로 입력해 주세요.";
  }

  // 부진지표는 개선, 추진사항이 필수
  if (referenceDate !== undefined) {
    const noteCheck = checkNoteRequired(values, referenceDate);
    if (noteCheck.required) errors.note = noteCheck.message ?? undefined;
  }

  if (Object.keys(errors).length > 0 || !isIndicatorCategory(category)) {
    return { errors, indicator: null };
  }

  const note = values.note.trim();
  const common = {
    branch,
    category,
    name,
    item,
    method,
    weight: weight as number,
    expected: expected as number,
    evalDate: values.evalDate,
    ...(note !== "" ? { note } : {}),
  };

  const indicator: Indicator = quantitative
    ? {
        ...common,
        baseValue: baseValue as number,
        targetValue: targetValue as number,
        ...(actualValue !== null ? { actualValue } : {}),
        // 기본값(누적)이 아닐 때만 집계 방식을 저장한다.
        ...(aggregation === "latest" ? { aggregation } : {}),
        ...(monthly !== null ? { monthly } : {}),
        // 자동 계산할 수 있으면 진척률은 저장하지 않고, 계산할 수 없을 때만 직접 입력한 값을 둔다.
        ...(directProgress ? { progress: progress as number } : {}),
      }
    : { ...common, progress: progress as number };

  return { errors, indicator };
}
