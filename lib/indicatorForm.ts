// Design Ref: §2.3 지표 입력 창 — 입력한 글자를 검사해 지표 한 건으로 바꾼다. 화면(폼)은 이 함수의 결과만 쓴다.
// Plan SC: 작업 9 — 지표 직접 입력 폼. 지표 구분은 부점 계량 / 부점 비계량 / 공통 계량 / 공통 비계량 중 하나를 고른다.
//
// 계량 지표: 기준값·목표값·실적값을 입력하면 진척률을 자동 계산한다.
//   (목표값 = 기준값이라 계산할 수 없을 때만 진척률을 직접 입력한다.)
// 비계량 지표: 수치로 나타낼 수 없으므로 진척률을 직접 입력한다.
// 보완사항 필수 검사(부진지표)와 목표값 변경 재계산은 작업 10에서 더한다.

import { isInPercentRange, isValidDateString } from "@/lib/calc";
import {
  isIndicatorCategory,
  isQuantitativeCategory,
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
  progress: string;
  expected: string;
  note: string;
  evalDate: string;
}

/** 칸별 오류 문구. 오류가 없는 칸은 없다. */
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
    progress: "",
    expected: "",
    note: "",
    evalDate,
  };
}

function toText(value: number | undefined): string {
  return value === undefined ? "" : String(value);
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

/**
 * 입력한 값을 검사해 지표 한 건으로 바꾼다.
 * @param values 폼에 입력한 값
 * @param branch 로그인한 사용자의 부점. 폼에서 입력받지 않고 자동으로 넣는다.
 */
export function validateIndicatorForm(
  values: IndicatorFormValues,
  branch: string,
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

  if (quantitative) {
    if (baseValue === null) errors.baseValue = "기준값을 숫자로 입력해 주세요.";
    if (targetValue === null) errors.targetValue = "목표값을 숫자로 입력해 주세요.";
    if (actualValue === null) errors.actualValue = "실적값을 숫자로 입력해 주세요.";
  }
  if (directProgress && (progress === null || !isInPercentRange(progress))) {
    errors.progress = quantitative
      ? "목표값과 기준값이 같아 자동 계산할 수 없습니다. 진척률을 0~200 사이 숫자로 직접 입력해 주세요."
      : "진척률을 0~200 사이 숫자로 입력해 주세요.";
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
        actualValue: actualValue as number,
        // 자동 계산할 수 있으면 진척률은 저장하지 않고, 계산할 수 없을 때만 직접 입력한 값을 둔다.
        ...(directProgress ? { progress: progress as number } : {}),
      }
    : { ...common, progress: progress as number };

  return { errors, indicator };
}
