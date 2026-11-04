// Design Ref: §9 — 계산 규칙을 PLAN 성공 기준의 예시값으로 자동 확인한다.
// Plan SC: 성공 기준 2(진척률 식), 3(부진 판정), 4(0~200 범위)

import { describe, expect, it } from "vitest";
import type { Indicator } from "@/types/indicator";
import {
  calcElapsedRate,
  calcGap,
  calcProgress,
  clampForDisplay,
  evaluateIndicator,
  isDelayed,
  isInPercentRange,
  resolveProgress,
  round1,
} from "./calc";

/** 테스트용 지표. 필요한 값만 덮어써서 쓴다. */
function makeIndicator(overrides: Partial<Indicator> = {}): Indicator {
  return {
    branch: "테스트부점",
    category: "영업",
    name: "테스트 지표",
    item: "항목",
    method: "방법",
    weight: 10,
    expected: 100,
    evalDate: "2026-10-15",
    ...overrides,
  };
}

describe("round1 (소수 첫째 자리 반올림)", () => {
  it("0.05 단위는 올림한다", () => {
    expect(round1(50.25)).toBe(50.3);
    expect(round1(1.15)).toBe(1.2); // 부동소수점 오차(1.1499999…)에도 올림
  });
  it("음수도 절댓값 기준으로 반올림한다", () => {
    expect(round1(-10.05)).toBe(-10.1);
  });
  it("-0은 0으로 돌려준다", () => {
    expect(Object.is(round1(-0.01), 0)).toBe(true);
  });
});

describe("calcProgress (진척률)", () => {
  it("높을수록 좋은 지표: 기준 0·목표 100·실적 50 → 50.0", () => {
    expect(calcProgress(0, 100, 50)).toBe(50);
  });
  it("낮을수록 좋은 지표: 기준 100·목표 50·실적 75 → 50.0", () => {
    expect(calcProgress(100, 50, 75)).toBe(50);
  });
  it("소수 첫째 자리로 반올림한다", () => {
    expect(calcProgress(0, 3, 1)).toBe(33.3);
    expect(calcProgress(0, 3, 2)).toBe(66.7);
  });
  it("목표를 넘으면 100을 넘고, 나빠지면 음수가 된다 (저장 가능한 계산값)", () => {
    expect(calcProgress(0, 100, 150)).toBe(150);
    expect(calcProgress(0, 100, -20)).toBe(-20);
    expect(calcProgress(0, 100, 300)).toBe(300);
  });
  it("목표값 = 기준값이면 분모가 0이라 null(직접 입력 필요)", () => {
    expect(calcProgress(50, 50, 70)).toBeNull();
  });
});

describe("calcElapsedRate (일 단위 경과율)", () => {
  it("연중 183일째(2026-07-02) → 50.1", () => {
    expect(calcElapsedRate("2026-07-02")).toBe(50.1);
  });
  it("2026-10-15는 288일째 → 78.9", () => {
    expect(calcElapsedRate("2026-10-15")).toBe(78.9);
  });
  it("1월 1일은 1일째 → 0.3, 12월 31일 → 100", () => {
    expect(calcElapsedRate("2026-01-01")).toBe(0.3);
    expect(calcElapsedRate("2026-12-31")).toBe(100);
  });
  it("윤년은 연간 366일로 계산한다 (2028-07-01은 183일째 → 50.0)", () => {
    expect(calcElapsedRate("2028-07-01")).toBe(50);
    expect(calcElapsedRate("2028-12-31")).toBe(100);
  });
  it("형식이 틀리거나 없는 날짜면 오류를 낸다", () => {
    expect(() => calcElapsedRate("abc")).toThrow(RangeError);
    expect(() => calcElapsedRate("2026-2-3")).toThrow(RangeError);
    expect(() => calcElapsedRate("2026-02-30")).toThrow(RangeError);
    expect(() => calcElapsedRate("2026-13-01")).toThrow(RangeError);
  });
});

describe("부진지표 판정과 차이(%p)", () => {
  it("진척률 < 경과율이면 부진", () => {
    expect(isDelayed(50, 50.1)).toBe(true);
  });
  it("같으면 정상", () => {
    expect(isDelayed(50.1, 50.1)).toBe(false);
  });
  it("반올림한 값으로 비교한다 (50.04는 50.0으로 보고 경과율 50.0과 같다)", () => {
    expect(isDelayed(50.04, 50.0)).toBe(false);
    expect(isDelayed(49.96, 50.0)).toBe(false); // 50.0으로 반올림
    expect(isDelayed(49.94, 50.0)).toBe(true); // 49.9로 반올림
  });
  it("차이(%p)는 부진이면 음수", () => {
    expect(calcGap(40, 50.1)).toBe(-10.1);
    expect(calcGap(60, 50.1)).toBe(9.9);
  });
});

describe("0~200 범위", () => {
  it("0과 200은 허용한다", () => {
    expect(isInPercentRange(0)).toBe(true);
    expect(isInPercentRange(100.5)).toBe(true);
    expect(isInPercentRange(200)).toBe(true);
  });
  it("범위 밖과 숫자가 아닌 값은 거부한다", () => {
    expect(isInPercentRange(-0.1)).toBe(false);
    expect(isInPercentRange(200.1)).toBe(false);
    expect(isInPercentRange(Number.NaN)).toBe(false);
    expect(isInPercentRange(Number.POSITIVE_INFINITY)).toBe(false);
  });
  it("화면 표시용으로 0~200으로 잘라낸다", () => {
    expect(clampForDisplay(250)).toBe(200);
    expect(clampForDisplay(-5)).toBe(0);
    expect(clampForDisplay(80.5)).toBe(80.5);
  });
});

describe("resolveProgress (진척률 정하기)", () => {
  it("수치 지표는 올린 진척률과 관계없이 항상 다시 계산한다", () => {
    const indicator = makeIndicator({
      baseValue: 0,
      targetValue: 100,
      actualValue: 50,
      progress: 99,
    });
    expect(resolveProgress(indicator)).toBe(50);
  });
  it("수치로 나타낼 수 없는 지표는 직접 입력한 값을 쓴다", () => {
    expect(resolveProgress(makeIndicator({ progress: 70 }))).toBe(70);
  });
  it("목표값 = 기준값이면 직접 입력한 값을 쓰고, 없으면 null", () => {
    const base = { baseValue: 10, targetValue: 10, actualValue: 12 };
    expect(resolveProgress(makeIndicator({ ...base, progress: 60 }))).toBe(60);
    expect(resolveProgress(makeIndicator(base))).toBeNull();
  });
  it("쓸 수 있는 값이 하나도 없으면 null", () => {
    expect(resolveProgress(makeIndicator())).toBeNull();
  });
});

describe("evaluateIndicator (지표 한 건 평가)", () => {
  it("부진지표: 진척률 40, 기준일 2026-10-15 → 부진, 차이 −38.9", () => {
    const result = evaluateIndicator(makeIndicator({ progress: 40 }), "2026-10-15");
    expect(result.status).toBe("delayed");
    expect(result.elapsedRate).toBe(78.9);
    expect(result.gap).toBe(-38.9);
  });
  it("정상 지표: 진척률이 경과율 이상이면 정상", () => {
    const result = evaluateIndicator(makeIndicator({ progress: 80 }), "2026-10-15");
    expect(result.status).toBe("normal");
    expect(result.gap).toBe(1.1);
  });
  it("계산값이 범위 밖이면 저장값은 그대로, 표시값만 잘라낸다", () => {
    const over = evaluateIndicator(
      makeIndicator({ baseValue: 0, targetValue: 100, actualValue: 250 }),
      "2026-10-15",
    );
    expect(over.progress).toBe(250);
    expect(over.displayProgress).toBe(200);
    const under = evaluateIndicator(
      makeIndicator({ baseValue: 0, targetValue: 100, actualValue: -30 }),
      "2026-10-15",
    );
    expect(under.progress).toBe(-30);
    expect(under.displayProgress).toBe(0);
    expect(under.status).toBe("delayed");
  });
  it("진척률을 알 수 없으면 판정 보류", () => {
    const result = evaluateIndicator(
      makeIndicator({ baseValue: 5, targetValue: 5, actualValue: 6 }),
      "2026-10-15",
    );
    expect(result.status).toBe("pending");
    expect(result.progress).toBeNull();
    expect(result.gap).toBeNull();
  });
});
