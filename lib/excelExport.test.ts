// Plan SC: 작업 12 — 내보내기 칸 값 규칙. 부진 여부·경과율·차이가 맞게 들어가고, 값이 없는 칸은 비어 있어야 한다.

import { describe, expect, it } from "vitest";
import { evaluateIndicator } from "./calc";
import { EXCEL_COLUMNS, exportFileName } from "./excelFormat";
import { EXPORT_HEADERS, exportInfoLines, toExportCells } from "./excelExport";
import type { IndicatorRow } from "./filterSort";
import { SAMPLE_INDICATORS, SAMPLE_REFERENCE_DATE } from "./fixtureData";
import type { Indicator } from "@/types/indicator";

const rowFor = (indicator: Indicator, index = 0, date = SAMPLE_REFERENCE_DATE): IndicatorRow => ({
  indicator,
  evaluation: evaluateIndicator(indicator, date),
  index,
});

const named = (name: string): Indicator => SAMPLE_INDICATORS.find((i) => i.name === name)!;

/** 머리글 이름으로 칸 값을 찾는다. */
const cell = (indicator: Indicator, header: string, date = SAMPLE_REFERENCE_DATE) =>
  toExportCells(rowFor(indicator, 0, date))[EXPORT_HEADERS.indexOf(header)];

describe("EXPORT_HEADERS", () => {
  it("양식 13개 열 뒤에 집계방식·지표ID, 그 뒤에 현재실적·부진여부·경과율(%)·차이(%p)가 붙는다", () => {
    expect(EXPORT_HEADERS).toHaveLength(19);
    expect(EXPORT_HEADERS.slice(0, 13)).toEqual(EXCEL_COLUMNS.map((c) => c.header));
    expect(EXPORT_HEADERS.slice(13, 15)).toEqual(["집계방식", "지표ID"]);
    expect(EXPORT_HEADERS.slice(15)).toEqual(["현재실적", "부진여부", "경과율(%)", "차이(%p)"]);
  });
});

describe("toExportCells", () => {
  it("칸 개수가 머리글 개수와 같다", () => {
    for (const indicator of SAMPLE_INDICATORS) {
      expect(toExportCells(rowFor(indicator))).toHaveLength(EXPORT_HEADERS.length);
    }
  });

  it("부진지표: 진척률·부진여부·경과율·차이가 맞게 들어간다", () => {
    const indicator = named("수신 잔액 증대"); // 진척률 60.0%, 기준일 2026-10-15 경과율 78.9%
    expect(cell(indicator, "지표명")).toBe("수신 잔액 증대");
    expect(cell(indicator, "지표구분")).toBe("부점 계량");
    expect(cell(indicator, "진척률")).toBe(60);
    expect(cell(indicator, "부진여부")).toBe("부진");
    expect(cell(indicator, "경과율(%)")).toBe(78.9);
    expect(cell(indicator, "차이(%p)")).toBe(-18.9);
    expect(cell(indicator, "보완사항")).toBe("법인 예금 유치 활동을 4분기에 집중한다.");
  });

  it("정상 지표는 '정상'이고 차이는 양수다. 보완사항이 없으면 빈 칸이다", () => {
    const indicator = named("신규 고객 유치"); // 87.5%
    expect(cell(indicator, "부진여부")).toBe("정상");
    expect(cell(indicator, "차이(%p)")).toBe(8.6);
    expect(cell(indicator, "보완사항")).toBeNull();
  });

  it("진척률을 직접 입력한 지표(정성 평가)도 진척률·차이·부진여부가 모두 채워진다", () => {
    const indicator = named("정성 평가 지표"); // 직접 입력 88%
    expect(cell(indicator, "진척률")).toBe(88);
    expect(cell(indicator, "차이(%p)")).toBe(9.1);
    expect(cell(indicator, "부진여부")).toBe("정상");
    expect(cell(indicator, "경과율(%)")).toBe(78.9);
    expect(cell(indicator, "현재실적")).toBeNull();
  });

  it("월별 실적이 있는 지표: 실적값 칸은 입력해 둔 값(없으면 빈 칸), 현재실적 칸은 기준일까지의 값, 집계방식·지표ID가 적힌다", () => {
    const cumulative = named("신규 고객 유치");
    expect(cell(cumulative, "실적값")).toBeNull();
    expect(cell(cumulative, "현재실적")).toBe(1050);
    expect(cell(cumulative, "집계방식")).toBe("누적");
    expect(cell(cumulative, "지표ID")).toBe("sample-1");
    const latest = named("수신 잔액 증대");
    expect(cell(latest, "집계방식")).toBe("월말값");
    expect(cell(latest, "현재실적")).toBe(1300);
    // 기준일을 앞당기면 현재실적도 그 달까지의 값으로 바뀐다 (3월 말: 1080)
    expect(cell(latest, "현재실적", "2026-03-31")).toBe(1080);
  });

  it("비계량 지표는 집계방식·현재실적이 빈 칸이다", () => {
    const indicator = named("내부통제 점검 이행");
    expect(cell(indicator, "집계방식")).toBeNull();
    expect(cell(indicator, "현재실적")).toBeNull();
  });

  it("범위 밖 진척률은 잘라 쓰지 않고 계산된 원래 값을 넣는다", () => {
    expect(cell(named("비이자 수익 확대"), "진척률")).toBe(260);
    expect(cell(named("순이자마진 개선"), "진척률")).toBe(-40);
  });

  it("비계량 지표는 기준값·목표값·실적값이 빈 칸이고, 직접 입력한 진척률이 들어간다", () => {
    const indicator = named("내부통제 점검 이행");
    expect(cell(indicator, "기준값")).toBeNull();
    expect(cell(indicator, "목표값")).toBeNull();
    expect(cell(indicator, "실적값")).toBeNull();
    expect(cell(indicator, "진척률")).toBe(90);
  });

  it("숫자는 글자가 아니라 숫자로, 날짜는 YYYY-MM-DD 글자로 들어간다", () => {
    const indicator = named("수신 잔액 증대");
    expect(cell(indicator, "배점")).toBe(4);
    expect(cell(indicator, "목표값")).toBe(1500);
    expect(cell(indicator, "예상달성도")).toBe(75);
    expect(cell(indicator, "평가기준일")).toBe("2026-10-15");
  });

  it("자료 기준일이 바뀌면 경과율·부진여부·차이가 그 기준일로 계산된다", () => {
    const indicator = named("신규 고객 유치"); // 87.5%
    expect(cell(indicator, "경과율(%)", "2026-12-31")).toBe(100);
    expect(cell(indicator, "부진여부", "2026-12-31")).toBe("부진");
    expect(cell(indicator, "차이(%p)", "2026-12-31")).toBe(-12.5);
  });
});

describe("exportInfoLines (파일 위쪽 기준 정보)", () => {
  const allRows = SAMPLE_INDICATORS.map((indicator, index) => rowFor(indicator, index));

  it("제목, 자료 기준일, 경과율이 들어간다", () => {
    const lines = exportInfoLines({
      branch: "테스트부점",
      referenceDate: "2026-10-15",
      elapsedRate: 78.9,
      rows: allRows,
    });
    expect(lines[0].text).toBe("테스트부점 성과지표 현황");
    expect(lines[1].text).toBe("자료 기준일: 2026-10-15");
    expect(lines[2].text).toBe("경과율: 78.9%");
  });

  it("보완사항이 모두 있으면 경고 줄이 없다 (샘플은 기준일 2026-10-15에서 모두 있음)", () => {
    const lines = exportInfoLines({
      branch: "테스트부점",
      referenceDate: "2026-10-15",
      elapsedRate: 78.9,
      rows: allRows,
    });
    expect(lines).toHaveLength(3);
    expect(lines.some((l) => l.warning)).toBe(false);
  });

  it("보완사항이 빈 부진지표가 있으면 개수와 지표명을 경고로 적는다", () => {
    const lines = exportInfoLines({
      branch: "테스트부점",
      referenceDate: "2026-11-04",
      elapsedRate: 84.4,
      rows: SAMPLE_INDICATORS.map((indicator, index) => rowFor(indicator, index, "2026-11-04")),
    });
    const warning = lines.find((l) => l.warning);
    expect(warning?.text).toContain("6건");
    expect(warning?.text).toContain("여신 잔액 증대");
  });
});

describe("exportFileName", () => {
  it("자료 기준일이 파일 이름에 들어간다", () => {
    expect(exportFileName("2026-10-15")).toBe("지표현황_2026-10-15.xlsx");
  });
});
