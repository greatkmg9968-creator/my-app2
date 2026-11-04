// 진행 막대의 길이·초과 표시·경과율 눈금 위치를 확인한다.

import { describe, expect, it } from "vitest";
import { calcBarGeometry } from "./bar";

describe("calcBarGeometry", () => {
  it("0~100 사이 진척률은 그 길이만큼 채우고 초과 표시는 없다", () => {
    expect(calcBarGeometry(60, 78.9)).toEqual({
      fillPercent: 60,
      overflow: false,
      tickPercent: 78.9,
    });
  });
  it("정확히 100%는 가득 채우되 초과로 보지 않는다", () => {
    const bar = calcBarGeometry(100, 50);
    expect(bar.fillPercent).toBe(100);
    expect(bar.overflow).toBe(false);
  });
  it("100%를 넘으면 가득 채우고 초과 표시를 붙인다", () => {
    expect(calcBarGeometry(155, 78.9)).toMatchObject({ fillPercent: 100, overflow: true });
    expect(calcBarGeometry(200, 78.9)).toMatchObject({ fillPercent: 100, overflow: true });
    expect(calcBarGeometry(260, 78.9)).toMatchObject({ fillPercent: 100, overflow: true });
  });
  it("0 미만은 빈 막대다", () => {
    expect(calcBarGeometry(-40, 78.9)).toMatchObject({ fillPercent: 0, overflow: false });
    expect(calcBarGeometry(0, 78.9)).toMatchObject({ fillPercent: 0, overflow: false });
  });
  it("경과율 눈금선은 0~100 안에 둔다", () => {
    expect(calcBarGeometry(50, 0).tickPercent).toBe(0);
    expect(calcBarGeometry(50, 100).tickPercent).toBe(100);
    expect(calcBarGeometry(50, 150).tickPercent).toBe(100);
  });
});
