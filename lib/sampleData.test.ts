// Plan SC: 성공 기준 1(30건), 작업 3(부진/정상/초과 달성 섞기) — 샘플이 의도대로 구성됐는지 확인한다.

import { describe, expect, it } from "vitest";
import { evaluateIndicator, isInPercentRange } from "./calc";
import {
  SAMPLE_BRANCH,
  SAMPLE_INDICATORS,
  SAMPLE_REFERENCE_DATE,
} from "./sampleData";

const results = SAMPLE_INDICATORS.map((indicator) => ({
  indicator,
  evaluation: evaluateIndicator(indicator, SAMPLE_REFERENCE_DATE),
}));

function count(status: "delayed" | "normal" | "pending"): number {
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

  it("지표명이 겹치지 않고, 지표 구분이 여러 가지다", () => {
    const names = new Set(SAMPLE_INDICATORS.map((i) => i.name));
    expect(names.size).toBe(30);
    const categories = new Set(SAMPLE_INDICATORS.map((i) => i.category));
    expect(categories.size).toBeGreaterThanOrEqual(5);
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

  it("기준일 2026-10-15(경과율 78.9%)에서 부진 11건·정상 16건·판정 보류 3건이다", () => {
    expect(count("delayed")).toBe(11);
    expect(count("normal")).toBe(16);
    expect(count("pending")).toBe(3);
  });

  it("부진지표는 모두 보완사항이 적혀 있다", () => {
    const delayed = results.filter((r) => r.evaluation.status === "delayed");
    for (const { indicator } of delayed) {
      expect((indicator.note ?? "").trim()).not.toBe("");
    }
  });

  it("초과 달성(100% 초과)과 화면에서 잘라 표시하는 값이 들어 있다", () => {
    const over100 = results.filter((r) => (r.evaluation.progress ?? 0) > 100);
    expect(over100.length).toBeGreaterThanOrEqual(3);
    const clamped = results.filter(
      (r) =>
        r.evaluation.progress !== null &&
        r.evaluation.displayProgress !== r.evaluation.progress,
    );
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
