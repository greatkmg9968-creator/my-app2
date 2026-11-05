// Plan SC: 작업 11 — 실제 엑셀 파일(.xlsx)을 만들고 다시 읽어서, 양식 → 작성 → 올리기 흐름이 이어지는지 확인한다.

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { MAX_INDICATORS } from "@/types/indicator";
import { evaluateIndicator } from "./calc";
import { buildExport, buildTemplate, readSheet, readWorkbook } from "./excel";
import { EXPORT_HEADERS } from "./excelExport";
import {
  ACTIONS_SHEET_NAME,
  DATA_SHEET_NAME,
  EXCEL_COLUMNS,
  GUIDE_SHEET_NAME,
  MONTHLY_SHEET_NAME,
  TASKS_SHEET_NAME,
} from "./excelFormat";
import { parseUploadedSheet, parseUploadedWorkbook } from "./excelRows";
import type { IndicatorRow } from "./filterSort";
import { SAMPLE_BRANCH, SAMPLE_INDICATORS, SAMPLE_REFERENCE_DATE } from "./fixtureData";

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
  it("지표·월별실적·개선조치·추진과제·작성 안내 시트가 있고, 지표 시트가 첫 번째다", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await buildTemplate(BRANCH)) as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      DATA_SHEET_NAME,
      MONTHLY_SHEET_NAME,
      ACTIONS_SHEET_NAME,
      TASKS_SHEET_NAME,
      GUIDE_SHEET_NAME,
    ]);
  });

  it("첫 줄에 13개 머리글과 집계방식이 순서대로 있다", async () => {
    const sheet = await readSheet(await buildTemplate(BRANCH));
    expect(sheet.headers).toEqual([...HEADERS, "집계방식"]);
  });

  it("집계방식 칸에 누적·월말값을, 개선조치·추진과제의 상태 칸에 예정·진행·완료를 고르는 목록이 걸려 있다", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await buildTemplate(BRANCH)) as unknown as ExcelJS.Buffer);
    const aggregation = workbook.getWorksheet(DATA_SHEET_NAME)!.getCell(2, HEADERS.length + 1).dataValidation;
    expect(String(aggregation?.formulae?.[0])).toContain("누적,월말값");
    const actionStatus = workbook.getWorksheet(ACTIONS_SHEET_NAME)!.getCell(2, 5).dataValidation;
    expect(String(actionStatus?.formulae?.[0])).toContain("예정,진행,완료");
    const taskStatus = workbook.getWorksheet(TASKS_SHEET_NAME)!.getCell(2, 5).dataValidation;
    expect(String(taskStatus?.formulae?.[0])).toContain("예정,진행,완료");
  });

  it("월별실적·개선조치·추진과제 시트는 머리글만 있는 빈 시트다", async () => {
    const book = await readWorkbook(await buildTemplate(BRANCH));
    expect(book.monthly?.headers).toEqual(["지표명", ...Array.from({ length: 12 }, (_, i) => `${i + 1}월`)]);
    expect(book.actions?.headers).toEqual(["지표명", "일자", "조치내용", "담당자", "상태", "효과"]);
    expect(book.tasks?.headers).toEqual(["지표명", "과제명", "기한", "담당자", "상태"]);
    for (const sheet of [book.monthly, book.actions, book.tasks]) {
      expect(sheet?.rows.every((row) => row.cells.every((cell) => cell == null))).toBe(true);
    }
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
    const result = parseUploadedWorkbook(await readWorkbook(await buildTemplate(BRANCH)), CONTEXT);
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

// ─────────────────────────────────────────────────────────────────────────────
// 작업 12 — 현황 엑셀 내보내기. 내보낸 파일의 모양과, 다시 올렸을 때 같은 지표가 나오는지 확인한다.
// ─────────────────────────────────────────────────────────────────────────────

/** 샘플 지표를 자료 기준일로 평가한 표 줄들 */
function sampleRows(referenceDate: string, indicators = SAMPLE_INDICATORS): IndicatorRow[] {
  return indicators.map((indicator, index) => ({
    indicator,
    evaluation: evaluateIndicator(indicator, referenceDate),
    index,
  }));
}

/** 내보내고 ExcelJS로 다시 열어 시트를 돌려준다. */
async function exportAndOpen(referenceDate: string, indicators = SAMPLE_INDICATORS) {
  const rows = sampleRows(referenceDate, indicators);
  const bytes = await buildExport({
    rows,
    branch: SAMPLE_BRANCH,
    referenceDate,
    elapsedRate: rows[0].evaluation.elapsedRate,
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  return { bytes, sheet: workbook.getWorksheet(DATA_SHEET_NAME)!, rows };
}

const SAMPLE_CONTEXT = { branch: SAMPLE_BRANCH, referenceDate: SAMPLE_REFERENCE_DATE };
/** 왕복 확인에 쓰는 샘플. 이제 판정 보류가 없어 30건 모두 올릴 수 있다. */
const VALID_SAMPLES = SAMPLE_INDICATORS;

describe("buildExport (현황 내보내기)", () => {
  it("위쪽에 제목·자료 기준일·경과율을 적고, 한 줄 띄운 뒤 머리글과 지표 30건이 이어진다", async () => {
    const { sheet } = await exportAndOpen("2026-10-15");
    expect(sheet.getCell(1, 1).value).toBe("샘플부점 성과지표 현황");
    expect(sheet.getCell(2, 1).value).toBe("자료 기준일: 2026-10-15");
    expect(sheet.getCell(3, 1).value).toBe("경과율: 78.9%");
    // 4번째 줄은 비워 두고(보완사항 경고가 없을 때), 머리글은 5번째 줄
    expect(sheet.getCell(4, 1).value).toBeNull();
    expect(EXPORT_HEADERS.map((_, i) => sheet.getCell(5, i + 1).value)).toEqual(EXPORT_HEADERS);
    expect(sheet.getCell(6, 3).value).toBe("신규 고객 유치"); // 첫 지표
    expect(sheet.getCell(35, 3).value).toBe("정성 평가 지표"); // 30번째 지표
    expect(sheet.getCell(36, 3).value).toBeNull();
  });

  it("지표 칸은 숫자는 숫자로, 부진지표에는 부진여부·경과율·차이가 들어간다", async () => {
    const { sheet } = await exportAndOpen("2026-10-15");
    const col = (header: string) => EXPORT_HEADERS.indexOf(header) + 1;
    // 7번째 줄 = 두 번째 지표(수신 잔액 증대, 부진)
    expect(sheet.getCell(7, col("지표명")).value).toBe("수신 잔액 증대");
    expect(sheet.getCell(7, col("목표값")).value).toBe(1500);
    expect(sheet.getCell(7, col("진척률")).value).toBe(60);
    expect(sheet.getCell(7, col("부진여부")).value).toBe("부진");
    expect(sheet.getCell(7, col("경과율(%)")).value).toBe(78.9);
    expect(sheet.getCell(7, col("차이(%p)")).value).toBe(-18.9);
    expect(sheet.getCell(7, col("평가기준일")).value).toBe("2026-10-15");
  });

  it("부진지표 줄은 붉게 칠하고, 정상 줄은 칠하지 않는다", async () => {
    const { sheet } = await exportAndOpen("2026-10-15");
    const fillOf = (row: number) => (sheet.getCell(row, 1).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
    expect(fillOf(6)).toBeUndefined(); // 신규 고객 유치: 정상
    expect(fillOf(7)).toBe("FFFDE8E8"); // 수신 잔액 증대: 부진
  });

  it("머리글 아래부터 스크롤되고 걸러보기가 걸려 있다", async () => {
    const { sheet } = await exportAndOpen("2026-10-15");
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 5 });
    expect(sheet.autoFilter).toBeTruthy();
  });

  it("필터와 관계없이 전달받은 지표 전체를 내보낸다 (3건만 주면 3건)", async () => {
    const { sheet } = await exportAndOpen("2026-10-15", SAMPLE_INDICATORS.slice(0, 3));
    expect(sheet.getCell(8, 3).value).toBe("여신 잔액 증대");
    expect(sheet.getCell(9, 3).value).toBeNull();
  });

  it("보완사항이 빈 부진지표가 있으면 위쪽에 경고 줄이 생기고 머리글이 한 줄 내려간다", async () => {
    const { sheet } = await exportAndOpen("2026-11-04");
    expect(String(sheet.getCell(4, 1).value)).toContain("보완사항이 비어 있는 부진지표가 6건");
    expect(sheet.getCell(5, 1).value).toBeNull();
    expect(sheet.getCell(6, 2).value).toBe("지표구분");
    expect(sheet.views[0]).toMatchObject({ ySplit: 6 });
  });
});

describe("내보낸 파일 다시 올리기 (왕복)", () => {
  it("머리글 줄이 위쪽 기준 정보 아래에 있어도 찾아서 읽는다", async () => {
    const { bytes } = await exportAndOpen("2026-10-15");
    const sheet = await readSheet(bytes);
    expect(sheet.headers).toEqual(EXPORT_HEADERS);
    expect(sheet.rows[0].rowNumber).toBe(6); // 엑셀에서 보이는 첫 지표 줄 번호
    expect(sheet.rows.filter((r) => r.cells[2] != null)).toHaveLength(30);
  });

  it("양식 파일은 여전히 첫 줄이 머리글이다", async () => {
    const sheet = await readSheet(await buildTemplate(BRANCH));
    expect(sheet.rows[0].rowNumber).toBe(2);
  });

  it("내보낸 파일을 그대로 올리면 같은 지표가 번호·월별 실적·개선조치·추진과제까지 그대로 돌아온다", async () => {
    const { bytes } = await exportAndOpen("2026-10-15", VALID_SAMPLES);
    const result = parseUploadedWorkbook(await readWorkbook(bytes), SAMPLE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.indicators).toHaveLength(VALID_SAMPLES.length);
    expect(result.indicators).toEqual(VALID_SAMPLES);
  });

  it("지표 시트만 읽으면 월별 실적만 있는 지표는 실적값이 없어서 거부된다 (월별실적 시트를 함께 읽어야 한다)", async () => {
    const { bytes } = await exportAndOpen("2026-10-15", VALID_SAMPLES);
    const result = parseUploadedSheet(await readSheet(bytes), SAMPLE_CONTEXT);
    expect(result.ok).toBe(false);
  });

  it("다시 올려도 수치 지표의 진척률은 계산값 그대로, 범위 밖 값도 저장된 값 그대로다", async () => {
    const { bytes } = await exportAndOpen("2026-10-15", VALID_SAMPLES);
    const result = parseUploadedWorkbook(await readWorkbook(bytes), SAMPLE_CONTEXT);
    if (!result.ok) throw new Error("올리기 실패");
    const rows = sampleRows("2026-10-15", result.indicators);
    const over = rows.find((r) => r.indicator.name === "비이자 수익 확대");
    const under = rows.find((r) => r.indicator.name === "순이자마진 개선");
    expect(over?.evaluation.progress).toBe(260);
    expect(under?.evaluation.progress).toBe(-40);
  });

  it("월별 실적이 있는 지표는 내보낸 지표 시트의 실적값이 비어 있고, 현재실적 열에 기준일까지의 값이 적힌다", async () => {
    const { sheet } = await exportAndOpen("2026-10-15");
    const col = (header: string) => EXPORT_HEADERS.indexOf(header) + 1;
    // 6번째 줄 = 신규 고객 유치(누적, 월별 실적 있음), 7번째 줄 = 수신 잔액 증대(월말값)
    expect(sheet.getCell(6, col("실적값")).value).toBeNull();
    expect(sheet.getCell(6, col("현재실적")).value).toBe(1050);
    expect(sheet.getCell(6, col("집계방식")).value).toBe("누적");
    expect(sheet.getCell(7, col("집계방식")).value).toBe("월말값");
    expect(sheet.getCell(7, col("현재실적")).value).toBe(1300);
    expect(sheet.getCell(7, col("지표ID")).value).toBe("sample-2");
  });

  it("월별실적·개선조치·추진과제 시트에 입력해 둔 기록이 담긴다", async () => {
    const { bytes } = await exportAndOpen("2026-10-15");
    const book = await readWorkbook(bytes);
    const texts = (rows: { cells: unknown[] }[]) =>
      rows.filter((r) => r.cells[0] != null).map((r) => String(r.cells[0]));
    expect(texts(book.monthly!.rows)).toEqual(["신규 고객 유치", "수신 잔액 증대", "카드 신규 발급", "연체율 관리"]);
    expect(texts(book.actions!.rows)).toEqual(["수신 잔액 증대", "수신 잔액 증대", "카드 신규 발급", "민원 건수 감축"]);
    expect(texts(book.tasks!.rows)).toEqual(["수신 잔액 증대", "수신 잔액 증대", "카드 신규 발급", "외환 거래 확대"]);
  });

  it("첨부파일이 있는 지표가 있으면 첨부파일목록 시트가 생기고, 올릴 때는 읽지 않는다", async () => {
    const withFile = SAMPLE_INDICATORS.map((i) =>
      i.name === "수신 잔액 증대"
        ? { ...i, attachments: [{ id: "f1", kind: "실적자료" as const, name: "3분기_실적.pdf", size: 2048, type: "application/pdf", addedAt: "2026-10-01T09:00:00.000Z" }] }
        : i,
    );
    const { bytes } = await exportAndOpen("2026-10-15", withFile);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet("첨부파일목록")!;
    expect(sheet.getCell(2, 1).value).toBe("수신 잔액 증대");
    expect(sheet.getCell(2, 3).value).toBe("3분기_실적.pdf");
    expect(sheet.getCell(2, 4).value).toBe(2);
    // 올릴 때는 첨부파일 정보가 붙지 않는다. (파일은 엑셀에 없고 브라우저에만 있다)
    const parsed = parseUploadedWorkbook(await readWorkbook(bytes), SAMPLE_CONTEXT);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.indicators.every((i) => i.attachments === undefined)).toBe(true);
  });

  it("월별실적 시트의 지표명이 지표 시트에 없으면 거부된다", async () => {
    const { bytes } = await exportAndOpen("2026-10-15", VALID_SAMPLES);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    workbook.getWorksheet(MONTHLY_SHEET_NAME)!.getCell(2, 1).value = "없는 지표";
    const changed = new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
    const result = parseUploadedWorkbook(await readWorkbook(changed), SAMPLE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.sheet === MONTHLY_SHEET_NAME && e.row === 2)).toBe(true);
  });

  it("보완사항이 빈 부진지표는 다시 올릴 때 보완사항을 요구한다 (기준일 2026-11-04)", async () => {
    const { bytes } = await exportAndOpen("2026-11-04", VALID_SAMPLES);
    const result = parseUploadedWorkbook(await readWorkbook(bytes), {
      branch: SAMPLE_BRANCH,
      referenceDate: "2026-11-04",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every((e) => e.message.startsWith("보완사항:"))).toBe(true);
  });
});
