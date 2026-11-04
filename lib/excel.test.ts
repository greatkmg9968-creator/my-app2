// Plan SC: 작업 11 — 실제 엑셀 파일(.xlsx)을 만들고 다시 읽어서, 양식 → 작성 → 올리기 흐름이 이어지는지 확인한다.

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { MAX_INDICATORS } from "@/types/indicator";
import { buildTemplate, readSheet } from "./excel";
import { DATA_SHEET_NAME, EXCEL_COLUMNS, GUIDE_SHEET_NAME } from "./excelFormat";
import { parseUploadedSheet } from "./excelRows";

const BRANCH = "테스트부점";
const CONTEXT = { branch: BRANCH, referenceDate: "2026-10-15" };
const HEADERS = EXCEL_COLUMNS.map((column) => column.header);

/** 양식을 만들고 ExcelJS로 다시 열어서 고친 뒤 파일로 돌려준다. (사용자가 엑셀에서 채우는 과정을 흉내 낸다) */
async function fillTemplate(edit: (sheet: ExcelJS.Worksheet) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await buildTemplate(BRANCH)) as unknown as ExcelJS.Buffer);
  edit(workbook.getWorksheet(DATA_SHEET_NAME)!);
  return new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
}

/** 한 줄을 열 이름 → 값으로 채운다. */
function setRow(sheet: ExcelJS.Worksheet, row: number, byHeader: Record<string, ExcelJS.CellValue>) {
  for (const [header, value] of Object.entries(byHeader)) {
    const column = HEADERS.indexOf(header) + 1;
    sheet.getCell(row, column).value = value;
  }
}

describe("buildTemplate (엑셀 양식)", () => {
  it("지표 시트와 작성 안내 시트가 있고, 지표 시트가 첫 번째다", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await buildTemplate(BRANCH)) as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets.map((s) => s.name)).toEqual([DATA_SHEET_NAME, GUIDE_SHEET_NAME]);
  });

  it("첫 줄에 13개 머리글이 순서대로 있다", async () => {
    const sheet = await readSheet(await buildTemplate(BRANCH));
    expect(sheet.headers).toEqual(HEADERS);
  });

  it("부점 칸이 30줄 미리 채워져 있고, 나머지 칸은 비어 있다", async () => {
    const sheet = await readSheet(await buildTemplate(BRANCH));
    const branchIndex = HEADERS.indexOf("부점");
    const filled = sheet.rows.filter((r) => r.cells[branchIndex] === BRANCH);
    expect(filled).toHaveLength(MAX_INDICATORS);
    for (const row of filled) {
      expect(row.cells.filter((cell, i) => i !== branchIndex && cell != null)).toEqual([]);
    }
  });

  it("지표구분 칸에 네 가지 값을 고르는 목록이 걸려 있다", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await buildTemplate(BRANCH)) as unknown as ExcelJS.Buffer);
    const validation = workbook.getWorksheet(DATA_SHEET_NAME)!.getCell(2, 2).dataValidation;
    expect(validation?.type).toBe("list");
    expect(String(validation?.formulae?.[0])).toContain("부점 계량,부점 비계량,공통 계량,공통 비계량");
  });

  it("아무것도 채우지 않고 올리면 '올릴 지표가 없습니다'로 거부된다 (예시 줄이 없다)", async () => {
    const result = parseUploadedSheet(await readSheet(await buildTemplate(BRANCH)), CONTEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toContain("올릴 지표가 없습니다");
  });

  it("작성 안내 시트는 읽지 않는다 (지표 시트가 있으면 그 시트만 읽는다)", async () => {
    const sheet = await readSheet(await buildTemplate(BRANCH));
    expect(sheet.headers).not.toContain("【엑셀 양식 작성 방법】");
  });
});

describe("양식 → 작성 → 올리기", () => {
  it("계량·비계량 지표를 채워서 올리면 검사를 통과해 지표가 된다", async () => {
    const bytes = await fillTemplate((sheet) => {
      setRow(sheet, 2, {
        지표구분: "부점 계량",
        지표명: "수신 잔액 증대",
        세부평가항목: "수신 잔액(억원)",
        평가방법: "기말 − 기초",
        배점: 4,
        기준값: 1000,
        목표값: 1500,
        실적값: 1450,
        예상달성도: 95,
        평가기준일: new Date(Date.UTC(2026, 9, 15)),
      });
      setRow(sheet, 3, {
        지표구분: "공통 비계량",
        지표명: "내부통제 점검 이행",
        세부평가항목: "점검 이행 비율",
        평가방법: "이행 ÷ 전체",
        배점: 3,
        진척률: 90,
        예상달성도: 95,
        평가기준일: "2026-10-15",
      });
    });

    const result = parseUploadedSheet(await readSheet(bytes), CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.indicators).toHaveLength(2);
    expect(result.indicators[0]).toMatchObject({
      branch: BRANCH,
      category: "부점 계량",
      actualValue: 1450,
      evalDate: "2026-10-15",
    });
    expect(result.indicators[1]).toMatchObject({ category: "공통 비계량", progress: 90 });
  });

  it("다른 부점 이름으로 바꿔서 올리면 거부된다", async () => {
    const bytes = await fillTemplate((sheet) => {
      setRow(sheet, 2, {
        부점: "다른부점",
        지표구분: "공통 비계량",
        지표명: "점검",
        세부평가항목: "비율",
        평가방법: "방법",
        배점: 3,
        진척률: 90,
        예상달성도: 95,
        평가기준일: "2026-10-15",
      });
    });
    const result = parseUploadedSheet(await readSheet(bytes), CONTEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toContain("내 부점");
  });

  it("틀린 값은 엑셀 줄 번호와 함께 알려준다", async () => {
    const bytes = await fillTemplate((sheet) => {
      setRow(sheet, 2, {
        지표구분: "영업",
        지표명: "수신",
        세부평가항목: "잔액",
        평가방법: "방법",
        배점: 4,
        예상달성도: 250,
        평가기준일: "2026-10-15",
      });
    });
    const result = parseUploadedSheet(await readSheet(bytes), CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.every((e) => e.row === 2)).toBe(true);
    expect(result.errors.length).toBeGreaterThanOrEqual(2); // 지표구분, 예상달성도
  });

  it("머리글을 지운 파일은 필수 열이 없다고 거부된다", async () => {
    const bytes = await fillTemplate((sheet) => {
      sheet.getCell(1, 2).value = null; // 지표구분 머리글 삭제
    });
    const result = parseUploadedSheet(await readSheet(bytes), CONTEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toContain("지표구분");
  });

  it("지표 시트 이름이 바뀌어도 첫 번째 시트를 읽는다", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await buildTemplate(BRANCH)) as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet(DATA_SHEET_NAME)!;
    sheet.name = "내 지표";
    setRow(sheet, 2, {
      지표구분: "공통 비계량",
      지표명: "점검",
      세부평가항목: "비율",
      평가방법: "방법",
      배점: 3,
      진척률: 90,
      예상달성도: 95,
      평가기준일: "2026-10-15",
    });
    const bytes = new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
    const result = parseUploadedSheet(await readSheet(bytes), CONTEXT);
    expect(result.ok).toBe(true);
  });

  it("엑셀 파일이 아닌 내용을 읽으면 오류를 던진다", async () => {
    await expect(readSheet(new TextEncoder().encode("이것은 엑셀이 아닙니다"))).rejects.toThrow();
  });
});
