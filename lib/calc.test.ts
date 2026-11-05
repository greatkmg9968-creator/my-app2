// Design Ref: §9 — 계산 규칙을 PLAN 성공 기준의 예시값으로 자동 확인한다.
// Plan SC: 성공 기준 2(진척률 식), 3(부진 판정), 4(0~200 범위)

import { describe, expect, it } from "vitest";
import type { Indicator } from "@/types/indicator";
import {
  aggregateMonthly,
  calcElapsedRate,
  calcGap,
  calcProgress,
  clampForDisplay,
  evaluateIndicator,
  hasMissingNote,
  isDelayed,
  isInPercentRange,
  monthOfDate,
  resolveActual,
  resolveProgress,
  round1,
  toDateString,
} from "./calc";

/** 테스트용 지표. 필요한 값만 덮어써서 쓴다. */
function makeIndicator(overrides: Partial<Indicator> = {}): Indicator {
  return {
    branch: "테스트부점",
    category: "부점 계량",
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

describe("toDateString (날짜 → 문자열)", () => {
  it("월·일이 한 자리여도 두 자리로 맞춘다", () => {
    expect(toDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toDateString(new Date(2026, 9, 15))).toBe("2026-10-15");
  });
  it("만든 문자열을 경과율 계산에 그대로 쓸 수 있다", () => {
    expect(calcElapsedRate(toDateString(new Date(2026, 11, 31)))).toBe(100);
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

describe("hasMissingNote (보완사항이 빠진 부진지표)", () => {
  it("부진인데 보완사항이 없거나 공백뿐이면 true", () => {
    expect(hasMissingNote(makeIndicator(), "delayed")).toBe(true);
    expect(hasMissingNote(makeIndicator({ note: "   " }), "delayed")).toBe(true);
  });
  it("부진이어도 보완사항이 있으면 false", () => {
    expect(hasMissingNote(makeIndicator({ note: "집중 관리" }), "delayed")).toBe(false);
  });
  it("정상은 보완사항이 없어도 false", () => {
    expect(hasMissingNote(makeIndicator(), "normal")).toBe(false);
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
  it("입력 규칙상 만들 수 없는 '진척률을 알 수 없는 지표'가 들어와도 진행 없음(0%)으로 보고 부진으로 판정한다", () => {
    const result = evaluateIndicator(
      makeIndicator({ baseValue: 5, targetValue: 5, actualValue: 6 }),
      "2026-10-15",
    );
    expect(result.progress).toBe(0);
    expect(result.status).toBe("delayed");
  });
  it("현재 실적(actual)을 함께 돌려준다: 수치 지표는 실적, 비계량은 null", () => {
    const quant = evaluateIndicator(
      makeIndicator({ baseValue: 0, targetValue: 100, actualValue: 50 }),
      "2026-10-15",
    );
    expect(quant.actual).toBe(50);
    expect(evaluateIndicator(makeIndicator({ progress: 70 }), "2026-10-15").actual).toBeNull();
  });
});

describe("aggregateMonthly (월별 실적 → 현재 실적)", () => {
  const months = [10, 20, null, 30, 40, null, null, null, null, null, null, null];
  it("누적: 기준 월까지 입력한 달을 모두 더한다 (비어 있는 달은 건너뜀)", () => {
    expect(aggregateMonthly(months, "cumulative", 5)).toBe(100);
    expect(aggregateMonthly(months, undefined, 5)).toBe(100); // 기본은 누적
    expect(aggregateMonthly(months, "cumulative", 2)).toBe(30);
  });
  it("월말값: 기준 월까지 입력한 값 중 가장 늦은 달의 값", () => {
    expect(aggregateMonthly(months, "latest", 5)).toBe(40);
    expect(aggregateMonthly(months, "latest", 3)).toBe(20); // 3월이 비어 있으면 2월 값
  });
  it("기준 월 이후에 입력한 값은 쓰지 않는다", () => {
    expect(aggregateMonthly(months, "cumulative", 1)).toBe(10);
    expect(aggregateMonthly([null, null, 5, null, null, null, null, null, null, null, null, null], "cumulative", 2)).toBeNull();
  });
  it("그 달까지 입력한 값이 하나도 없으면 null", () => {
    expect(aggregateMonthly(Array(12).fill(null), "cumulative", 12)).toBeNull();
  });
  it("소수 계산 오차를 줄인다 (0.1 + 0.2)", () => {
    expect(aggregateMonthly([0.1, 0.2, null, null, null, null, null, null, null, null, null, null], "cumulative", 12)).toBe(0.3);
  });
  it("음수 실적도 더한다", () => {
    expect(aggregateMonthly([5, -2, null, null, null, null, null, null, null, null, null, null], "cumulative", 12)).toBe(3);
  });
});

describe("resolveActual · resolveProgress (월별 실적 반영)", () => {
  const monthlyIndicator = (overrides: Partial<Indicator> = {}) =>
    makeIndicator({
      baseValue: 0,
      targetValue: 1200,
      monthly: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, null, null],
      ...overrides,
    });
  it("월별 실적이 있으면 자료 기준일이 속한 달까지의 누적이 현재 실적이다", () => {
    expect(resolveActual(monthlyIndicator(), "2026-10-15")).toBe(1000);
    expect(resolveActual(monthlyIndicator(), "2026-06-30")).toBe(600);
  });
  it("진척률은 그 현재 실적으로 계산한다 (실적값을 직접 입력했어도 월별 실적이 우선)", () => {
    const indicator = monthlyIndicator({ actualValue: 1 });
    expect(resolveProgress(indicator, "2026-10-15")).toBe(83.3);
    expect(evaluateIndicator(indicator, "2026-10-15").actual).toBe(1000);
  });
  it("기준일을 앞당기면 그 달까지의 값으로 다시 계산된다", () => {
    expect(resolveProgress(monthlyIndicator(), "2026-03-10")).toBe(25);
  });
  it("자료 기준일이 월별 실적의 첫 입력보다 이르면 입력해 둔 실적값을 쓰고, 없으면 null", () => {
    const late = monthlyIndicator({ monthly: [null, null, null, null, null, null, null, null, null, 100, null, null] });
    expect(resolveActual(late, "2026-03-01")).toBeNull();
    expect(resolveActual({ ...late, actualValue: 7 }, "2026-03-01")).toBe(7);
  });
  it("기준일을 주지 않으면 월별 실적은 쓰지 않고 실적값만 쓴다", () => {
    expect(resolveActual(monthlyIndicator({ actualValue: 42 }))).toBe(42);
  });
  it("월말값 방식은 가장 최근 달의 값이 현재 실적이다", () => {
    const balance = makeIndicator({
      baseValue: 1000,
      targetValue: 1500,
      aggregation: "latest",
      monthly: [1020, 1050, 1080, 1100, 1130, 1160, 1200, 1230, 1270, 1300, null, null],
    });
    expect(resolveActual(balance, "2026-10-15")).toBe(1300);
    expect(resolveProgress(balance, "2026-10-15")).toBe(60);
  });
});

describe("monthOfDate", () => {
  it("날짜의 월(1~12)을 돌려준다", () => {
    expect(monthOfDate("2026-01-01")).toBe(1);
    expect(monthOfDate("2026-10-15")).toBe(10);
    expect(monthOfDate("2026-12-31")).toBe(12);
  });
  it("올바르지 않은 날짜면 오류", () => {
    expect(() => monthOfDate("2026-13-01")).toThrow(RangeError);
  });
});
