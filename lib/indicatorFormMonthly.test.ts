// Plan SC: 작업 15·17 — 입력 폼 검사의 집계 방식(누적 / 월말값), 월별 실적, 지표명 중복

import { describe, expect, it } from "vitest";
import {
  actualFromValues,
  checkNoteRequired,
  emptyFormValues,
  validateIndicatorForm,
  valuesFromIndicator,
  type IndicatorFormValues,
} from "./indicatorForm";

const BRANCH = "테스트부점";
// 기준일 2026-10-15는 연중 288일째로 경과율 78.9%다.
const REFERENCE = "2026-10-15";

/** 월별 실적 12칸을 만든다. 앞에서부터 채우고 나머지는 빈칸 */
const months = (...values: (string | number)[]): string[] =>
  Array.from({ length: 12 }, (_, i) => (values[i] === undefined ? "" : String(values[i])));

/** 올바르게 채운 계량 지표 폼 (진척률 60.0%, 보완사항 있음) */
function quantitativeForm(overrides: Partial<IndicatorFormValues> = {}): IndicatorFormValues {
  return {
    ...emptyFormValues(REFERENCE),
    category: "부점 계량",
    name: "수신 잔액 증대",
    item: "수신 잔액(억원)",
    method: "기말 잔액 − 기초 잔액",
    weight: "4",
    baseValue: "1000",
    targetValue: "1500",
    actualValue: "1300",
    expected: "75",
    note: "집중 관리",
    ...overrides,
  };
}

/** 올바르게 채운 비계량 지표 폼 */
function qualitativeForm(overrides: Partial<IndicatorFormValues> = {}): IndicatorFormValues {
  return {
    ...emptyFormValues(REFERENCE),
    category: "공통 비계량",
    name: "내부통제 점검 이행",
    item: "점검 이행 비율",
    method: "이행 항목 ÷ 전체 항목",
    weight: "3",
    progress: "90",
    expected: "95",
    ...overrides,
  };
}

describe("월별 실적 입력 (계량 지표)", () => {
  it("월별 실적을 입력하면 실적값을 비워도 저장되고, 월별 실적 12칸이 그대로 저장된다 (입력 안 한 달은 null)", () => {
    const { errors, indicator } = validateIndicatorForm(
      quantitativeForm({ actualValue: "", monthly: months(100, 120, 130) }),
      BRANCH,
      REFERENCE,
    );
    expect(errors.actualValue).toBeUndefined();
    expect(indicator?.monthly).toEqual([100, 120, 130, ...Array(9).fill(null)]);
    expect(indicator?.actualValue).toBeUndefined();
  });

  it("월별 실적이 없고 실적값도 없으면 둘 중 하나를 입력하라고 안내한다", () => {
    const { errors, indicator } = validateIndicatorForm(quantitativeForm({ actualValue: "" }), BRANCH, REFERENCE);
    expect(errors.actualValue).toContain("월별 실적");
    expect(indicator).toBeNull();
  });

  it("월별 실적과 실적값을 둘 다 입력하면 둘 다 저장한다 (월별 실적이 우선하지만 실적값은 대비용으로 남긴다)", () => {
    const { indicator } = validateIndicatorForm(
      quantitativeForm({ actualValue: "50", monthly: months(10, 20) }),
      BRANCH,
      REFERENCE,
    );
    expect(indicator?.actualValue).toBe(50);
    expect(indicator?.monthly?.slice(0, 2)).toEqual([10, 20]);
  });

  it("숫자가 아닌 달이 있으면 어느 달인지 알려주고 거부한다", () => {
    const { errors, indicator } = validateIndicatorForm(
      quantitativeForm({ monthly: months(100, "많음", 130, "?") }),
      BRANCH,
      REFERENCE,
    );
    expect(errors.monthly).toContain("2월");
    expect(errors.monthly).toContain("4월");
    expect(indicator).toBeNull();
  });

  it("음수 실적과 소수도 받는다", () => {
    const { indicator } = validateIndicatorForm(
      quantitativeForm({ actualValue: "", monthly: months(-5, 2.5) }),
      BRANCH,
      REFERENCE,
    );
    expect(indicator?.monthly?.slice(0, 2)).toEqual([-5, 2.5]);
  });

  it("자료 기준일(10월)까지 입력된 월별 실적이 없고 실적값도 없으면 현재 실적을 구할 수 없다고 알려준다", () => {
    const lateOnly = months("", "", "", "", "", "", "", "", "", "", 100); // 11월만 입력
    const { errors, indicator } = validateIndicatorForm(
      quantitativeForm({ actualValue: "", monthly: lateOnly }),
      BRANCH,
      "2026-10-15",
    );
    expect(errors.monthly).toContain("10월");
    expect(indicator).toBeNull();
    // 기준일을 11월로 옮기면 저장할 수 있다
    expect(
      validateIndicatorForm(quantitativeForm({ actualValue: "", monthly: lateOnly }), BRANCH, "2026-11-20").indicator,
    ).not.toBeNull();
    // 실적값을 함께 입력해도 저장할 수 있다
    expect(
      validateIndicatorForm(quantitativeForm({ actualValue: "5", monthly: lateOnly }), BRANCH, "2026-10-15").indicator,
    ).not.toBeNull();
  });

  it("비계량 지표는 월별 실적을 입력해도 저장하지 않는다", () => {
    const { indicator } = validateIndicatorForm(qualitativeForm({ monthly: months(1, 2, 3) }), BRANCH, REFERENCE);
    expect(indicator?.monthly).toBeUndefined();
  });

  it("월별 실적에서 구한 현재 실적으로 부진을 판단해 보완사항을 요구한다 (월별 합계 500 / 목표 1000 → 50%)", () => {
    const form = quantitativeForm({
      baseValue: "0",
      targetValue: "1000",
      actualValue: "",
      monthly: months(100, 100, 100, 100, 100),
      note: "",
    });
    const check = checkNoteRequired(form, REFERENCE);
    expect(check.required).toBe(true);
    expect(check.message).toContain("50.0%");
    expect(validateIndicatorForm({ ...form, note: "집중 관리" }, BRANCH, REFERENCE).indicator).not.toBeNull();
  });
});

describe("집계 방식", () => {
  it("기본값(누적)은 저장하지 않고, 월말값만 저장한다", () => {
    expect(validateIndicatorForm(quantitativeForm({ aggregation: "cumulative" }), BRANCH).indicator?.aggregation).toBeUndefined();
    expect(validateIndicatorForm(quantitativeForm({ aggregation: "latest" }), BRANCH).indicator?.aggregation).toBe("latest");
    expect(validateIndicatorForm(quantitativeForm({ aggregation: "" }), BRANCH).indicator?.aggregation).toBeUndefined();
  });

  it("올바르지 않은 값은 오류", () => {
    const { errors, indicator } = validateIndicatorForm(quantitativeForm({ aggregation: "평균" }), BRANCH);
    expect(errors.aggregation).toBeDefined();
    expect(indicator).toBeNull();
  });

  it("집계 방식에 따라 월별 실적에서 현재 실적을 다르게 구한다 (10, 20, 30)", () => {
    const base = { baseValue: "0", targetValue: "100", actualValue: "", monthly: months(10, 20, 30) };
    expect(actualFromValues(quantitativeForm({ ...base, aggregation: "cumulative" }), "2026-03-31")).toBe(60);
    expect(actualFromValues(quantitativeForm({ ...base, aggregation: "latest" }), "2026-03-31")).toBe(30);
    expect(actualFromValues(quantitativeForm({ ...base, aggregation: "latest" }), "2026-02-10")).toBe(20);
  });

  it("월별 실적이 없으면 입력한 실적값을 현재 실적으로 쓴다", () => {
    expect(actualFromValues(quantitativeForm({ actualValue: "1300" }), REFERENCE)).toBe(1300);
    expect(actualFromValues(quantitativeForm({ actualValue: "" }), REFERENCE)).toBeNull();
  });

  it("비계량 지표는 집계 방식을 저장하지 않는다", () => {
    expect(validateIndicatorForm(qualitativeForm({ aggregation: "latest" }), BRANCH).indicator?.aggregation).toBeUndefined();
  });
});

describe("지표명 중복", () => {
  it("이미 있는 다른 지표와 같은 이름이면 거부한다 (앞뒤 공백·대소문자는 무시)", () => {
    const { errors, indicator } = validateIndicatorForm(quantitativeForm(), BRANCH, REFERENCE, {
      otherNames: ["다른 지표", " 수신 잔액 증대 "],
    });
    expect(errors.name).toContain("같은 이름");
    expect(indicator).toBeNull();
  });

  it("겹치지 않으면 통과하고, 이름 목록을 주지 않으면 검사하지 않는다", () => {
    expect(validateIndicatorForm(quantitativeForm(), BRANCH, REFERENCE, { otherNames: ["다른 지표"] }).indicator).not.toBeNull();
    expect(validateIndicatorForm(quantitativeForm(), BRANCH, REFERENCE).indicator).not.toBeNull();
  });
});

describe("valuesFromIndicator — 월별 실적과 집계 방식", () => {
  it("월별 실적·월말값이 있는 지표를 폼 값으로 바꿨다가 다시 검사하면 같은 지표가 나온다", () => {
    const original = validateIndicatorForm(
      quantitativeForm({ aggregation: "latest", actualValue: "", monthly: months(1020, 1050, 1080) }),
      BRANCH,
      REFERENCE,
    ).indicator;
    expect(original).not.toBeNull();
    const values = valuesFromIndicator(original!);
    expect(values.aggregation).toBe("latest");
    expect(values.monthly.slice(0, 3)).toEqual(["1020", "1050", "1080"]);
    expect(validateIndicatorForm(values, BRANCH, REFERENCE).indicator).toEqual(original);
  });

  it("빈 폼은 집계 방식이 누적이고 월별 실적 12칸이 모두 비어 있다", () => {
    const empty = emptyFormValues(REFERENCE);
    expect(empty.aggregation).toBe("cumulative");
    expect(empty.monthly).toEqual(Array(12).fill(""));
  });
});
