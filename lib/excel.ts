// Design Ref: §5.2 ExcelJS — 엑셀 파일을 읽고 만든다. 모든 처리는 브라우저 안에서 하고, 지표 값은 서버로 보내지 않는다.
// Plan SC: 작업 11 — 엑셀 양식 내려받기(buildTemplate)와 엑셀 파일 읽기(readSheet)
// Plan SC: 작업 12 — 현황 엑셀 내보내기(buildExport)
// Plan SC: 작업 15~18 — 월별실적·개선조치·추진과제 시트(첨부파일목록은 내보낼 때만)를 함께 읽고 쓴다.
//
// 이 파일은 ExcelJS(큰 라이브러리)를 쓰므로, 화면에서는 필요할 때만 불러온다: await import("@/lib/excel")

import ExcelJS from "exceljs";
import {
  ACTIONS_SHEET_NAME,
  ACTION_HEADERS,
  AGGREGATION_LIST_FORMULA,
  ATTACHMENTS_SHEET_NAME,
  ATTACHMENT_HEADERS,
  DATA_SHEET_NAME,
  EXCEL_COLUMNS,
  EXPORT_EXTRA_COLUMNS,
  GUIDE_SHEET_NAME,
  MONTHLY_HEADERS,
  MONTHLY_SHEET_NAME,
  OPTIONAL_COLUMNS,
  STATUS_LIST_FORMULA,
  TASKS_SHEET_NAME,
  TASK_HEADERS,
  normalizeHeader,
} from "@/lib/excelFormat";
import {
  EXPORT_HEADERS,
  actionSheetRows,
  attachmentSheetRows,
  exportInfoLines,
  monthlySheetRows,
  taskSheetRows,
  toExportCells,
  type ExportCell,
} from "@/lib/excelExport";
import { cellToText, type RawSheet, type RawWorkbook } from "@/lib/excelRows";
import type { IndicatorRow } from "@/lib/filterSort";
import { INDICATOR_CATEGORIES, MAX_INDICATORS } from "@/types/indicator";

/** 엑셀 파일(.xlsx)의 내용. 브라우저에서는 Blob으로 감싸 내려받는다. */
export type XlsxBytes = Uint8Array;

/** 머리글 줄을 꾸미는 색 */
const HEADER_FILL = "FFE8EEF7";

/** 한 번에 훑어 읽는 줄 수의 최댓값. 서식만 잔뜩 칠해진 큰 파일에서 멈추지 않게 한다. */
const MAX_SCAN_ROWS = 1000;

/** 머리글을 읽을 최대 열 수 */
const MAX_SCAN_COLUMNS = 60;

/** 머리글 줄을 찾기 위해 위에서부터 훑어보는 줄 수 */
const MAX_HEADER_SEARCH_ROWS = 30;

/** 내보내는 파일에서 부진지표 줄에 칠하는 연한 붉은색 */
const DELAYED_FILL = "FFFDE8E8";

/** 내보내는 파일에서 경고 글자 색 */
const WARNING_FONT_COLOR = "FFB91C1C";

/** 빈 양식의 하위 시트에 미리 걸어 두는 줄 수 (진행 상태 목록을 걸어 둔다) */
const TEMPLATE_SUBSHEET_ROWS = 200;

/** 작성 안내 시트에 적는 내용 */
const GUIDE_LINES: string[] = [
  "【엑셀 양식 작성 방법】",
  "",
  `1. "${DATA_SHEET_NAME}" 시트에 지표를 한 줄에 하나씩 적습니다. 최대 ${MAX_INDICATORS}개까지 올릴 수 있습니다.`,
  "2. 첫 줄(머리글)은 지우거나 이름을 바꾸지 마세요. 열 순서는 바꿔도 됩니다.",
  "3. 부점 칸은 화면에 입력한 부점 이름이 미리 적혀 있습니다. 화면의 부점 이름과 다르면 올릴 수 없습니다.",
  `4. 지표구분은 ${INDICATOR_CATEGORIES.join(" / ")} 중 하나를 고릅니다. 지표명은 겹치지 않게 적습니다.`,
  "5. 계량 지표: 기준값, 목표값, 실적값을 적습니다. 진척률은 자동 계산되므로 비워 두세요.",
  "   (목표값과 기준값이 같아 계산할 수 없을 때만 진척률을 직접 적습니다)",
  "6. 비계량 지표: 기준값·목표값·실적값은 비우고, 진척률(0~200)을 직접 적습니다.",
  "7. 예상달성도와 진척률은 0~200 사이 숫자입니다. (100 = 목표 100% 달성)",
  "8. 평가기준일은 2026-10-15처럼 적습니다. 실적을 집계한 날짜입니다.",
  "9. 진척률이 경과율보다 낮은 부진지표는 보완사항을 반드시 적어야 합니다.",
  "",
  "【집계방식과 월별 실적(선택)】",
  "10. 집계방식은 계량 지표만 적습니다. 비우면 \"누적\"입니다.",
  "    누적: 월별 실적을 더해서 현재 실적을 구합니다. (신규 고객 수, 판매액처럼 쌓이는 지표)",
  "    월말값: 가장 최근 달의 값을 현재 실적으로 씁니다. (잔액, 연체율처럼 그 시점의 수준을 보는 지표)",
  `11. "${MONTHLY_SHEET_NAME}" 시트에 지표명과 1월~12월의 \"그 달 실적\"을 적으면, 앱이 월별 누적을 계산해 그래프로 보여줍니다.`,
  "    월별 실적을 적은 지표는 자료 기준일이 속한 달까지의 값으로 현재 실적이 자동 계산되므로 실적값은 비워도 됩니다.",
  "",
  "【개선조치·추진과제(선택)】",
  `12. "${ACTIONS_SHEET_NAME}" 시트: 지표명, 일자, 조치내용, 담당자, 상태(예정/진행/완료), 효과를 한 줄에 한 건씩 적습니다.`,
  `13. "${TASKS_SHEET_NAME}" 시트: 지표명, 과제명, 기한(비워도 됨), 담당자, 상태를 한 줄에 한 건씩 적습니다.`,
  "    두 시트의 지표명은 \"지표\" 시트에 있는 지표명과 같아야 합니다.",
  "",
  "【올리기】",
  "14. 올리면 화면의 기존 지표가 모두 올린 파일의 지표로 바뀝니다. (먼저 확인 창이 뜹니다)",
  "    첨부파일은 이 컴퓨터에 따로 저장되어 있어서, 같은 지표(지표ID 또는 지표명이 같은 지표)에 그대로 이어집니다.",
  "",
  "【예시】",
  "계량 : 부점 계량 | 수신 잔액 증대 | 수신 잔액(억원) | 기준값 1000 | 목표값 1500 | 실적값 1300 → 진척률 60.0%",
  "비계량: 공통 비계량 | 내부통제 점검 이행 | 점검 이행 비율 | 진척률 90 → 진척률 90.0%",
  "",
  "※ 앱에서 \"엑셀 내보내기\"로 받은 파일도 다시 올릴 수 있습니다. (현재실적·부진여부·경과율·차이 열과 첨부파일목록 시트는 무시됩니다)",
];

/** 머리글 줄을 굵게 하고 색을 칠한다. */
function styleHeaderRow(row: ExcelJS.Row, columnCount: number): void {
  row.font = { bold: true };
  row.alignment = { vertical: "middle", horizontal: "center" };
  for (let column = 1; column <= columnCount; column++) {
    const cell = row.getCell(column);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: "thin" } };
  }
}

/** 열 번호(1부터)에 "예정/진행/완료" 선택 목록을 걸어 둔다. */
function addStatusList(sheet: ExcelJS.Worksheet, column: number, firstRow: number, lastRow: number): void {
  for (let row = firstRow; row <= lastRow; row++) {
    sheet.getCell(row, column).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [STATUS_LIST_FORMULA],
      showErrorMessage: true,
      errorTitle: "진행 상태",
      error: "예정 / 진행 / 완료 중 하나를 골라 주세요.",
    };
  }
}

/** 머리글 한 줄과 데이터 줄들이 있는 시트를 만든다. (월별실적·개선조치·추진과제·첨부파일목록) */
function addTableSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: readonly string[],
  widths: readonly number[],
  rows: readonly ExportCell[][],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  const headerRow = sheet.getRow(1);
  headers.forEach((header, index) => {
    headerRow.getCell(index + 1).value = header;
  });
  styleHeaderRow(headerRow, headers.length);
  rows.forEach((values, offset) => {
    const row = sheet.getRow(offset + 2);
    values.forEach((value, index) => {
      row.getCell(index + 1).value = value;
    });
    row.alignment = { vertical: "top", wrapText: true };
  });
  return sheet;
}

/** 월별실적 시트의 열 너비: 지표명 + 12개월 */
const MONTHLY_WIDTHS = [26, ...Array.from({ length: 12 }, () => 9)];
const ACTION_WIDTHS = [26, 13, 40, 14, 9, 30];
const TASK_WIDTHS = [26, 36, 13, 14, 9];
const ATTACHMENT_WIDTHS = [26, 10, 40, 10, 24];

/** 월별실적·개선조치·추진과제 시트를 만든다. (내용이 없으면 머리글만 있는 빈 시트) */
function addRecordSheets(
  workbook: ExcelJS.Workbook,
  rows: { monthly: ExportCell[][]; actions: ExportCell[][]; tasks: ExportCell[][] },
  statusRows: number,
): void {
  addTableSheet(workbook, MONTHLY_SHEET_NAME, MONTHLY_HEADERS, MONTHLY_WIDTHS, rows.monthly);
  const actions = addTableSheet(workbook, ACTIONS_SHEET_NAME, ACTION_HEADERS, ACTION_WIDTHS, rows.actions);
  addStatusList(actions, ACTION_HEADERS.indexOf("상태") + 1, 2, statusRows + 1);
  const tasks = addTableSheet(workbook, TASKS_SHEET_NAME, TASK_HEADERS, TASK_WIDTHS, rows.tasks);
  addStatusList(tasks, TASK_HEADERS.indexOf("상태") + 1, 2, statusRows + 1);
}

/**
 * 엑셀 양식(.xlsx)을 만든다.
 * - "지표" 시트: 머리글 한 줄 + 부점 칸이 미리 채워진 빈 줄 30개. 지표구분·집계방식 칸은 목록에서 고를 수 있다.
 * - "월별실적" · "개선조치" · "추진과제" 시트: 머리글만 있는 빈 시트(쓰지 않아도 된다).
 * - "작성 안내" 시트: 작성 방법과 예시. (올릴 때는 읽지 않는다)
 * 예시 줄을 지표 시트에 넣지 않는 이유: 지우지 않고 올리면 가짜 지표가 등록되기 때문이다.
 */
export async function buildTemplate(branch: string): Promise<XlsxBytes> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "부점 성과지표 관리";

  // 양식에는 집계방식까지만 넣는다. (지표ID는 내보낸 파일에만 있다)
  const columns = [...EXCEL_COLUMNS, OPTIONAL_COLUMNS[0]];
  const sheet = workbook.addWorksheet(DATA_SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));

  styleHeaderRow(sheet.getRow(1), columns.length);

  const branchColumn = columns.findIndex((column) => column.key === "branch") + 1;
  const categoryColumn = columns.findIndex((column) => column.key === "category") + 1;
  const dateColumn = columns.findIndex((column) => column.key === "evalDate") + 1;
  const aggregationColumn = columns.findIndex((column) => column.key === "aggregation") + 1;

  for (let row = 2; row <= MAX_INDICATORS + 1; row++) {
    sheet.getCell(row, branchColumn).value = branch;
    // 지표구분은 네 가지 중에서만 고르게 한다.
    sheet.getCell(row, categoryColumn).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${INDICATOR_CATEGORIES.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "지표구분",
      error: `${INDICATOR_CATEGORIES.join(" / ")} 중 하나를 골라 주세요.`,
    };
    sheet.getCell(row, aggregationColumn).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [AGGREGATION_LIST_FORMULA],
      showErrorMessage: true,
      errorTitle: "집계방식",
      error: "누적 / 월말값 중 하나를 골라 주세요.",
    };
    sheet.getCell(row, dateColumn).numFmt = "yyyy-mm-dd";
  }

  addRecordSheets(workbook, { monthly: [], actions: [], tasks: [] }, TEMPLATE_SUBSHEET_ROWS);

  const guide = workbook.addWorksheet(GUIDE_SHEET_NAME);
  guide.getColumn(1).width = 120;
  GUIDE_LINES.forEach((line, index) => {
    const cell = guide.getCell(index + 1, 1);
    cell.value = line;
    if (line.startsWith("【")) cell.font = { bold: true, size: 12 };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

/** 내보낼 때 필요한 정보 */
export interface ExportInput {
  /** 화면의 모든 지표를 평가한 줄들. 필터·정렬과 관계없이 전체를 넣는다. */
  rows: IndicatorRow[];
  /** 화면에 입력한 부점 이름 */
  branch: string;
  /** 화면의 자료 기준일 */
  referenceDate: string;
  /** 자료 기준일의 경과율(%) */
  elapsedRate: number;
}

/**
 * 현황을 엑셀 파일(.xlsx)로 만든다.
 * - "지표" 시트: 위쪽에 제목·자료 기준일·경과율(보완사항이 빈 부진지표가 있으면 경고)을 적고,
 *   한 줄 띄운 뒤 머리글과 전체 지표를 적는다. 부진지표 줄은 붉게 칠한다.
 * - "월별실적" · "개선조치" · "추진과제" 시트: 입력해 둔 기록을 적는다. 올릴 때 지표에 다시 붙는다.
 * - "첨부파일목록" 시트: 올려 둔 파일의 이름과 크기(참고용). 파일 자체는 엑셀에 들어가지 않는다.
 * - 올리기와 같은 13개 열 뒤에 집계방식·지표ID와 현재실적·부진여부·경과율·차이 열을 더한다.
 *   이 파일은 "엑셀 올리기"로 다시 올릴 수 있다.
 */
export async function buildExport(input: ExportInput): Promise<XlsxBytes> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "부점 성과지표 관리";

  const sheet = workbook.addWorksheet(DATA_SHEET_NAME);
  const widths = [
    ...EXCEL_COLUMNS.map((c) => c.width),
    ...OPTIONAL_COLUMNS.map((c) => c.width),
    ...EXPORT_EXTRA_COLUMNS.map((c) => c.width),
  ];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  // 위쪽 기준 정보
  const infoLines = exportInfoLines({
    branch: input.branch,
    referenceDate: input.referenceDate,
    elapsedRate: input.elapsedRate,
    rows: input.rows,
  });
  infoLines.forEach((line, index) => {
    const cell = sheet.getCell(index + 1, 1);
    cell.value = line.text;
    cell.font = {
      bold: index === 0 || line.warning,
      size: index === 0 ? 14 : 11,
      ...(line.warning ? { color: { argb: WARNING_FONT_COLOR } } : {}),
    };
  });

  // 한 줄 띄우고 머리글
  const headerRowNumber = infoLines.length + 2;
  const headerRow = sheet.getRow(headerRowNumber);
  EXPORT_HEADERS.forEach((header, index) => {
    headerRow.getCell(index + 1).value = header;
  });
  styleHeaderRow(headerRow, EXPORT_HEADERS.length);

  // 지표 줄
  const noteColumn = EXPORT_HEADERS.indexOf("보완사항") + 1;
  const statusColumn = EXPORT_HEADERS.indexOf("부진여부") + 1;
  input.rows.forEach((row, offset) => {
    const excelRow = sheet.getRow(headerRowNumber + 1 + offset);
    toExportCells(row).forEach((value, index) => {
      excelRow.getCell(index + 1).value = value;
    });
    excelRow.alignment = { vertical: "top" };
    excelRow.getCell(noteColumn).alignment = { vertical: "top", wrapText: true };

    if (row.evaluation.status === "delayed") {
      excelRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        if (columnNumber > EXPORT_HEADERS.length) return;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DELAYED_FILL } };
      });
      excelRow.getCell(statusColumn).font = { bold: true, color: { argb: WARNING_FONT_COLOR } };
    }
  });

  // 머리글 줄 아래부터 스크롤되고, 머리글에 걸러보기 단추가 붙는다.
  sheet.views = [{ state: "frozen", ySplit: headerRowNumber }];
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: EXPORT_HEADERS.length },
  };

  // 기록 시트들
  const indicators = input.rows.map((row) => row.indicator);
  const monthly = monthlySheetRows(indicators);
  const actions = actionSheetRows(indicators);
  const tasks = taskSheetRows(indicators);
  addRecordSheets(workbook, { monthly, actions, tasks }, Math.max(actions.length, tasks.length, 50));

  const attachments = attachmentSheetRows(indicators);
  if (attachments.length > 0) {
    addTableSheet(workbook, ATTACHMENTS_SHEET_NAME, ATTACHMENT_HEADERS, ATTACHMENT_WIDTHS, attachments);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

/**
 * 시트 하나를 읽는다. 머리글 줄은 위에서부터 찾는다: markers에 적은 열 이름이 모두 있는 첫 줄.
 * (양식은 첫 줄, 내보낸 지표 시트는 위쪽에 기준 정보가 있어 몇 줄 아래) 찾지 못하면 첫 줄을 머리글로 본다.
 */
function readWorksheet(sheet: ExcelJS.Worksheet, markers: readonly string[]): RawSheet {
  const columnCount = Math.min(sheet.columnCount, MAX_SCAN_COLUMNS);
  const readHeaders = (rowNumber: number): string[] => {
    const texts: string[] = [];
    for (let column = 1; column <= columnCount; column++) {
      texts.push(cellToText(sheet.getCell(rowNumber, column).value));
    }
    return texts;
  };

  let headerRowNumber = 1;
  const searchLast = Math.min(sheet.rowCount, MAX_HEADER_SEARCH_ROWS);
  for (let rowNumber = 1; rowNumber <= searchLast; rowNumber++) {
    const normalized = readHeaders(rowNumber).map(normalizeHeader);
    if (markers.every((marker) => normalized.includes(normalizeHeader(marker)))) {
      headerRowNumber = rowNumber;
      break;
    }
  }
  const headers = readHeaders(headerRowNumber);

  // 머리글이 빈 칸인 오른쪽 열은 읽지 않는다.
  let lastHeader = headers.length;
  while (lastHeader > 0 && normalizeHeader(headers[lastHeader - 1]) === "") lastHeader--;
  headers.length = lastHeader;

  const lastRow = Math.min(sheet.rowCount, MAX_SCAN_ROWS);
  const rows: RawSheet["rows"] = [];
  for (let rowNumber = headerRowNumber + 1; rowNumber <= lastRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const cells: unknown[] = [];
    for (let column = 1; column <= headers.length; column++) {
      cells.push(row.getCell(column).value);
    }
    rows.push({ rowNumber, cells });
  }

  return { headers, rows };
}

/**
 * 엑셀 파일(.xlsx) 전체를 읽는다.
 * - 지표 시트: "지표" 시트가 있으면 그 시트를, 없으면 첫 번째 시트를 읽는다.
 * - 월별실적·개선조치·추진과제 시트: 있을 때만 읽는다. (이름은 정확히 같아야 한다)
 * 파일이 엑셀 형식이 아니면 오류를 던진다.
 */
export async function readWorkbook(bytes: ArrayBuffer | Uint8Array): Promise<RawWorkbook> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS 타입은 Buffer를 요구하지만 실제로는 ArrayBuffer·Uint8Array도 읽는다.
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);

  const mainSheet = workbook.getWorksheet(DATA_SHEET_NAME) ?? workbook.worksheets[0];
  if (!mainSheet) {
    throw new Error("엑셀 파일에 시트가 없습니다.");
  }

  const optional = (name: string, markers: readonly string[]): RawSheet | undefined => {
    const sheet = workbook.getWorksheet(name);
    return sheet && sheet !== mainSheet ? readWorksheet(sheet, markers) : undefined;
  };

  return {
    main: readWorksheet(mainSheet, ["지표구분", "지표명"]),
    monthly: optional(MONTHLY_SHEET_NAME, ["지표명", "1월"]),
    actions: optional(ACTIONS_SHEET_NAME, ["지표명", "조치내용"]),
    tasks: optional(TASKS_SHEET_NAME, ["지표명", "과제명"]),
  };
}

/** 지표 시트만 읽는다. (readWorkbook의 main) */
export async function readSheet(bytes: ArrayBuffer | Uint8Array): Promise<RawSheet> {
  return (await readWorkbook(bytes)).main;
}
