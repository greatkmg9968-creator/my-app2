// Plan SC: 작업 15 — 자동 저장(내 컴퓨터 브라우저). 저장했다가 읽으면 같은 자료가 돌아오고, 깨진 자료는 앱을 망가뜨리지 않는다.

import { describe, expect, it } from "vitest";
import { MAX_INDICATORS, type Indicator } from "@/types/indicator";
import { SAMPLE_BRANCH, SAMPLE_INDICATORS } from "./fixtureData";
import { STORAGE_VERSION, deserializeState, sanitizeIndicator, serializeState } from "./storage";

const BRANCH = "서울지점";

/** 올바른 비계량 지표. 필요한 칸만 덮어써서 쓴다. */
function qualitative(name: string, overrides: Record<string, unknown> = {}): Indicator {
  return {
    branch: BRANCH,
    category: "공통 비계량",
    name,
    item: "항목",
    method: "방법",
    weight: 3,
    progress: 80,
    expected: 90,
    evalDate: "2026-10-15",
    ...overrides,
  } as Indicator;
}

const saved = (indicators: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ version: STORAGE_VERSION, branch: BRANCH, indicators, ...extra });

describe("serializeState / deserializeState", () => {
  it("샘플 30건을 저장했다가 읽으면 모든 칸이 그대로 돌아온다 (번호·월별 실적·개선조치·추진과제 포함)", () => {
    const sameBranch = SAMPLE_INDICATORS.map((i) => ({ ...i, branch: SAMPLE_BRANCH }));
    const loaded = deserializeState(serializeState({ branch: SAMPLE_BRANCH, indicators: sameBranch }));
    expect(loaded).not.toBeNull();
    expect(loaded?.dropped).toBe(0);
    expect(loaded?.state.branch).toBe(SAMPLE_BRANCH);
    expect(loaded?.state.indicators).toEqual(SAMPLE_INDICATORS);
  });

  it("첨부파일 정보도 저장했다가 읽으면 그대로다", () => {
    const attachment = { id: "f1", kind: "실적자료", name: "실적.pdf", size: 2048, type: "application/pdf", addedAt: "2026-10-01T00:00:00.000Z" };
    const loaded = deserializeState(serializeState({ branch: BRANCH, indicators: [qualitative("가", { id: "x", attachments: [attachment] })] }));
    expect(loaded?.state.indicators[0].attachments).toEqual([attachment]);
    expect(loaded?.state.indicators[0].id).toBe("x");
  });

  it("처음(저장된 것 없음)이거나 빈 글자면 null — 처음 쓰는 것처럼 시작한다", () => {
    expect(deserializeState(null)).toBeNull();
    expect(deserializeState("")).toBeNull();
  });

  it("읽을 수 없는 글자, 객체가 아닌 값, 모양 버전이 다른 자료는 null", () => {
    expect(deserializeState("{깨진")).toBeNull();
    expect(deserializeState("123")).toBeNull();
    expect(deserializeState("null")).toBeNull();
    expect(deserializeState(JSON.stringify({ version: 999, branch: BRANCH, indicators: [] }))).toBeNull();
    expect(deserializeState(JSON.stringify({ branch: BRANCH, indicators: [] }))).toBeNull();
  });

  it("지표 목록이 배열이 아니면 빈 목록으로 읽고, 부점 이름의 앞뒤 공백은 지운다", () => {
    const loaded = deserializeState(JSON.stringify({ version: STORAGE_VERSION, branch: "  서울지점 ", indicators: "없음" }));
    expect(loaded?.state.indicators).toEqual([]);
    expect(loaded?.state.branch).toBe("서울지점");
  });

  it("저장된 모든 지표의 부점은 저장된 부점 이름으로 맞춘다", () => {
    const loaded = deserializeState(saved([qualitative("가", { branch: "예전이름" })]));
    expect(loaded?.state.indicators[0].branch).toBe(BRANCH);
  });
});

describe("deserializeState — 깨진 지표는 버리고 센다", () => {
  it("올바르지 않은 지표(구분 오류·범위 밖·필수 칸 없음)만 버리고 나머지는 살린다", () => {
    const loaded = deserializeState(
      saved([
        qualitative("정상"),
        qualitative("구분틀림", { category: "영업" }),
        qualitative("범위초과", { expected: 999 }),
        qualitative("진척률없음", { progress: undefined }),
        qualitative("", {}),
        null,
        "문자열",
        42,
      ]),
    );
    expect(loaded?.state.indicators.map((i) => i.name)).toEqual(["정상"]);
    expect(loaded?.dropped).toBe(7);
  });

  it("이름이 겹치는 지표는 뒤쪽을 버린다", () => {
    const loaded = deserializeState(saved([qualitative("가"), qualitative(" 가 "), qualitative("나")]));
    expect(loaded?.state.indicators.map((i) => i.name)).toEqual(["가", "나"]);
    expect(loaded?.dropped).toBe(1);
  });

  it(`최대 ${MAX_INDICATORS}개를 넘는 지표는 버린다`, () => {
    const many = Array.from({ length: MAX_INDICATORS + 3 }, (_, i) => qualitative(`지표${i}`));
    const loaded = deserializeState(saved(many));
    expect(loaded?.state.indicators).toHaveLength(MAX_INDICATORS);
    expect(loaded?.dropped).toBe(3);
  });

  it("부진지표의 보완사항 필수 검사는 읽을 때 하지 않는다 (자료 기준일에 따라 달라지므로)", () => {
    const loaded = deserializeState(saved([qualitative("부진인데 보완사항 없음", { progress: 5 })]));
    expect(loaded?.state.indicators).toHaveLength(1);
  });
});

describe("sanitizeIndicator", () => {
  it("계량 지표: 월별 실적과 집계방식을 살리고, 월별 실적이 있으면 실적값은 비워 둘 수 있다", () => {
    const monthly = [10, 20, null, null, null, null, null, null, null, null, null, null];
    const result = sanitizeIndicator(
      { branch: "x", category: "부점 계량", name: "가", item: "항목", method: "방법", weight: 4, baseValue: 0, targetValue: 100, aggregation: "latest", monthly, expected: 80, evalDate: "2026-10-15" },
      BRANCH,
    );
    expect(result).toMatchObject({ aggregation: "latest", monthly, branch: BRANCH });
    expect(result?.actualValue).toBeUndefined();
  });

  it("월별 실적에 숫자가 아닌 값이 있으면 그 지표를 버린다", () => {
    const result = sanitizeIndicator(
      { category: "부점 계량", name: "가", item: "항목", method: "방법", weight: 4, baseValue: 0, targetValue: 100, monthly: ["많음"], expected: 80, evalDate: "2026-10-15" },
      BRANCH,
    );
    expect(result).toBeNull();
  });

  it("개선조치·추진과제 중 올바르지 않은 것만 걸러낸다", () => {
    const result = sanitizeIndicator(
      qualitative("가", {
        actions: [{ date: "2026-09-01", content: "조치", owner: "김", status: "완료" }, { date: "나쁨" }],
        tasks: [{ title: "과제", owner: "팀", status: "예정" }, { title: "" }],
      }),
      BRANCH,
    );
    expect(result?.actions).toHaveLength(1);
    expect(result?.tasks).toHaveLength(1);
  });

  it("개선조치·추진과제·첨부파일이 하나도 남지 않으면 그 칸을 만들지 않는다", () => {
    const result = sanitizeIndicator(qualitative("가", { actions: [{}], tasks: "x", attachments: [] }), BRANCH);
    expect(result?.actions).toBeUndefined();
    expect(result?.tasks).toBeUndefined();
    expect(result?.attachments).toBeUndefined();
  });

  it("객체가 아니면 null", () => {
    expect(sanitizeIndicator(null, BRANCH)).toBeNull();
    expect(sanitizeIndicator("x", BRANCH)).toBeNull();
    expect(sanitizeIndicator(5, BRANCH)).toBeNull();
  });
});
