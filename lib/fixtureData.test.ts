// Plan SC: 성공 기준 1(30건), 작업 3(부진/정상/초과 달성 섞기) — 샘플이 의도대로 구성됐는지 확인한다.

import { describe, expect, it } from "vitest";
import {
  INDICATOR_CATEGORIES,
  isIndicatorCategory,
  isQuantitativeCategory,
} from "@/types/indicator";
import { evaluateIndicator, hasMonthlyValues, isInPercentRange } from "./calc";
import {
  SAMPLE_BRANCH,
  SAMPLE_INDICATORS,
  SAMPLE_REFERENCE_DATE,
} from "./fixtureData";

const results = SAMPLE_INDICATORS.map((indicator) => ({
  indicator,
  evaluation: evaluateIndicator(indicator, SAMPLE_REFERENCE_DATE),
}));

function count(status: "delayed" | "normal"): number {
  return results.filter((r) => r.evaluation.status === status).length;
}

describe("샘플 지표 30건", () => {
  it("정확히 30건이고 모두 같은 부점이다", () => {
    expect(SAMPLE_INDICATORS).toHaveLength(30);
    expect(SAMPLE_INDICATORS.every((i) => i.branch === SAMPLE_BRANCH)).toBe(true);
  });

  it("필수 칸이 모두 채워져 있다", () => {
    for (const i of SAMPLE_INDICATORS) {
      expect(i.category).not.toBe("");
      expect(i.name).not.toBe("");
      expect(i.item).not.toBe("");
      expect(i.method).not.toBe("");
      expect(i.weight).toBeGreaterThan(0);
      expect(i.evalDate).toBe(SAMPLE_REFERENCE_DATE);
    }
  });

  it("지표명이 겹치지 않는다", () => {
    const names = new Set(SAMPLE_INDICATORS.map((i) => i.name));
    expect(names.size).toBe(30);
  });

  it("지표 구분은 올바른 네 가지 중 하나이고, 네 가지가 모두 들어 있다", () => {
    expect(SAMPLE_INDICATORS.every((i) => isIndicatorCategory(i.category))).toBe(true);
    const categories = new Set(SAMPLE_INDICATORS.map((i) => i.category));
    expect([...categories].sort()).toEqual([...INDICATOR_CATEGORIES].sort());
  });

  it("계량 지표는 기준값·목표값과 (실적값 또는 월별 실적)이 있고, 비계량 지표는 수치 없이 진척률을 직접 입력한다", () => {
    for (const i of SAMPLE_INDICATORS) {
      if (isQuantitativeCategory(i.category)) {
        expect(i.baseValue).toBeDefined();
        expect(i.targetValue).toBeDefined();
        expect(i.actualValue !== undefined || hasMonthlyValues(i)).toBe(true);
      } else {
        expect(i.progress).toBeDefined();
        expect(i.baseValue).toBeUndefined();
        expect(i.targetValue).toBeUndefined();
        expect(i.actualValue).toBeUndefined();
      }
    }
  });

  it("배점 합계가 100이다", () => {
    const total = SAMPLE_INDICATORS.reduce((sum, i) => sum + i.weight, 0);
    expect(total).toBe(100);
  });

  it("예상달성도와 직접 입력한 진척률이 모두 0~200 범위 안이다", () => {
    for (const i of SAMPLE_INDICATORS) {
      expect(isInPercentRange(i.expected)).toBe(true);
      if (i.progress !== undefined) expect(isInPercentRange(i.progress)).toBe(true);
    }
  });

  it("기준일 2026-10-15(경과율 78.9%)에서 부진 11건·정상 19건이다 (판정 보류는 없다)", () => {
    expect(count("delayed")).toBe(11);
    expect(count("normal")).toBe(19);
    expect(count("delayed") + count("normal")).toBe(30);
  });

  it("진척률을 직접 입력하는 계량 지표(목표값 = 기준값)는 진척률이 입력되어 있다", () => {
    const direct = SAMPLE_INDICATORS.filter(
      (i) => isQuantitativeCategory(i.category) && i.baseValue === i.targetValue,
    );
    expect(direct.length).toBeGreaterThanOrEqual(2);
    expect(direct.every((i) => i.progress !== undefined)).toBe(true);
  });

  it("지표마다 번호(id)가 있고 서로 다르다", () => {
    const ids = SAMPLE_INDICATORS.map((i) => i.id);
    expect(ids.every((id) => typeof id === "string" && id !== "")).toBe(true);
    expect(new Set(ids).size).toBe(30);
  });

  it("월별 실적이 있는 샘플이 4건이고, 월말값 방식이 2건 들어 있다", () => {
    const withMonthly = SAMPLE_INDICATORS.filter(hasMonthlyValues);
    expect(withMonthly).toHaveLength(4);
    expect(withMonthly.filter((i) => i.aggregation === "latest")).toHaveLength(2);
    for (const i of withMonthly) expect(i.monthly).toHaveLength(12);
  });

  it("월별 실적이 있는 샘플의 현재 실적은 기준일(10월)까지의 값이다", () => {
    const actualOf = (name: string) => results.find((r) => r.indicator.name === name)?.evaluation.actual;
    expect(actualOf("신규 고객 유치")).toBe(1050); // 누적
    expect(actualOf("카드 신규 발급")).toBe(300); // 누적
    expect(actualOf("수신 잔액 증대")).toBe(1300); // 월말값
    expect(actualOf("연체율 관리")).toBe(1.2); // 월말값
  });

  it("개선조치·추진과제 샘플이 들어 있다", () => {
    expect(SAMPLE_INDICATORS.filter((i) => (i.actions ?? []).length > 0).length).toBeGreaterThanOrEqual(3);
    expect(SAMPLE_INDICATORS.filter((i) => (i.tasks ?? []).length > 0).length).toBeGreaterThanOrEqual(3);
  });

  it("부진지표는 모두 보완사항이 적혀 있다", () => {
    const delayed = results.filter((r) => r.evaluation.status === "delayed");
    for (const { indicator } of delayed) {
      expect((indicator.note ?? "").trim()).not.toBe("");
    }
  });

  it("초과 달성(100% 초과)과 화면에서 잘라 표시하는 값이 들어 있다", () => {
    const over100 = results.filter((r) => r.evaluation.progress > 100);
    expect(over100.length).toBeGreaterThanOrEqual(3);
    const clamped = results.filter((r) => r.evaluation.displayProgress !== r.evaluation.progress);
    // 200 초과(비이자 수익)와 0 미만(순이자마진) 두 건
    expect(clamped).toHaveLength(2);
  });

  it("경계 사례가 들어 있다 (경과율과 같으면 정상, 0.1 낮으면 부진)", () => {
    const equal = results.find((r) => r.indicator.name === "영업점 안전 점검");
    const lower = results.find((r) => r.indicator.name === "업무 매뉴얼 개정");
    expect(equal?.evaluation.status).toBe("normal");
    expect(lower?.evaluation.status).toBe("delayed");
  });

  it("낮을수록 좋은 지표(기준값 > 목표값)가 들어 있다", () => {
    const lowerIsBetter = SAMPLE_INDICATORS.filter(
      (i) =>
        i.baseValue !== undefined &&
        i.targetValue !== undefined &&
        i.baseValue > i.targetValue,
    );
    expect(lowerIsBetter.length).toBeGreaterThanOrEqual(5);
  });
});
