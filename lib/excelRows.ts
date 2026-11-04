// Design Ref: §4 데이터 흐름 2단계 "검사" — 엑셀에서 읽은 줄을 직접 입력 폼과 같은 규칙으로 검사해 지표로 바꾼다.
// Plan SC: 작업 11 — 엑셀 파일 일괄 등록. 엑셀 도구(ExcelJS)와 무관한 순수 로직이라 단독으로 테스트할 수 있다.
//
// 검사 항목: 필수 열, 최대 30개, 부점(내 부점만), 지표구분 네 가지, 계량/비계량별 필수 칸,
//           숫자 형식, 0~200 범위, 평가기준일, 부진지표의 보완사항.
// 하나라도 어긋나면 올리지 않는다. (어느 줄의 어느 칸이 왜 안 되는지 모두 알려준다)

import { toDateString } from "@/lib/calc";
import {
  EXCEL_COLUMNS,
  FIELD_LABELS,
  normalizeHeader,
  type ExcelFieldKey,
} from "@/lib/excelFormat";
import {
  emptyFormValues,
  validateIndicatorForm,
  type IndicatorFormValues,
} from "@/lib/indicatorForm";
import { INDICATOR_CATEGORIES, MAX_INDICATORS, type Indicator } from "@/types/indicator";

/** 엑셀 시트에서 읽은 데이터 줄 한 개 */
export interface RawRow {
  /** 엑셀에서 보이는 줄 번호 (머리글이 1번이므로 첫 데이터 줄은 2번) */
  rowNumber: number;
  /** 머리글과 같은 순서로 정리한 칸 값 */
  cells: unknown[];
}

/** 엑셀 시트에서 읽은 내용 */
export interface RawSheet {
  /** 첫 줄(머리글)의 글자 */
  headers: string[];
  /** 머리글 아래의 데이터 줄들 */
  rows: RawRow[];
}

/** 올리기를 거부하는 이유 한 가지 */
export interface UploadError {
  /** 엑셀 줄 번호. 파일 전체에 해당하는 오류면 없다. */
  row?: number;
  message: string;
}

/** 올리기 검사 결과 */
export type UploadResult =
  | { ok: true; indicators: Indicator[] }
  | { ok: false; errors: UploadError[] };

/** 검사에 필요한 바깥 정보 */
export interface UploadContext {
  /** 화면에 입력한 부점 이름. 파일 안의 부점이 이것과 같아야 한다. */
  branch: string;
  /** 화면의 자료 기준일. 부진지표의 보완사항 필수 검사에 쓴다. */
  referenceDate: string;
}

/**
 * 엑셀 칸 값을 글자로 바꾼다.
 * 숫자·글자·날짜는 물론 서식 있는 글자(richText), 수식(result), 하이퍼링크(text)도 읽는다.
 * 날짜는 엑셀이 기록하는 UTC 기준 날짜를 "YYYY-MM-DD"로 바꾼다.
 */
export function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    // 엑셀 날짜는 UTC 자정으로 읽히므로, 현지 시간대로 바꾸면 하루가 밀릴 수 있다. UTC 기준으로 읽는다.
    return toDateString(new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.richText)) {
      // 조각 사이의 띄어쓰기를 지키려고, 조각은 다듬지 않고 그대로 이어 붙인 뒤 전체 앞뒤만 정리한다.
      return record.richText
        .map((part) => {
          const text = (part as Record<string, unknown> | null)?.text;
          return typeof text === "string" ? text : "";
        })
        .join("")
        .trim();
    }
    if ("result" in record) return cellToText(record.result);
    if ("text" in record) return cellToText(record.text);
  }
  return "";
}

/** "부점계량"처럼 띄어쓰기가 달라도 올바른 지표 구분이면 표준 이름으로 바꿔 준다. 아니면 원래 글자 그대로 */
export function normalizeCategoryText(text: string): string {
  const compact = normalizeHeader(text);
  return INDICATOR_CATEGORIES.find((category) => normalizeHeader(category) === compact) ?? text;
}

/** 머리글에서 각 열이 몇 번째 칸인지 찾는다. 이름은 공백을 무시하고 비교하며 같은 뜻의 다른 이름도 받아 준다. */
function findColumnIndexes(headers: string[]): {
  indexes: Partial<Record<ExcelFieldKey, number>>;
  missing: string[];
} {
  const normalized = headers.map(normalizeHeader);
  const indexes: Partial<Record<ExcelFieldKey, number>> = {};
  const missing: string[] = [];

  for (const column of EXCEL_COLUMNS) {
    const names = [column.header, ...(column.aliases ?? [])].map(normalizeHeader);
    const index = normalized.findIndex((header) => names.includes(header));
    if (index === -1) missing.push(column.header);
    else indexes[column.key] = index;
  }
  return { indexes, missing };
}

/** 부점 칸을 뺀 나머지가 모두 비어 있으면 빈 줄이다. (양식은 부점 칸을 미리 채워 두기 때문) */
function isBlankRow(cells: string[], branchIndex: number | undefined): boolean {
  return cells.every((text, index) => index === branchIndex || text === "");
}

/**
 * 엑셀에서 읽은 시트를 검사해 지표 목록으로 바꾼다.
 * 올바르면 { ok: true, indicators }, 하나라도 어긋나면 { ok: false, errors }
 */
export function parseUploadedSheet(sheet: RawSheet, context: UploadContext): UploadResult {
  const { indexes, missing } = findColumnIndexes(sheet.headers);
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [
        {
          message: `엑셀 양식과 다릅니다. 첫 줄에 없는 열: ${missing.join(", ")}. "엑셀 양식 받기"로 받은 양식을 사용해 주세요.`,
        },
      ],
    };
  }

  // 칸 값을 글자로 바꾸고, 빈 줄은 건너뛴다.
  const dataRows = sheet.rows
    .map((row) => ({ rowNumber: row.rowNumber, texts: sheet.headers.map((_, i) => cellToText(row.cells[i])) }))
    .filter((row) => !isBlankRow(row.texts, indexes.branch));

  if (dataRows.length === 0) {
    return { ok: false, errors: [{ message: "올릴 지표가 없습니다. 지표를 적은 줄이 하나도 없습니다." }] };
  }
  if (dataRows.length > MAX_INDICATORS) {
    return {
      ok: false,
      errors: [
        {
          message: `지표는 최대 ${MAX_INDICATORS}개입니다. 파일에는 ${dataRows.length}건이 있습니다. 파일을 고쳐서 다시 올려 주세요.`,
        },
      ],
    };
  }

  const errors: UploadError[] = [];
  const indicators: Indicator[] = [];
  const textOf = (texts: string[], key: ExcelFieldKey): string => {
    const index = indexes[key];
    return index === undefined ? "" : (texts[index] ?? "");
  };

  for (const { rowNumber, texts } of dataRows) {
    // 부점은 화면에 입력한 부점 이름과 같아야 한다. (직접 입력 폼은 부점을 자동으로 넣으므로, 엑셀에서만 검사한다)
    // 다른 부점 파일을 실수로 올리는 것을 막는 장치이며, 로그인 같은 접근 통제는 아니다.
    const fileBranch = textOf(texts, "branch");
    if (fileBranch === "") {
      errors.push({ row: rowNumber, message: `${FIELD_LABELS.branch}: 부점을 입력해 주세요.` });
    } else if (fileBranch !== context.branch) {
      errors.push({
        row: rowNumber,
        message: `${FIELD_LABELS.branch}: 내 부점(${context.branch}) 자료만 올릴 수 있습니다. (파일의 부점: ${fileBranch})`,
      });
    }

    // 직접 입력 폼과 같은 규칙으로 검사한다.
    const values: IndicatorFormValues = {
      ...emptyFormValues(""),
      category: normalizeCategoryText(textOf(texts, "category")),
      name: textOf(texts, "name"),
      item: textOf(texts, "item"),
      method: textOf(texts, "method"),
      weight: textOf(texts, "weight"),
      baseValue: textOf(texts, "baseValue"),
      targetValue: textOf(texts, "targetValue"),
      actualValue: textOf(texts, "actualValue"),
      progress: textOf(texts, "progress"),
      expected: textOf(texts, "expected"),
      note: textOf(texts, "note"),
      evalDate: textOf(texts, "evalDate"),
    };
    const result = validateIndicatorForm(values, context.branch, context.referenceDate);

    for (const [key, message] of Object.entries(result.errors)) {
      if (!message) continue;
      const label = FIELD_LABELS[key as ExcelFieldKey] ?? key;
      // 엑셀에서는 고를 수 있는 목록이 없으므로, 지표구분 오류에는 올바른 값을 함께 알려준다.
      const detail =
        key === "category"
          ? `${INDICATOR_CATEGORIES.join(" / ")} 중 하나여야 합니다. (파일의 값: ${values.category === "" ? "빈 칸" : values.category})`
          : message;
      errors.push({ row: rowNumber, message: `${label}: ${detail}` });
    }
    if (result.indicator) indicators.push(result.indicator);
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, indicators };
}

/** 오류 목록을 화면에 보여줄 문장들로 바꾼다. (예: "5행 지표명: 지표명을 입력해 주세요.") */
export function formatUploadErrors(errors: UploadError[]): string[] {
  return errors.map((error) => (error.row === undefined ? error.message : `${error.row}행 ${error.message}`));
}
