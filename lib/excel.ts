// Design Ref: §5.2 ExcelJS — 엑셀 파일을 읽고 만든다. 모든 처리는 브라우저 안에서 하고, 지표 값은 서버로 보내지 않는다.
// Plan SC: 작업 11 — 엑셀 양식 내려받기(buildTemplate)와 엑셀 파일 읽기(readSheet)
//
// 이 파일은 ExcelJS(큰 라이브러리)를 쓰므로, 화면에서는 필요할 때만 불러온다: await import("@/lib/excel")

import ExcelJS from "exceljs";
import {
  DATA_SHEET_NAME,
  EXCEL_COLUMNS,
  GUIDE_SHEET_NAME,
  normalizeHeader,
} from "@/lib/excelFormat";
import { cellToText, type RawSheet } from "@/lib/excelRows";
import { INDICATOR_CATEGORIES, MAX_INDICATORS } from "@/types/indicator";

/** 엑셀 파일(.xlsx)의 내용. 브라우저에서는 Blob으로 감싸 내려받는다. */
export type XlsxBytes = Uint8Array;

/** 머리글 줄을 꾸미는 색 */
const HEADER_FILL = "FFE8EEF7";

/** 한 번에 훑어 읽는 줄 수의 최댓값. 서식만 잔뜩 칠해진 큰 파일에서 멈추지 않게 한다. */
const MAX_SCAN_ROWS = 1000;

/** 머리글을 읽을 최대 열 수 */
const MAX_SCAN_COLUMNS = 60;

/** 작성 안내 시트에 적는 내용 */
const GUIDE_LINES: string[] = [
  "【엑셀 양식 작성 방법】",
  "",
  `1. "${DATA_SHEET_NAME}" 시트에 지표를 한 줄에 하나씩 적습니다. 최대 ${MAX_INDICATORS}개까지 올릴 수 있습니다.`,
  "2. 첫 줄(머리글)은 지우거나 이름을 바꾸지 마세요. 열 순서는 바꿔도 됩니다.",
  "3. 부점 칸은 내 부점 이름이 미리 적혀 있습니다. 다른 부점 이름이 있으면 올릴 수 없습니다.",
  `4. 지표구분은 ${INDICATOR_CATEGORIES.join(" / ")} 중 하나를 고릅니다.`,
  "5. 계량 지표: 기준값, 목표값, 실적값을 적습니다. 진척률은 자동 계산되므로 비워 두세요.",
  "   (목표값과 기준값이 같아 계산할 수 없을 때만 진척률을 직접 적습니다)",
  "6. 비계량 지표: 기준값·목표값·실적값은 비우고, 진척률(0~200)을 직접 적습니다.",
  "7. 예상달성도와 진척률은 0~200 사이 숫자입니다. (100 = 목표 100% 달성)",
  "8. 평가기준일은 2026-10-15처럼 적습니다. 실적을 집계한 날짜입니다.",
  "9. 진척률이 경과율보다 낮은 부진지표는 보완사항을 반드시 적어야 합니다.",
  "10. 올리면 화면의 기존 지표가 모두 올린 파일의 지표로 바뀝니다. (먼저 확인 창이 뜹니다)",
  "",
  "【예시】",
  "계량 : 부점 계량 | 수신 잔액 증대 | 수신 잔액(억원) | 기준값 1000 | 목표값 1500 | 실적값 1300 → 진척률 60.0%",
  "비계량: 공통 비계량 | 내부통제 점검 이행 | 점검 이행 비율 | 진척률 90 → 진척률 90.0%",
  "",
  "※ 앱에서 \"엑셀 내보내기\"로 받은 파일도 다시 올릴 수 있습니다. (부진 여부·경과율·차이 열은 무시됩니다)",
];

/**
 * 엑셀 양식(.xlsx)을 만든다.
 * - "지표" 시트: 머리글 한 줄 + 부점 칸이 미리 채워진 빈 줄 30개. 지표구분 칸은 목록에서 고를 수 있다.
 * - "작성 안내" 시트: 작성 방법과 예시. (올릴 때는 읽지 않는다)
 * 예시 줄을 지표 시트에 넣지 않는 이유: 지우지 않고 올리면 가짜 지표가 등록되기 때문이다.
 */
export async function buildTemplate(branch: string): Promise<XlsxBytes> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "부점 성과지표 관리";

  const sheet = workbook.addWorksheet(DATA_SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = EXCEL_COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: "thin" } };
  });

  const branchColumn = EXCEL_COLUMNS.findIndex((column) => column.key === "branch") + 1;
  const categoryColumn = EXCEL_COLUMNS.findIndex((column) => column.key === "category") + 1;
  const dateColumn = EXCEL_COLUMNS.findIndex((column) => column.key === "evalDate") + 1;

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
    sheet.getCell(row, dateColumn).numFmt = "yyyy-mm-dd";
  }

  const guide = workbook.addWorksheet(GUIDE_SHEET_NAME);
  guide.getColumn(1).width = 110;
  GUIDE_LINES.forEach((line, index) => {
    const cell = guide.getCell(index + 1, 1);
    cell.value = line;
    if (line.startsWith("【")) cell.font = { bold: true, size: 12 };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

/**
 * 엑셀 파일(.xlsx)에서 지표 시트를 읽는다.
 * "지표" 시트가 있으면 그 시트를, 없으면 첫 번째 시트를 읽는다. 첫 줄은 머리글, 그 아래는 데이터 줄이다.
 * 파일이 엑셀 형식이 아니면 오류를 던진다.
 */
export async function readSheet(bytes: ArrayBuffer | Uint8Array): Promise<RawSheet> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS 타입은 Buffer를 요구하지만 실제로는 ArrayBuffer·Uint8Array도 읽는다.
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);

  const sheet = workbook.getWorksheet(DATA_SHEET_NAME) ?? workbook.worksheets[0];
  if (!sheet) {
    throw new Error("엑셀 파일에 시트가 없습니다.");
  }

  const columnCount = Math.min(sheet.columnCount, MAX_SCAN_COLUMNS);
  const headers: string[] = [];
  for (let column = 1; column <= columnCount; column++) {
    headers.push(cellToText(sheet.getCell(1, column).value));
  }

  // 머리글이 빈 칸인 오른쪽 열은 읽지 않는다.
  let lastHeader = headers.length;
  while (lastHeader > 0 && normalizeHeader(headers[lastHeader - 1]) === "") lastHeader--;
  headers.length = lastHeader;

  const lastRow = Math.min(sheet.rowCount, MAX_SCAN_ROWS);
  const rows: RawSheet["rows"] = [];
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const cells: unknown[] = [];
    for (let column = 1; column <= headers.length; column++) {
      cells.push(row.getCell(column).value);
    }
    rows.push({ rowNumber, cells });
  }

  return { headers, rows };
}
