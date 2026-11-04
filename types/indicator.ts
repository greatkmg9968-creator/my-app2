// Design Ref: §3.1 — 지표 한 건의 구조. 계산·검사·화면이 모두 이 타입을 기준으로 동작한다.
// Plan SC: 작업 1 — 지표 한 건의 데이터 구조(타입) 정의

/**
 * 지표 구분(큰 범주) 네 가지.
 * - 부점/공통: 부점이 자체로 정한 지표인지, 모든 부점에 공통으로 적용되는 지표인지
 * - 계량/비계량: 수치(기준값·목표값·실적값)로 평가하는지, 수치로 나타낼 수 없어 진척률을 직접 입력하는지
 */
export const INDICATOR_CATEGORIES = [
  "부점 계량",
  "부점 비계량",
  "공통 계량",
  "공통 비계량",
] as const;

/** 한 화면에서 다룰 수 있는 지표의 최대 개수 */
export const MAX_INDICATORS = 30;

/** 지표 구분 하나 */
export type IndicatorCategory = (typeof INDICATOR_CATEGORIES)[number];

/** 계량 지표(수치로 평가)면 true, 비계량 지표(진척률 직접 입력)면 false */
export function isQuantitativeCategory(category: IndicatorCategory): boolean {
  return category === "부점 계량" || category === "공통 계량";
}

/** 문자열이 올바른 지표 구분이면 true (엑셀 업로드 등 바깥에서 들어온 값을 검사할 때 쓴다) */
export function isIndicatorCategory(value: string): value is IndicatorCategory {
  return (INDICATOR_CATEGORIES as readonly string[]).includes(value);
}

/**
 * 성과평가 지표 한 건.
 *
 * - 지표 데이터는 앱에 저장하지 않고 브라우저 메모리에서만 다룬다.
 * - 날짜는 "YYYY-MM-DD" 형식의 문자열로 적는다. (예: "2026-10-15")
 * - 퍼센트 값(진척률, 예상달성도)은 0~200 사이 숫자다. (100 = 목표 100% 달성)
 */
export interface Indicator {
  /** 부점. 로그인 계정의 부점(app_metadata)과 같아야 하며 입력 창에서는 자동으로 채운다. */
  branch: string;

  /** 지표 구분(큰 범주): 부점 계량 / 부점 비계량 / 공통 계량 / 공통 비계량. 필터에 사용한다. */
  category: IndicatorCategory;

  /** 지표명 */
  name: string;

  /** 세부 평가항목. 지표 구분 안에서 담당자가 직접 입력한다. */
  item: string;

  /** 평가방법 */
  method: string;

  /** 배점 */
  weight: number;

  /** 기준값(시작값). 수치 지표에만 있다. */
  baseValue?: number;

  /** 목표값. 수치 지표에만 있다. */
  targetValue?: number;

  /** 실적값. 수치 지표에만 있다. */
  actualValue?: number;

  /**
   * 진척률(%).
   * 수치 지표는 항상 기준값·목표값·실적값으로 자동 계산하고,
   * 수치로 나타낼 수 없는 지표(또는 목표값 = 기준값인 지표)만 직접 입력한다.
   * 직접 입력값은 0~200이어야 한다.
   */
  progress?: number;

  /** 예상달성도(%). 필수이며 담당자가 입력한다. 0~200. */
  expected: number;

  /** 보완사항. 부진지표에는 필수다. */
  note?: string;

  /**
   * 평가 기준일. 실적을 집계한 날짜를 적는 표기용이다.
   * 부진 판정에는 쓰지 않고, 판정은 화면의 "자료 기준일"로만 한다.
   */
  evalDate: string;
}
