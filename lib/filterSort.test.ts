// Plan SC: 작업 8 — 필터(부진지표만, 지표 구분별)와 정렬(진척률, 차이, 지표명, 배점)이 동작한다.
// 샘플 30건을 기준일 2026-10-15(경과율 78.9%)로 평가해 확인한다. (부진 11 · 정상 16 · 판정 보류 3)

import { describe, expect, it } from "vitest";
import { INDICATOR_CATEGORIES } from "@/types/indicator";
import { evaluateIndicator } from "./calc";
import {
  filterRows,
  hasActiveFilters,
  NO_FILTERS,
  sortRows,
  type IndicatorRow,
} from "./filterSort";
import { SAMPLE_INDICATORS, SAMPLE_REFERENCE_DATE } from "./sampleData";

const rows: IndicatorRow[] = SAMPLE_INDICATORS.map((indicator, index) => ({
  indicator,
  evaluation: evaluateIndicator(indicator, SAMPLE_REFERENCE_DATE),
  index,
}));

const names = (list: IndicatorRow[]) => list.map((r) => r.indicator.name);

describe("filterRows (필터)", () => {
  it("필터를 켜지 않으면 전부, 원래 순서 그대로 돌려준다", () => {
    expect(names(filterRows(rows, NO_FILTERS))).toEqual(names(rows));
  });
  it("부진지표만 보기: 11건이고 모두 부진이다", () => {
    const result = filterRows(rows, { delayedOnly: true, category: "" });
    expect(result).toHaveLength(11);
    expect(result.every((r) => r.evaluation.status === "delayed")).toBe(true);
  });
  it("지표 구분별 보기: 네 가지 구분 각각에서 그 구분의 지표만 남는다", () => {
    for (const category of INDICATOR_CATEGORIES) {
      const result = filterRows(rows, { delayedOnly: false, category });
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((r) => r.indicator.category === category)).toBe(true);
      expect(result).toHaveLength(
        SAMPLE_INDICATORS.filter((i) => i.category === category).length,
      );
    }
  });
  it("네 가지 구분의 건수를 모두 합하면 전체 30건이다", () => {
    const total = INDICATOR_CATEGORIES.reduce(
      (sum, category) => sum + filterRows(rows, { delayedOnly: false, category }).length,
      0,
    );
    expect(total).toBe(30);
  });
  it("두 필터를 함께 켜면 둘 다 만족하는 지표만 남는다", () => {
    const result = filterRows(rows, { delayedOnly: true, category: "공통 계량" });
    expect(result.length).toBeGreaterThan(0);
    expect(
      result.every(
        (r) => r.indicator.category === "공통 계량" && r.evaluation.status === "delayed",
      ),
    ).toBe(true);
  });
  it("맞는 지표가 없으면 빈 목록이다", () => {
    expect(filterRows([], { delayedOnly: true, category: "부점 계량" })).toEqual([]);
  });
  it("필터가 켜져 있는지 알려준다", () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(hasActiveFilters({ delayedOnly: true, category: "" })).toBe(true);
    expect(hasActiveFilters({ delayedOnly: false, category: "부점 계량" })).toBe(true);
  });
});

describe("sortRows (정렬)", () => {
  it("기본(입력 순서)은 원래 순서를 그대로 둔다", () => {
    expect(names(sortRows(rows, "default", "desc"))).toEqual(names(rows));
  });
  it("원래 목록을 바꾸지 않는다", () => {
    const before = names(rows);
    sortRows(rows, "progress", "desc");
    expect(names(rows)).toEqual(before);
  });
  it("정렬해도 각 줄이 원래 위치(index)를 그대로 갖고 있다", () => {
    for (const row of sortRows(rows, "name", "asc")) {
      expect(SAMPLE_INDICATORS[row.index]).toBe(row.indicator);
    }
  });
  it("진척률 오름차순: 가장 낮은 지표가 먼저 나온다", () => {
    const result = sortRows(rows, "progress", "asc");
    expect(result[0].indicator.name).toBe("순이자마진 개선"); // -40.0%
    const known = result.filter((r) => r.evaluation.progress !== null);
    const values = known.map((r) => r.evaluation.progress as number);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
  it("진척률 내림차순: 가장 높은 지표가 먼저 나온다", () => {
    const result = sortRows(rows, "progress", "desc");
    expect(result[0].indicator.name).toBe("비이자 수익 확대"); // 260.0%
  });
  it("판정 보류(값 없음)는 오름차순·내림차순 모두 맨 뒤에 둔다", () => {
    for (const direction of ["asc", "desc"] as const) {
      const result = sortRows(rows, "progress", direction);
      const tail = result.slice(-3);
      expect(tail.every((r) => r.evaluation.status === "pending")).toBe(true);
    }
  });
  it("차이(%p) 오름차순: 가장 많이 뒤처진 지표가 먼저 나온다", () => {
    const result = sortRows(rows, "gap", "asc");
    expect(result[0].indicator.name).toBe("순이자마진 개선"); // 진척률 -40.0 − 78.9
    expect(result[0].evaluation.gap).toBe(-118.9);
  });
  it("지표명은 한글 가나다 순이다", () => {
    const result = names(sortRows(rows, "name", "asc"));
    expect(result).toEqual([...result].sort((a, b) => a.localeCompare(b, "ko")));
    const reversed = names(sortRows(rows, "name", "desc"));
    expect(reversed).toEqual([...result].reverse());
  });
  it("배점 내림차순: 4점이 먼저, 같은 배점끼리는 원래 순서를 유지한다", () => {
    const result = sortRows(rows, "weight", "desc");
    expect(result[0].indicator.weight).toBe(4);
    const fours = result.filter((r) => r.indicator.weight === 4);
    const originalFours = rows.filter((r) => r.indicator.weight === 4);
    expect(names(fours)).toEqual(names(originalFours));
  });
});
