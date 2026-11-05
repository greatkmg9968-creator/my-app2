// Plan SC: 작업 16 — 목표 달성을 위한 필요 실적 역산. 목표까지 남은 양, 월평균 필요량, 부진 탈출선을 계산한다.
// 기준일 2026-10-15는 경과율 78.9%이고 남은 개월은 2개월(12 − 10)이다.

import { describe, expect, it } from "vitest";
import type { Indicator } from "@/types/indicator";
import { planToTarget } from "./target";

const REF = "2026-10-15";

function makeIndicator(overrides: Partial<Indicator> = {}): Indicator {
  return {
    branch: "테스트부점",
    category: "부점 계량",
    name: "테스트 지표",
    item: "항목",
    method: "방법",
    weight: 4,
    expected: 100,
    evalDate: REF,
    ...overrides,
  };
}

describe("planToTarget — 수치(계량) 지표, 누적형", () => {
  it("목표까지 남은 양과 남은 달의 월평균 필요량을 계산한다 (1200 목표, 800 달성, 2개월 남음)", () => {
    const plan = planToTarget(makeIndicator({ baseValue: 0, targetValue: 1200, actualValue: 800 }), REF);
    expect(plan).toMatchObject({
      kind: "quantitative",
      achieved: false,
      direction: "increase",
      current: 800,
      remaining: 400,
      monthsLeft: 2,
      perMonth: 200,
    });
  });

  it("부진 탈출선: 경과율(78.9%)에 맞춘 목표 경로 위의 값과, 거기까지 더 필요한 양", () => {
    const plan = planToTarget(makeIndicator({ baseValue: 0, targetValue: 1200, actualValue: 800 }), REF);
    expect(plan.catchUpLevel).toBe(946.8); // 1200 × 78.9%
    expect(plan.catchUpRemaining).toBe(146.8);
  });

  it("이미 탈출선을 넘었으면 더 필요한 양은 0이다 (그래도 목표까지는 남아 있을 수 있다)", () => {
    const plan = planToTarget(makeIndicator({ baseValue: 0, targetValue: 1200, actualValue: 1000 }), REF);
    expect(plan.catchUpRemaining).toBe(0);
    expect(plan.remaining).toBe(200);
    expect(plan.achieved).toBe(false);
  });

  it("목표를 이미 달성했으면 남은 양·월평균이 없다", () => {
    const plan = planToTarget(makeIndicator({ baseValue: 0, targetValue: 1200, actualValue: 1300 }), REF);
    expect(plan.achieved).toBe(true);
    expect(plan.remaining).toBe(0);
    expect(plan.perMonth).toBeNull();
  });

  it("기준값이 0이 아니어도 기준값에서 목표값까지의 경로로 계산한다 (1000→1500, 실적 1300)", () => {
    const plan = planToTarget(makeIndicator({ baseValue: 1000, targetValue: 1500, actualValue: 1300 }), REF);
    expect(plan.remaining).toBe(200);
    expect(plan.catchUpLevel).toBe(1394.5); // 1000 + 500 × 78.9%
    expect(plan.catchUpRemaining).toBe(94.5);
  });

  it("12월(남은 달 없음)에는 월평균 필요량이 없다", () => {
    const plan = planToTarget(makeIndicator({ baseValue: 0, targetValue: 1200, actualValue: 800 }), "2026-12-20");
    expect(plan.monthsLeft).toBe(0);
    expect(plan.perMonth).toBeNull();
    expect(plan.remaining).toBe(400);
  });

  it("월별 실적이 있으면 거기서 구한 현재 실적으로 계산한다", () => {
    const plan = planToTarget(
      makeIndicator({
        baseValue: 0,
        targetValue: 1200,
        monthly: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, null, null],
      }),
      REF,
    );
    expect(plan.current).toBe(1000);
    expect(plan.remaining).toBe(200);
    expect(plan.perMonth).toBe(100);
  });
});

describe("planToTarget — 수치(계량) 지표, 월말값형", () => {
  it("월평균 필요량은 구하지 않고(잔액은 더하는 값이 아니므로) 목표까지 남은 값만 알려준다", () => {
    const plan = planToTarget(
      makeIndicator({ baseValue: 1000, targetValue: 1500, actualValue: 1300, aggregation: "latest" }),
      REF,
    );
    expect(plan.remaining).toBe(200);
    expect(plan.perMonth).toBeNull();
    expect(plan.achieved).toBe(false);
  });
});

describe("planToTarget — 낮을수록 좋은 지표", () => {
  const overdue = (actual: number) =>
    makeIndicator({ baseValue: 2.0, targetValue: 1.0, actualValue: actual, aggregation: "latest" });

  it("줄여야 할 양을 남은 양으로 계산한다 (연체율 2.0 → 1.0, 현재 1.2)", () => {
    const plan = planToTarget(overdue(1.2), REF);
    expect(plan.direction).toBe("decrease");
    expect(plan.remaining).toBe(0.2);
    expect(plan.achieved).toBe(false);
  });

  it("목표값 이하로 내려갔으면 달성이다", () => {
    expect(planToTarget(overdue(0.9), REF).achieved).toBe(true);
    expect(planToTarget(overdue(1.0), REF).achieved).toBe(true);
  });

  it("부진 탈출선은 시간에 따라 내려가는 경로다. 경로보다 높으면(뒤처졌으면) 더 줄여야 할 양이 나온다", () => {
    const behind = planToTarget(overdue(1.6), REF);
    expect(behind.catchUpLevel).toBe(1.21); // 2.0 − 1.0 × 78.9%
    expect(behind.catchUpRemaining).toBe(0.39);
    const ahead = planToTarget(overdue(1.2), REF);
    expect(ahead.catchUpRemaining).toBe(0);
  });

  it("누적형이면 월평균 감축량도 구한다 (민원 50 → 20, 현재 30, 2개월 남음: 10씩)", () => {
    const plan = planToTarget(
      makeIndicator({ baseValue: 50, targetValue: 20, actualValue: 30, aggregation: "cumulative" }),
      REF,
    );
    expect(plan.direction).toBe("decrease");
    expect(plan.remaining).toBe(10);
    expect(plan.perMonth).toBe(5);
  });
});

describe("planToTarget — 진척률로 평가하는 지표", () => {
  it("비계량: 진척률 100%까지 필요한 %p, 월평균, 부진 탈출선(경과율)까지의 %p", () => {
    const plan = planToTarget(makeIndicator({ category: "공통 비계량", progress: 70 }), REF);
    expect(plan).toMatchObject({
      kind: "qualitative",
      achieved: false,
      direction: null,
      current: 70,
      remaining: 30,
      perMonth: 15,
      catchUpLevel: 78.9,
      catchUpRemaining: 8.9,
    });
  });

  it("진척률이 100% 이상이면 달성이고, 경과율보다 높으면 탈출선까지 필요한 양이 0이다", () => {
    const plan = planToTarget(makeIndicator({ category: "공통 비계량", progress: 120 }), REF);
    expect(plan.achieved).toBe(true);
    expect(plan.remaining).toBe(0);
    expect(plan.perMonth).toBeNull();
    expect(plan.catchUpRemaining).toBe(0);
  });

  it("계량 지표라도 목표값 = 기준값이면 진척률 기준으로 계산한다", () => {
    const plan = planToTarget(
      makeIndicator({ baseValue: 10, targetValue: 10, actualValue: 12, progress: 60 }),
      REF,
    );
    expect(plan.kind).toBe("qualitative");
    expect(plan.remaining).toBe(40);
  });
});
