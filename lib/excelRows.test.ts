// Plan SC: 작업 11 — 엑셀 파일 일괄 등록의 검사 규칙. 직접 입력 폼과 같은 규칙으로 줄마다 검사한다.

import { describe, expect, it } from "vitest";
import { MAX_INDICATORS } from "@/types/indicator";
import { EXCEL_COLUMNS } from "./excelFormat";
import {
  cellToText,
  formatUploadErrors,
  normalizeCategoryText,
  parseUploadedSheet,
  type RawRow,
  type RawSheet,
  type UploadContext,
} from "./excelRows";

const BRANCH = "테스트부점";
// 기준일 2026-10-15는 연중 288일째로 경과율 78.9%다.
const CONTEXT: UploadContext = { branch: BRANCH, referenceDate: "2026-10-15" };
const HEADERS = EXCEL_COLUMNS.map((column) => column.header);

/** 줄 한 개를 머리글 순서대로 만든다. 열 이름 → 값으로 적고, 안 적은 칸은 비워 둔다. */
function makeRow(rowNumber: number, byHeader: Record<string, unknown>): RawRow {
  return { rowNumber, cells: HEADERS.map((header) => byHeader[header] ?? null) };
}

/** 올바르게 채운 계량 지표 줄 (진척률 60.0%, 보완사항 있음) */
function quantitative(rowNumber: number, overrides: Record<string, unknown> = {}): RawRow {
  return makeRow(rowNumber, {
    부점: BRANCH,
    지표구분: "부점 계량",
    지표명: `수신 잔액 증대 ${rowNumber}`,
    세부평가항목: "수신 잔액(억원)",
    평가방법: "기말 잔액 − 기초 잔액",
    배점: 4,
    기준값: 1000,
    목표값: 1500,
    실적값: 1300,
    예상달성도: 75,
    보완사항: "법인 예금 유치 집중",
    평가기준일: "2026-10-15",
    ...overrides,
  });
}

/** 올바르게 채운 비계량 지표 줄 (진척률 90.0%) */
function qualitative(rowNumber: number, overrides: Record<string, unknown> = {}): RawRow {
  return makeRow(rowNumber, {
    부점: BRANCH,
    지표구분: "공통 비계량",
    지표명: `내부통제 점검 ${rowNumber}`,
    세부평가항목: "점검 이행 비율",
    평가방법: "이행 항목 ÷ 전체 항목",
    배점: 3,
    진척률: 90,
    예상달성도: 95,
    평가기준일: "2026-10-15",
    ...overrides,
  });
}

function sheet(rows: RawRow[], headers: string[] = HEADERS): RawSheet {
  return { headers, rows };
}

describe("cellToText (엑셀 칸 → 글자)", () => {
  it("글자는 앞뒤 공백을 지우고, 숫자는 그대로 글자로 바꾼다", () => {
    expect(cellToText("  수신  ")).toBe("수신");
    expect(cellToText(1500)).toBe("1500");
    expect(cellToText(-4)).toBe("-4");
    expect(cellToText(0.9)).toBe("0.9");
  });
  it("빈 칸과 숫자가 아닌 값은 빈 글자", () => {
    expect(cellToText(null)).toBe("");
    expect(cellToText(undefined)).toBe("");
    expect(cellToText(Number.NaN)).toBe("");
    expect(cellToText({})).toBe("");
  });
  it("날짜는 UTC 기준 날짜로 읽는다 (시간대 때문에 하루가 밀리지 않는다)", () => {
    expect(cellToText(new Date(Date.UTC(2026, 9, 15)))).toBe("2026-10-15");
    expect(cellToText(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-01-01");
    expect(cellToText(new Date("invalid"))).toBe("");
  });
  it("서식 있는 글자·수식 결과·하이퍼링크 글자도 읽는다", () => {
    expect(cellToText({ richText: [{ text: "부점 " }, { text: "계량" }] })).toBe("부점 계량");
    expect(cellToText({ formula: "A1+B1", result: 42 })).toBe("42");
    expect(cellToText({ text: "링크글자", hyperlink: "https://example.com" })).toBe("링크글자");
  });
});

describe("normalizeCategoryText (지표 구분 띄어쓰기)", () => {
  it("띄어쓰기가 달라도 올바른 지표 구분은 표준 이름으로 바꾼다", () => {
    expect(normalizeCategoryText("부점계량")).toBe("부점 계량");
    expect(normalizeCategoryText(" 공통  비계량 ")).toBe("공통 비계량");
  });
  it("올바르지 않은 값은 그대로 둔다", () => {
    expect(normalizeCategoryText("영업")).toBe("영업");
    expect(normalizeCategoryText("")).toBe("");
  });
});

describe("parseUploadedSheet — 올바른 파일", () => {
  it("계량·비계량 줄이 지표로 바뀐다 (계량의 진척률은 저장하지 않고, 비계량은 직접 입력값을 둔다)", () => {
    const result = parseUploadedSheet(sheet([quantitative(2), qualitative(3)]), CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.indicators).toHaveLength(2);
    expect(result.indicators[0]).toMatchObject({
      branch: BRANCH,
      category: "부점 계량",
      baseValue: 1000,
      targetValue: 1500,
      actualValue: 1300,
      note: "법인 예금 유치 집중",
    });
    expect(result.indicators[0].progress).toBeUndefined();
    expect(result.indicators[1]).toMatchObject({ category: "공통 비계량", progress: 90 });
  });

  it("열 순서가 달라도, 머리글의 띄어쓰기가 달라도 읽는다", () => {
    const reversedHeaders = [...HEADERS].reverse().map((h) => (h === "지표구분" ? "지표 구분" : h));
    const row = quantitative(2);
    const reversed: RawSheet = {
      headers: reversedHeaders,
      rows: [{ rowNumber: 2, cells: [...row.cells].reverse() }],
    };
    const result = parseUploadedSheet(reversed, CONTEXT);
    expect(result.ok).toBe(true);
  });

  it("예전 머리글 '평가항목'도 세부평가항목으로 읽는다", () => {
    const headers = HEADERS.map((h) => (h === "세부평가항목" ? "평가항목" : h));
    expect(parseUploadedSheet(sheet([quantitative(2)], headers), CONTEXT).ok).toBe(true);
  });

  it("내보낸 파일처럼 모르는 열(부진 여부·경과율·차이)이 더 붙어 있어도 무시한다", () => {
    const headers = [...HEADERS, "부진여부", "경과율", "차이(%p)"];
    const row = quantitative(2);
    const extended: RawSheet = {
      headers,
      rows: [{ rowNumber: 2, cells: [...row.cells, "부진", 78.9, -18.9] }],
    };
    expect(parseUploadedSheet(extended, CONTEXT).ok).toBe(true);
  });

  it("수치 지표는 올린 진척률이 계산값과 달라도 계산값을 쓴다", () => {
    const result = parseUploadedSheet(sheet([quantitative(2, { 진척률: 99 })]), CONTEXT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.indicators[0].progress).toBeUndefined();
  });

  it("비계량 줄에 수치 칸이 남아 있어도 버린다", () => {
    const result = parseUploadedSheet(
      sheet([qualitative(2, { 기준값: 1, 목표값: 2, 실적값: 3 })]),
      CONTEXT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.indicators[0].baseValue).toBeUndefined();
  });

  it("평가기준일이 엑셀 날짜(Date)여도 읽는다", () => {
    const result = parseUploadedSheet(
      sheet([quantitative(2, { 평가기준일: new Date(Date.UTC(2026, 9, 15)) })]),
      CONTEXT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.indicators[0].evalDate).toBe("2026-10-15");
  });

  it("부점 칸만 채워진 빈 줄(양식에 미리 채워진 줄)은 건너뛴다", () => {
    const blank = makeRow(3, { 부점: BRANCH });
    const result = parseUploadedSheet(sheet([quantitative(2), blank, makeRow(4, {})]), CONTEXT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.indicators).toHaveLength(1);
  });

  it("지표 30개는 올릴 수 있다", () => {
    const rows = Array.from({ length: MAX_INDICATORS }, (_, i) => quantitative(i + 2));
    const result = parseUploadedSheet(sheet(rows), CONTEXT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.indicators).toHaveLength(30);
  });
});

describe("parseUploadedSheet — 거부해야 하는 파일", () => {
  it("필수 열이 없으면 어떤 열이 없는지 알려준다", () => {
    const headers = HEADERS.filter((h) => h !== "지표구분" && h !== "배점");
    const result = parseUploadedSheet({ headers, rows: [] }, CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("지표구분");
    expect(result.errors[0].message).toContain("배점");
    expect(result.errors[0].message).toContain("엑셀 양식 받기");
  });

  it("지표가 하나도 없으면 거부한다", () => {
    const result = parseUploadedSheet(sheet([makeRow(2, { 부점: BRANCH })]), CONTEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toContain("올릴 지표가 없습니다");
  });

  it("31건이면 전체를 거부한다", () => {
    const rows = Array.from({ length: MAX_INDICATORS + 1 }, (_, i) => quantitative(i + 2));
    const result = parseUploadedSheet(sheet(rows), CONTEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("최대 30개");
      expect(result.errors[0].message).toContain("31건");
    }
  });

  it("다른 부점 줄이 섞여 있으면 그 줄을 거부한다", () => {
    const result = parseUploadedSheet(
      sheet([quantitative(2), quantitative(3, { 부점: "다른부점" })]),
      CONTEXT,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(3);
    expect(result.errors[0].message).toContain("내 부점(테스트부점) 자료만 올릴 수 있습니다");
    expect(result.errors[0].message).toContain("다른부점");
  });

  it("부점 칸이 비어 있으면 거부한다", () => {
    const result = parseUploadedSheet(sheet([quantitative(2, { 부점: null })]), CONTEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toContain("부점을 입력해 주세요");
  });

  it("올바르지 않은 지표구분은 올바른 값을 알려주며 거부한다", () => {
    const result = parseUploadedSheet(sheet([quantitative(2, { 지표구분: "영업" })]), CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain("부점 계량 / 부점 비계량 / 공통 계량 / 공통 비계량");
    expect(result.errors[0].message).toContain("영업");
  });

  it("범위 밖 값과 숫자가 아닌 값을 줄·칸별로 모두 알려준다", () => {
    const result = parseUploadedSheet(
      sheet([
        quantitative(2, { 예상달성도: 250 }),
        qualitative(3, { 진척률: "많음" }),
        quantitative(4, { 실적값: "abc", 배점: 0 }),
      ]),
      CONTEXT,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const lines = formatUploadErrors(result.errors);
    expect(lines.some((l) => l.startsWith("2행 예상달성도:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("3행 진척률:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("4행 실적값:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("4행 배점:"))).toBe(true);
  });

  it("부진지표인데 보완사항이 비어 있으면 거부한다", () => {
    // 진척률 60.0% < 경과율 78.9%
    const result = parseUploadedSheet(sheet([quantitative(2, { 보완사항: null })]), CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain("보완사항:");
    expect(result.errors[0].message).toContain("부진지표");
  });

  it("정상 지표는 보완사항이 없어도 된다", () => {
    const result = parseUploadedSheet(
      sheet([quantitative(2, { 실적값: 1450, 보완사항: null })]), // 90.0%
      CONTEXT,
    );
    expect(result.ok).toBe(true);
  });

  it("같은 파일도 자료 기준일이 달라지면 보완사항 검사 결과가 달라진다", () => {
    const rows = [quantitative(2, { 기준값: 0, 목표값: 100, 실적값: 80, 보완사항: null })]; // 80.0%
    expect(parseUploadedSheet(sheet(rows), { branch: BRANCH, referenceDate: "2026-10-15" }).ok).toBe(true);
    expect(parseUploadedSheet(sheet(rows), { branch: BRANCH, referenceDate: "2026-11-04" }).ok).toBe(false);
  });

  it("평가기준일이 없는 날짜면 거부한다", () => {
    const result = parseUploadedSheet(sheet([quantitative(2, { 평가기준일: "2026-02-30" })]), CONTEXT);
    expect(result.ok).toBe(false);
  });

  it("오류가 있으면 올바른 줄도 올리지 않는다 (지표를 하나도 돌려주지 않는다)", () => {
    const result = parseUploadedSheet(sheet([quantitative(2), quantitative(3, { 지표명: "" })]), CONTEXT);
    expect(result.ok).toBe(false);
    expect("indicators" in result).toBe(false);
  });
});

describe("formatUploadErrors", () => {
  it("줄 번호가 있으면 앞에 붙이고, 없으면 문구만 돌려준다", () => {
    expect(formatUploadErrors([{ row: 5, message: "지표명: 입력해 주세요." }, { message: "파일 오류" }])).toEqual([
      "5행 지표명: 입력해 주세요.",
      "파일 오류",
    ]);
  });
});
