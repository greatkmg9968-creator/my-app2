// Design Ref: §3.2 엑셀 양식 — 올리기·내보내기가 함께 쓰는 열 이름과 파일 규칙을 한곳에 모은다.
// Plan SC: 작업 11 — 엑셀 양식 내려받기와 엑셀 파일 일괄 등록
// Plan SC: 작업 15~18 — 월별실적·개선조치·추진과제 시트와 집계방식·지표ID 열을 더한다.

import type { IndicatorFormValues } from "@/lib/indicatorForm";
import {
  AGGREGATION_LABELS,
  DEFAULT_AGGREGATION,
  MONTHS_IN_YEAR,
  WORK_STATUSES,
  type AggregationMode,
} from "@/types/indicator";

/** 지표를 적는 시트 이름. 올릴 때 이 이름의 시트를 읽고, 없으면 첫 번째 시트를 읽는다. */
export const DATA_SHEET_NAME = "지표";

/** 작성 방법을 적어 둔 시트 이름. 올릴 때는 읽지 않는다. */
export const GUIDE_SHEET_NAME = "작성 안내";

/** 월별 실적(그 달 실적) 시트: 지표명 + 1월~12월 */
export const MONTHLY_SHEET_NAME = "월별실적";

/** 개선조치 이력 시트: 지표명, 일자, 조치내용, 담당자, 상태, 효과 */
export const ACTIONS_SHEET_NAME = "개선조치";

/** 추진과제 시트: 지표명, 과제명, 기한, 담당자, 상태 */
export const TASKS_SHEET_NAME = "추진과제";

/** 첨부파일 목록 시트. 내보낼 때만 만들고(참고용), 올릴 때는 읽지 않는다. 파일 자체는 엑셀에 들어가지 않는다. */
export const ATTACHMENTS_SHEET_NAME = "첨부파일목록";

/** 양식 파일 이름 */
export const TEMPLATE_FILE_NAME = "지표_입력양식.xlsx";

/** 올릴 수 있는 파일 크기의 최댓값(바이트): 5MB */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** 엑셀 한 열이 가리키는 입력 칸. 부점·지표ID는 폼에 입력칸이 없어서 따로 둔다. */
export type ExcelFieldKey = keyof IndicatorFormValues | "branch" | "id";

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
 * 지표 시트에 반드시 있어야 하는 열(13개). 올릴 때는 열 순서와 관계없이 머리글 이름으로 찾고,
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

/**
 * 지표 시트에 있어도 되고 없어도 되는 열. 없으면 기본값을 쓴다.
 * - 집계방식: 누적 / 월말값 (없으면 누적)
 * - 지표ID: 내보낸 파일에만 있다. 올려도 첨부파일이 같은 지표에 이어지게 하는 번호다.
 */
export const OPTIONAL_COLUMNS: readonly ExcelColumn[] = [
  { header: "집계방식", key: "aggregation", width: 11 },
  { header: "지표ID", key: "id", width: 14 },
];

/**
 * 내보내는 파일에만 더 붙는 열. 올릴 때는 읽지 않고 무시한다. (모두 올릴 때 다시 계산하는 값이기 때문)
 * 현재실적은 월별 실적에서 구한 값을 포함해, 자료 기준일 시점의 실적이다.
 */
export const EXPORT_EXTRA_COLUMNS: readonly { header: string; width: number }[] = [
  { header: "현재실적", width: 11 },
  { header: "부진여부", width: 11 },
  { header: "경과율(%)", width: 11 },
  { header: "차이(%p)", width: 11 },
];

/** 내보내는 파일의 "부진여부" 칸에 적는 글자 */
export const STATUS_LABELS = {
  delayed: "부진",
  normal: "정상",
} as const;

/** 월별실적 시트의 머리글: 지표명, 1월 … 12월 */
export const MONTHLY_HEADERS: readonly string[] = [
  "지표명",
  ...Array.from({ length: MONTHS_IN_YEAR }, (_, index) => `${index + 1}월`),
];

/** 개선조치 시트의 머리글 */
export const ACTION_HEADERS = ["지표명", "일자", "조치내용", "담당자", "상태", "효과"] as const;

/** 추진과제 시트의 머리글 */
export const TASK_HEADERS = ["지표명", "과제명", "기한", "담당자", "상태"] as const;

/** 첨부파일목록 시트의 머리글 (참고용, 올릴 때 읽지 않는다) */
export const ATTACHMENT_HEADERS = ["지표명", "구분", "파일명", "크기(KB)", "올린시각"] as const;

/** 진행 상태 칸에서 고를 수 있는 값을 엑셀 목록 형식("예정,진행,완료")으로 만든 글자 */
export const STATUS_LIST_FORMULA = `"${WORK_STATUSES.join(",")}"`;

/** 집계방식 칸에서 고를 수 있는 값을 엑셀 목록 형식으로 만든 글자 */
export const AGGREGATION_LIST_FORMULA = `"${Object.values(AGGREGATION_LABELS).join(",")}"`;

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
  aggregation: "집계방식",
  monthly: "월별실적",
  progress: "진척률",
  expected: "예상달성도",
  note: "보완사항",
  evalDate: "평가기준일",
  id: "지표ID",
};

/** 반드시 있어야 하는 열(머리글). 값이 비어도 되는 열(기준값·목표값·실적값·진척률·보완사항)도 열 자체는 있어야 한다. */
export const REQUIRED_HEADERS: readonly string[] = EXCEL_COLUMNS.map((column) => column.header);

/** 머리글을 비교할 때 쓰는 모양: 모든 공백을 지운다. ("지표 구분"과 "지표구분"을 같게 본다) */
export function normalizeHeader(text: string): string {
  return text.replace(/\s+/g, "");
}

/**
 * 엑셀 집계방식 칸의 글자를 읽는다. "누적"/"월말값"(공백 무시)과 내부 이름(cumulative/latest)을 받는다.
 * 비어 있으면 기본값(누적)이고, 올바르지 않으면 null
 */
export function parseAggregationText(text: string): AggregationMode | null {
  const compact = normalizeHeader(text).toLowerCase();
  if (compact === "") return DEFAULT_AGGREGATION;
  if (compact === normalizeHeader(AGGREGATION_LABELS.cumulative) || compact === "cumulative") {
    return "cumulative";
  }
  if (compact === normalizeHeader(AGGREGATION_LABELS.latest) || compact === "latest") {
    return "latest";
  }
  return null;
}

/** 내보내는 파일 이름. 자료 기준일을 붙인다. (예: 지표현황_2026-10-15.xlsx) */
export function exportFileName(referenceDate: string): string {
  return `지표현황_${referenceDate}.xlsx`;
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
