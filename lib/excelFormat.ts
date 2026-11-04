// Design Ref: §3.2 엑셀 양식 — 올리기·내보내기가 함께 쓰는 열 이름과 파일 규칙을 한곳에 모은다.
// Plan SC: 작업 11 — 엑셀 양식 내려받기와 엑셀 파일 일괄 등록

import type { IndicatorFormValues } from "@/lib/indicatorForm";

/** 지표를 적는 시트 이름. 올릴 때 이 이름의 시트를 읽고, 없으면 첫 번째 시트를 읽는다. */
export const DATA_SHEET_NAME = "지표";

/** 작성 방법을 적어 둔 시트 이름. 올릴 때는 읽지 않는다. */
export const GUIDE_SHEET_NAME = "작성 안내";

/** 양식 파일 이름 */
export const TEMPLATE_FILE_NAME = "지표_입력양식.xlsx";

/** 올릴 수 있는 파일 크기의 최댓값(바이트): 5MB */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** 엑셀 한 열이 가리키는 입력 칸. 부점은 폼에 입력칸이 없어서 따로 둔다. */
export type ExcelFieldKey = keyof IndicatorFormValues | "branch";

/** 엑셀 열 한 개의 정의 */
export interface ExcelColumn {
  /** 첫 줄(머리글)에 적는 이름 */
  header: string;
  /** 이 열이 가리키는 입력 칸 */
  key: ExcelFieldKey;
  /** 열 너비(글자 수) */
  width: number;
  /** 머리글 이름을 읽을 때 같은 뜻으로 받아 줄 다른 이름들 */
  aliases?: string[];
}

/**
 * 양식의 열 순서. 올릴 때는 열 순서와 관계없이 머리글 이름으로 찾고,
 * 이 목록에 없는 열(내보낸 파일의 부진 여부·경과율·차이 등)은 무시한다.
 */
export const EXCEL_COLUMNS: readonly ExcelColumn[] = [
  { header: "부점", key: "branch", width: 14 },
  { header: "지표구분", key: "category", width: 14 },
  { header: "지표명", key: "name", width: 26 },
  { header: "세부평가항목", key: "item", width: 28, aliases: ["평가항목"] },
  { header: "평가방법", key: "method", width: 28 },
  { header: "배점", key: "weight", width: 8 },
  { header: "기준값", key: "baseValue", width: 10 },
  { header: "목표값", key: "targetValue", width: 10 },
  { header: "실적값", key: "actualValue", width: 10 },
  { header: "진척률", key: "progress", width: 10 },
  { header: "예상달성도", key: "expected", width: 12 },
  { header: "보완사항", key: "note", width: 32 },
  { header: "평가기준일", key: "evalDate", width: 13 },
];

/** 반드시 있어야 하는 열(머리글). 값이 비어도 되는 열(기준값·목표값·실적값·진척률·보완사항)도 열 자체는 있어야 한다. */
export const REQUIRED_HEADERS: readonly string[] = EXCEL_COLUMNS.map((column) => column.header);

/** 오류 문구에서 칸을 가리킬 때 쓰는 이름 */
export const FIELD_LABELS: Record<ExcelFieldKey, string> = {
  branch: "부점",
  category: "지표구분",
  name: "지표명",
  item: "세부평가항목",
  method: "평가방법",
  weight: "배점",
  baseValue: "기준값",
  targetValue: "목표값",
  actualValue: "실적값",
  progress: "진척률",
  expected: "예상달성도",
  note: "보완사항",
  evalDate: "평가기준일",
};

/** 머리글을 비교할 때 쓰는 모양: 모든 공백을 지운다. ("지표 구분"과 "지표구분"을 같게 본다) */
export function normalizeHeader(text: string): string {
  return text.replace(/\s+/g, "");
}

/** 올릴 파일을 읽기 전에 이름과 크기만으로 걸러낸다. 통과하면 null, 아니면 안내 문구 */
export function checkUploadFile(file: { name: string; size: number }): string | null {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return "5MB 이하의 .xlsx 파일만 올릴 수 있습니다. (엑셀에서 \"Excel 통합 문서(.xlsx)\"로 저장해 주세요)";
  }
  if (file.size === 0) {
    return "빈 파일입니다. 지표를 적은 엑셀 파일을 올려 주세요.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "5MB 이하의 .xlsx 파일만 올릴 수 있습니다. (선택한 파일이 5MB보다 큽니다)";
  }
  return null;
}
