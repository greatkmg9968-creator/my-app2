// 표에 보이는 숫자 모양을 확인한다.

import { describe, expect, it } from "vitest";
import { EMPTY_MARK, formatNumber, formatPercent } from "./format";

describe("formatNumber", () => {
  it("값이 없으면 '-'를 돌려준다", () => {
    expect(formatNumber(undefined)).toBe(EMPTY_MARK);
  });
  it("천 단위 쉼표를 넣는다", () => {
    expect(formatNumber(1500)).toBe("1,500");
    expect(formatNumber(1050)).toBe("1,050");
  });
  it("소수는 최대 2자리까지 보여주고 0과 음수도 그대로 보여준다", () => {
    expect(formatNumber(0.9)).toBe("0.9");
    expect(formatNumber(1.236)).toBe("1.24");
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(-4)).toBe("-4");
  });
});

describe("formatPercent", () => {
  it("항상 소수 첫째 자리까지 보여준다", () => {
    expect(formatPercent(87.5)).toBe("87.5%");
    expect(formatPercent(50)).toBe("50.0%");
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(200)).toBe("200.0%");
  });
});
