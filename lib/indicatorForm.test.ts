// Plan SC: 작업 9 — 직접 입력 폼의 검사 규칙. 지표 구분 네 가지에 따라 입력해야 하는 칸이 달라진다.

import { describe, expect, it } from "vitest";
import {
  emptyFormValues,
  needsDirectProgress,
  parseNumber,
  validateIndicatorForm,
  valuesFromIndicator,
  type IndicatorFormValues,
} from "./indicatorForm";

const BRANCH = "테스트부점";

/** 올바르게 채운 계량 지표 폼. 필요한 칸만 덮어써서 쓴다. */
function quantitativeForm(overrides: Partial<IndicatorFormValues> = {}): IndicatorFormValues {
  return {
    ...emptyFormValues("2026-10-15"),
    category: "부점 계량",
    name: "수신 잔액 증대",
    item: "수신 잔액(억원)",
    method: "기말 잔액 − 기초 잔액",
    weight: "4",
    baseValue: "1000",
    targetValue: "1500",
    actualValue: "1300",
    expected: "75",
    ...overrides,
  };
}

/** 올바르게 채운 비계량 지표 폼 */
function qualitativeForm(overrides: Partial<IndicatorFormValues> = {}): IndicatorFormValues {
  return {
    ...emptyFormValues("2026-10-15"),
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

describe("parseNumber", () => {
  it("숫자, 음수, 소수, 천 단위 쉼표, 앞뒤 공백을 읽는다", () => {
    expect(parseNumber("1500")).toBe(1500);
    expect(parseNumber("-4")).toBe(-4);
    expect(parseNumber("0.9")).toBe(0.9);
    expect(parseNumber("1,200")).toBe(1200);
    expect(parseNumber("  50 ")).toBe(50);
  });
  it("비었거나 숫자가 아니면 null", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("12abc")).toBeNull();
    expect(parseNumber("Infinity")).toBeNull();
  });
});

describe("validateIndicatorForm — 지표 구분 네 가지", () => {
  it.each(["부점 계량", "공통 계량"] as const)("%s: 기준·목표·실적값으로 지표가 만들어지고 진척률은 저장하지 않는다", (category) => {
    const { errors, indicator } = validateIndicatorForm(quantitativeForm({ category }), BRANCH);
    expect(errors).toEqual({});
    expect(indicator).toMatchObject({
      branch: BRANCH,
      category,
      baseValue: 1000,
      targetValue: 1500,
      actualValue: 1300,
      weight: 4,
      expected: 75,
      evalDate: "2026-10-15",
    });
    expect(indicator?.progress).toBeUndefined();
  });

  it.each(["부점 비계량", "공통 비계량"] as const)("%s: 진척률을 직접 입력하고 수치 칸은 저장하지 않는다", (category) => {
    const { errors, indicator } = validateIndicatorForm(
      qualitativeForm({
        category,
        // 계량 칸에 값이 남아 있어도 비계량이면 버린다.
        baseValue: "1",
        targetValue: "2",
        actualValue: "3",
      }),
      BRANCH,
    );
    expect(errors).toEqual({});
    expect(indicator).toMatchObject({ category, progress: 90, expected: 95 });
    expect(indicator?.baseValue).toBeUndefined();
    expect(indicator?.targetValue).toBeUndefined();
    expect(indicator?.actualValue).toBeUndefined();
  });

  it("지표 구분을 고르지 않았거나 이름이 틀리면 오류", () => {
    for (const category of ["", "영업", "부점계량"]) {
      const { errors, indicator } = validateIndicatorForm(quantitativeForm({ category }), BRANCH);
      expect(errors.category).toBe("지표 구분을 선택해 주세요.");
      expect(indicator).toBeNull();
    }
  });
});

describe("validateIndicatorForm — 세부 평가항목과 글자 칸", () => {
  it("세부 평가항목은 지표 구분과 별개로 직접 입력해야 하고, 앞뒤 공백은 지운다", () => {
    const { indicator } = validateIndicatorForm(
      quantitativeForm({ name: "  수신  ", item: "  신규 법인 예금 잔액  ", method: " 기말−기초 " }),
      BRANCH,
    );
    expect(indicator).toMatchObject({ name: "수신", item: "신규 법인 예금 잔액", method: "기말−기초" });
  });
  it("지표명·세부 평가항목·평가방법이 비어 있으면 오류", () => {
    const { errors } = validateIndicatorForm(
      quantitativeForm({ name: " ", item: "", method: "  " }),
      BRANCH,
    );
    expect(errors.name).toBeDefined();
    expect(errors.item).toBe("세부 평가항목을 입력해 주세요.");
    expect(errors.method).toBeDefined();
  });
  it("보완사항은 비어 있어도 되고, 적으면 저장한다", () => {
    expect(validateIndicatorForm(quantitativeForm(), BRANCH).indicator?.note).toBeUndefined();
    expect(
      validateIndicatorForm(quantitativeForm({ note: " 4분기 집중 " }), BRANCH).indicator?.note,
    ).toBe("4분기 집중");
  });
});

describe("validateIndicatorForm — 숫자 칸", () => {
  it("배점은 0보다 큰 숫자여야 한다", () => {
    for (const weight of ["", "0", "-1", "abc"]) {
      expect(validateIndicatorForm(quantitativeForm({ weight }), BRANCH).errors.weight).toBeDefined();
    }
  });
  it("예상달성도는 0~200이어야 한다 (0과 200은 허용)", () => {
    for (const expected of ["", "-0.1", "200.1", "abc"]) {
      expect(validateIndicatorForm(quantitativeForm({ expected }), BRANCH).errors.expected).toBeDefined();
    }
    for (const expected of ["0", "200"]) {
      expect(validateIndicatorForm(quantitativeForm({ expected }), BRANCH).errors.expected).toBeUndefined();
    }
  });
  it("계량 지표는 기준값·목표값·실적값이 모두 숫자여야 한다 (음수 허용)", () => {
    const { errors } = validateIndicatorForm(
      quantitativeForm({ baseValue: "", targetValue: "abc", actualValue: "" }),
      BRANCH,
    );
    expect(errors.baseValue).toBeDefined();
    expect(errors.targetValue).toBeDefined();
    expect(errors.actualValue).toBeDefined();
    expect(
      validateIndicatorForm(quantitativeForm({ actualValue: "-4" }), BRANCH).indicator?.actualValue,
    ).toBe(-4);
  });
  it("비계량 지표의 진척률은 0~200 숫자여야 한다", () => {
    for (const progress of ["", "-1", "201", "abc"]) {
      expect(validateIndicatorForm(qualitativeForm({ progress }), BRANCH).errors.progress).toBeDefined();
    }
    expect(validateIndicatorForm(qualitativeForm({ progress: "200" }), BRANCH).errors.progress).toBeUndefined();
  });
  it("평가 기준일은 실제로 있는 날짜여야 한다", () => {
    for (const evalDate of ["", "2026-02-30", "abc"]) {
      expect(validateIndicatorForm(quantitativeForm({ evalDate }), BRANCH).errors.evalDate).toBeDefined();
    }
  });
});

describe("계량 지표에서 목표값 = 기준값인 경우", () => {
  it("진척률을 직접 입력해야 한다고 알려준다", () => {
    const values = quantitativeForm({ baseValue: "10", targetValue: "10", actualValue: "12" });
    expect(needsDirectProgress(values)).toBe(true);
    const { errors, indicator } = validateIndicatorForm(values, BRANCH);
    expect(errors.progress).toContain("자동 계산할 수 없습니다");
    expect(indicator).toBeNull();
  });
  it("진척률을 직접 입력하면 그 값을 저장한다", () => {
    const { errors, indicator } = validateIndicatorForm(
      quantitativeForm({ baseValue: "10", targetValue: "10", actualValue: "12", progress: "60" }),
      BRANCH,
    );
    expect(errors).toEqual({});
    expect(indicator?.progress).toBe(60);
  });
  it("목표값과 기준값이 다르면 직접 입력이 필요 없다", () => {
    expect(needsDirectProgress(quantitativeForm())).toBe(false);
    expect(needsDirectProgress(qualitativeForm())).toBe(true);
    expect(needsDirectProgress(emptyFormValues("2026-10-15"))).toBe(false);
  });
});

describe("valuesFromIndicator (수정할 때 폼에 채울 값)", () => {
  it("지표를 폼 값으로 바꿨다가 다시 검사하면 같은 지표가 나온다", () => {
    const original = validateIndicatorForm(quantitativeForm({ note: "메모" }), BRANCH).indicator;
    expect(original).not.toBeNull();
    const again = validateIndicatorForm(valuesFromIndicator(original!), BRANCH).indicator;
    expect(again).toEqual(original);

    const manual = validateIndicatorForm(qualitativeForm(), BRANCH).indicator;
    expect(validateIndicatorForm(valuesFromIndicator(manual!), BRANCH).indicator).toEqual(manual);
  });
});
