// 화면에 처음 보이는 샘플(lib/sampleData.ts)이 의도대로 구성됐는지 확인한다.
// (다른 테스트는 흔들리지 않게 예전 30건을 담은 lib/fixtureData.ts를 쓴다)

import { describe, expect, it } from "vitest";
import { INDICATOR_CATEGORIES, isIndicatorCategory, isQuantitativeCategory } from "@/types/indicator";
import { evaluateIndicator, hasMonthlyValues, isInPercentRange } from "./calc";
import { SAMPLE_BRANCH, SAMPLE_INDICATORS, SAMPLE_REFERENCE_DATE } from "./sampleData";

const results = SAMPLE_INDICATORS.map((indicator) => ({
  indicator,
  evaluation: evaluateIndicator(indicator, SAMPLE_REFERENCE_DATE),
}));

const byCategory = (category: string) => SAMPLE_INDICATORS.filter((i) => i.category === category);

describe("화면용 샘플 지표", () => {
  it("부점 이름은 캠코인재개발원이고 모든 지표가 같은 부점이다", () => {
    expect(SAMPLE_BRANCH).toBe("캠코인재개발원");
    expect(SAMPLE_INDICATORS.every((i) => i.branch === SAMPLE_BRANCH)).toBe(true);
  });

  it("부점 계량은 요청한 지표 3개와 배점이다", () => {
    expect(byCategory("부점 계량").map((i) => [i.name, i.weight])).toEqual([
      ["연수시설의 합리적 운영", 10],
      ["AI 역량 강화를 위한 노력과 성과", 8],
      ["지식경영, 아이디어 제안 활성화 성과", 7],
    ]);
  });

  it("부점 비계량은 요청한 지표 3개와 배점이다", () => {
    expect(byCategory("부점 비계량").map((i) => [i.name, i.weight])).toEqual([
      ["조직 및 인적자원관리", 30],
      ["안전 및 재난관리", 15],
      ["상생,협력 및 지역발전", 12],
    ]);
  });

  it("네 가지 지표 구분이 모두 들어 있고, 지표명이 겹치지 않으며, 번호가 서로 다르다", () => {
    expect(SAMPLE_INDICATORS.every((i) => isIndicatorCategory(i.category))).toBe(true);
    expect([...new Set(SAMPLE_INDICATORS.map((i) => i.category))].sort()).toEqual([...INDICATOR_CATEGORIES].sort());
    expect(new Set(SAMPLE_INDICATORS.map((i) => i.name)).size).toBe(SAMPLE_INDICATORS.length);
    expect(new Set(SAMPLE_INDICATORS.map((i) => i.id)).size).toBe(SAMPLE_INDICATORS.length);
  });

  it("최대 30개보다 적어서 지표를 더 추가할 수 있다", () => {
    expect(SAMPLE_INDICATORS.length).toBeLessThan(30);
  });

  it("계량은 기준·목표·(실적 또는 월별 실적)이 있고, 비계량은 수치 없이 진척률을 직접 입력한다", () => {
    for (const i of SAMPLE_INDICATORS) {
      if (isQuantitativeCategory(i.category)) {
        expect(i.baseValue).toBeDefined();
        expect(i.targetValue).toBeDefined();
        expect(i.actualValue !== undefined || hasMonthlyValues(i)).toBe(true);
      } else {
        expect(i.progress).toBeDefined();
        expect(i.baseValue).toBeUndefined();
        expect(i.actualValue).toBeUndefined();
      }
    }
  });

  it("월별 실적 샘플 2건(월말값 1건, 누적 1건)이 있고 현재 실적은 기준일(10월)까지의 값이다", () => {
    const withMonthly = SAMPLE_INDICATORS.filter(hasMonthlyValues);
    expect(withMonthly).toHaveLength(2);
    const actualOf = (name: string) => results.find((r) => r.indicator.name === name)?.evaluation.actual;
    expect(actualOf("연수시설의 합리적 운영")).toBe(75); // 월말값
    expect(actualOf("AI 역량 강화를 위한 노력과 성과")).toBe(360); // 누적
  });

  it("예상달성도와 직접 입력한 진척률이 0~200 안이고, 부진지표는 모두 보완사항이 있다", () => {
    for (const { indicator, evaluation } of results) {
      expect(isInPercentRange(indicator.expected)).toBe(true);
      if (indicator.progress !== undefined) expect(isInPercentRange(indicator.progress)).toBe(true);
      if (evaluation.status === "delayed") expect((indicator.note ?? "").trim()).not.toBe("");
    }
  });

  it("정상과 부진이 섞여 있고 개선조치·추진과제 샘플이 들어 있다", () => {
    const delayed = results.filter((r) => r.evaluation.status === "delayed").length;
    expect(delayed).toBeGreaterThan(0);
    expect(delayed).toBeLessThan(SAMPLE_INDICATORS.length);
    expect(SAMPLE_INDICATORS.filter((i) => (i.actions ?? []).length > 0).length).toBeGreaterThanOrEqual(3);
    expect(SAMPLE_INDICATORS.filter((i) => (i.tasks ?? []).length > 0).length).toBeGreaterThanOrEqual(3);
  });
});
