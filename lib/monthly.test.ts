// Plan SC: 작업 17 — 월별 실적 추이. 그 달 실적을 누적(또는 월말값)으로 바꾸고 목표 경로와 비교할 값을 만든다.

import { describe, expect, it } from "vitest";
import type { Indicator } from "@/types/indicator";
import { monthlySeries, normalizeMonthly } from "./monthly";

function makeIndicator(overrides: Partial<Indicator> = {}): Indicator {
  return {
    branch: "테스트부점",
    category: "부점 계량",
    name: "테스트 지표",
    item: "항목",
    method: "방법",
    weight: 4,
    expected: 100,
    evalDate: "2026-10-15",
    baseValue: 0,
    targetValue: 1200,
    ...overrides,
  };
}

const levels = (indicator: Indicator) => monthlySeries(indicator).map((p) => p.level);

describe("normalizeMonthly", () => {
  it("항상 12칸으로 맞추고 비어 있거나 숫자가 아닌 칸은 null로 둔다", () => {
    expect(normalizeMonthly(undefined)).toEqual(Array(12).fill(null));
    expect(normalizeMonthly([1, 2])).toEqual([1, 2, ...Array(10).fill(null)]);
    expect(normalizeMonthly([Number.NaN, 5])).toEqual([null, 5, ...Array(10).fill(null)]);
  });
  it("12칸을 넘는 값은 버린다", () => {
    expect(normalizeMonthly(Array.from({ length: 15 }, (_, i) => i + 1))).toHaveLength(12);
  });
});

describe("monthlySeries — 누적", () => {
  it("그 달 실적을 더해 월별 누적을 만들고, 마지막 입력 이후의 달은 비워 둔다", () => {
    const series = monthlySeries(makeIndicator({ monthly: [100, 120, 130, null, null, null, null, null, null, null, null, null] }));
    expect(series.map((p) => p.entered)).toEqual([100, 120, 130, ...Array(9).fill(null)]);
    expect(series.map((p) => p.level)).toEqual([100, 220, 350, ...Array(9).fill(null)]);
  });

  it("중간에 비어 있는 달은 앞 달의 누적을 이어 간다", () => {
    expect(levels(makeIndicator({ monthly: [100, null, 50, null, null, null, null, null, null, null, null, null] }))).toEqual([
      100, 100, 150, ...Array(9).fill(null),
    ]);
  });

  it("첫 입력 이전의 달은 누적이 없다", () => {
    expect(levels(makeIndicator({ monthly: [null, null, 70, null, null, null, null, null, null, null, null, null] }))).toEqual([
      null, null, 70, ...Array(9).fill(null),
    ]);
  });

  it("소수 계산 오차를 줄인다", () => {
    expect(levels(makeIndicator({ monthly: [0.1, 0.2, null, null, null, null, null, null, null, null, null, null] })).slice(0, 2)).toEqual([0.1, 0.3]);
  });
});

describe("monthlySeries — 월말값", () => {
  const balance = makeIndicator({
    baseValue: 1000,
    targetValue: 1500,
    aggregation: "latest",
    monthly: [1020, null, 1080, 1100, null, null, null, null, null, null, null, null],
  });
  it("그 달의 값이 그대로 그 시점의 수준이다 (더하지 않는다)", () => {
    expect(levels(balance).slice(0, 4)).toEqual([1020, 1020, 1080, 1100]);
  });
  it("비어 있는 달은 직전 값을 이어 가고, 마지막 입력 이후는 비워 둔다", () => {
    expect(levels(balance)).toEqual([1020, 1020, 1080, 1100, ...Array(8).fill(null)]);
  });
});

describe("monthlySeries — 목표 경로", () => {
  it("기준값에서 목표값까지 매달 같은 폭으로 움직이는 경로를 만든다 (0→1200이면 월 100씩)", () => {
    const plan = monthlySeries(makeIndicator()).map((p) => p.plan);
    expect(plan[0]).toBe(100);
    expect(plan[5]).toBe(600);
    expect(plan[11]).toBe(1200);
  });
  it("낮을수록 좋은 지표는 경로가 내려간다 (2.0→1.0)", () => {
    const plan = monthlySeries(makeIndicator({ baseValue: 2.0, targetValue: 1.0 })).map((p) => p.plan);
    expect(plan[0]).toBeCloseTo(1.9167, 4); // 2.0 − 1.0 ÷ 12
    expect(plan[5]).toBeCloseTo(1.5, 10);
    expect(plan[11]).toBe(1);
  });
  it("월별 실적이 하나도 없어도 목표 경로는 있다", () => {
    const series = monthlySeries(makeIndicator());
    expect(series.every((p) => p.entered === null && p.level === null)).toBe(true);
    expect(series.every((p) => p.plan !== null)).toBe(true);
  });
  it("기준값·목표값이 없는 지표(비계량)는 목표 경로가 없다", () => {
    const series = monthlySeries(makeIndicator({ category: "공통 비계량", baseValue: undefined, targetValue: undefined, progress: 80 }));
    expect(series.every((p) => p.plan === null)).toBe(true);
  });
  it("항상 12개월이고 월 번호는 1~12다", () => {
    expect(monthlySeries(makeIndicator()).map((p) => p.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});
