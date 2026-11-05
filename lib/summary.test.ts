// Plan SC: 작업 14 — 대시보드의 도넛 4개가 보여줄 정상·보완 개수와 비율. 달성율은 계산하지 않는다.

import { describe, expect, it } from "vitest";
import { INDICATOR_CATEGORIES, type Indicator, type IndicatorCategory } from "@/types/indicator";
import { evaluateIndicator } from "./calc";
import type { IndicatorRow } from "./filterSort";
import { SAMPLE_INDICATORS, SAMPLE_REFERENCE_DATE } from "./fixtureData";
import { summarizeByCategory } from "./summary";

function rowsOf(indicators: Indicator[], date = SAMPLE_REFERENCE_DATE): IndicatorRow[] {
  return indicators.map((indicator, index) => ({
    indicator,
    evaluation: evaluateIndicator(indicator, date),
    index,
  }));
}

/** 진척률을 직접 입력하는 비계량 지표. 기준일 2026-10-15(경과율 78.9%)에서 progress가 78.9 이상이면 정상 */
function qualitative(category: IndicatorCategory, name: string, progress: number): Indicator {
  return {
    branch: "테스트부점",
    category,
    name,
    item: "항목",
    method: "방법",
    weight: 3,
    progress,
    expected: 90,
    evalDate: SAMPLE_REFERENCE_DATE,
    note: "보완",
  };
}

describe("summarizeByCategory", () => {
  it("항상 지표 구분 네 가지를 정해진 순서로 돌려준다", () => {
    expect(summarizeByCategory([]).map((s) => s.category)).toEqual([...INDICATOR_CATEGORIES]);
  });

  it("지표가 없는 구분은 0건이고 비율이 없다(null)", () => {
    for (const summary of summarizeByCategory([])) {
      expect(summary).toMatchObject({ total: 0, normal: 0, delayed: 0, normalRate: null, delayedRate: null });
    }
  });

  it("구분별로 정상·보완(부진) 개수와 비율을 센다", () => {
    const rows = rowsOf([
      qualitative("공통 비계량", "가", 90), // 정상
      qualitative("공통 비계량", "나", 50), // 보완
      qualitative("공통 비계량", "다", 60), // 보완
      qualitative("공통 비계량", "라", 100), // 정상
      qualitative("부점 비계량", "마", 95), // 정상
    ]);
    const summary = summarizeByCategory(rows);
    const common = summary.find((s) => s.category === "공통 비계량");
    expect(common).toEqual({
      category: "공통 비계량",
      total: 4,
      normal: 2,
      delayed: 2,
      normalRate: 50,
      delayedRate: 50,
    });
    expect(summary.find((s) => s.category === "부점 비계량")).toMatchObject({ total: 1, normal: 1, delayed: 0, normalRate: 100, delayedRate: 0 });
    expect(summary.find((s) => s.category === "부점 계량")?.total).toBe(0);
  });

  it("정상 비율과 보완 비율의 합은 반올림해도 항상 100이다 (1/3, 2/3, 1/6 …)", () => {
    const thirds = summarizeByCategory(
      rowsOf([qualitative("부점 계량", "a", 95), qualitative("부점 계량", "b", 10), qualitative("부점 계량", "c", 10)]),
    ).find((s) => s.category === "부점 계량");
    expect(thirds?.normalRate).toBe(33.3);
    expect(thirds?.delayedRate).toBe(66.7);
    for (const summary of summarizeByCategory(rowsOf(SAMPLE_INDICATORS))) {
      if (summary.normalRate === null || summary.delayedRate === null) continue;
      expect(Math.round((summary.normalRate + summary.delayedRate) * 10) / 10).toBe(100);
    }
  });

  it("샘플 30건: 네 구분의 합이 전체이고 정상+보완 = 구분의 지표 수다", () => {
    const summary = summarizeByCategory(rowsOf(SAMPLE_INDICATORS));
    expect(summary.reduce((sum, s) => sum + s.total, 0)).toBe(30);
    expect(summary.reduce((sum, s) => sum + s.delayed, 0)).toBe(11);
    expect(summary.reduce((sum, s) => sum + s.normal, 0)).toBe(19);
    for (const s of summary) expect(s.normal + s.delayed).toBe(s.total);
    expect(summary.every((s) => s.total > 0)).toBe(true);
  });

  it("자료 기준일이 바뀌면 같은 지표라도 정상·보완 개수가 달라진다", () => {
    const early = summarizeByCategory(rowsOf(SAMPLE_INDICATORS, "2026-03-01"));
    const late = summarizeByCategory(rowsOf(SAMPLE_INDICATORS, "2026-12-31"));
    const delayed = (s: ReturnType<typeof summarizeByCategory>) => s.reduce((sum, x) => sum + x.delayed, 0);
    expect(delayed(early)).toBeLessThan(delayed(late));
  });
});
