// Design Ref: §4 데이터 흐름 2단계 "검사" — 엑셀에서 읽은 줄을 직접 입력 폼과 같은 규칙으로 검사해 지표로 바꾼다.
// Plan SC: 작업 11 — 엑셀 파일 일괄 등록. 엑셀 도구(ExcelJS)와 무관한 순수 로직이라 단독으로 테스트할 수 있다.
// Plan SC: 작업 15~18 — 지표 시트 외에 월별실적·개선조치·추진과제 시트도 함께 검사해 지표에 붙인다.
//
// 검사 항목: 필수 열, 최대 30개, 지표명 중복, 부점(화면에 입력한 부점 이름만), 지표구분 네 가지,
//           계량/비계량별 필수 칸, 숫자 형식, 0~200 범위, 평가기준일, 부진지표의 보완사항,
//           월별실적·개선조치·추진과제 시트의 지표명과 각 칸.
// 하나라도 어긋나면 올리지 않는다. (어느 시트의 어느 줄의 어느 칸이 왜 안 되는지 모두 알려준다)

import { toDateString } from "@/lib/calc";
import {
  ACTIONS_SHEET_NAME,
  ACTION_HEADERS,
  EXCEL_COLUMNS,
  FIELD_LABELS,
  MONTHLY_HEADERS,
  MONTHLY_SHEET_NAME,
  OPTIONAL_COLUMNS,
  TASKS_SHEET_NAME,
  TASK_HEADERS,
  normalizeHeader,
  parseAggregationText,
  type ExcelFieldKey,
} from "@/lib/excelFormat";
import {
  emptyFormValues,
  validateIndicatorForm,
  type IndicatorFormValues,
} from "@/lib/indicatorForm";
import {
  MAX_ACTIONS_PER_INDICATOR,
  MAX_TASKS_PER_INDICATOR,
  validateAction,
  validateTask,
} from "@/lib/records";
import {
  INDICATOR_CATEGORIES,
  MAX_INDICATORS,
  MONTHS_IN_YEAR,
  isIndicatorCategory,
  isQuantitativeCategory,
  type ImprovementAction,
  type Indicator,
  type PromotionTask,
} from "@/types/indicator";

/** 엑셀 시트에서 읽은 데이터 줄 한 개 */
export interface RawRow {
  /** 엑셀에서 보이는 줄 번호 (머리글 바로 아래가 첫 데이터 줄) */
  rowNumber: number;
  /** 머리글과 같은 순서로 정리한 칸 값 */
  cells: unknown[];
}

/** 엑셀 시트에서 읽은 내용 */
export interface RawSheet {
  /** 머리글 줄의 글자 */
  headers: string[];
  /** 머리글 아래의 데이터 줄들 */
  rows: RawRow[];
}

/** 엑셀 파일에서 읽은 시트들. 지표 시트(main)는 반드시 있고, 나머지는 있을 때만 읽는다. */
export interface RawWorkbook {
  main: RawSheet;
  monthly?: RawSheet;
  actions?: RawSheet;
  tasks?: RawSheet;
}

/** 올리기를 거부하는 이유 한 가지 */
export interface UploadError {
  /** 오류가 난 시트 이름. 지표 시트의 오류(또는 파일 전체 오류)면 없다. */
  sheet?: string;
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

/** 이름을 비교할 때 쓰는 모양 (앞뒤 공백을 지우고 소문자로) */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
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
  // 있어도 되고 없어도 되는 열
  for (const column of OPTIONAL_COLUMNS) {
    const index = normalized.findIndex((header) => header === normalizeHeader(column.header));
    if (index !== -1) indexes[column.key] = index;
  }
  return { indexes, missing };
}

/** 부점 칸만 채워진(또는 모두 빈) 줄이면 빈 줄이다. (양식은 부점 칸을 미리 채워 두기 때문) */
function isBlankRow(cells: string[], ignoredIndex: number | undefined): boolean {
  return cells.every((text, index) => index === ignoredIndex || text === "");
}

/** 하위 시트 한 개를 읽기 쉬운 모양으로 바꾼다: 머리글 이름 → 칸 번호, 글자로 바꾼 데이터 줄들 */
function readSubSheet(
  sheet: RawSheet,
  requiredHeaders: readonly string[],
  sheetName: string,
): {
  rows: { rowNumber: number; texts: string[] }[];
  index: (header: string) => number;
  errors: UploadError[];
} {
  const normalized = sheet.headers.map(normalizeHeader);
  const index = (header: string) => normalized.indexOf(normalizeHeader(header));
  const missing = requiredHeaders.filter((header) => index(header) === -1);
  if (missing.length > 0) {
    return {
      rows: [],
      index,
      errors: [
        {
          sheet: sheetName,
          message: `머리글 줄에 없는 열: ${missing.join(", ")}. "엑셀 양식 받기"로 받은 양식을 사용해 주세요.`,
        },
      ],
    };
  }
  const rows = sheet.rows
    .map((row) => ({
      rowNumber: row.rowNumber,
      texts: sheet.headers.map((_, i) => cellToText(row.cells[i])),
    }))
    .filter((row) => !isBlankRow(row.texts, undefined));
  return { rows, index, errors: [] };
}

/**
 * 엑셀에서 읽은 지표 시트 하나만 검사해 지표 목록으로 바꾼다. (다른 시트는 없는 것으로 본다)
 * 올바르면 { ok: true, indicators }, 하나라도 어긋나면 { ok: false, errors }
 */
export function parseUploadedSheet(sheet: RawSheet, context: UploadContext): UploadResult {
  return parseUploadedWorkbook({ main: sheet }, context);
}

/**
 * 엑셀에서 읽은 파일 전체(지표·월별실적·개선조치·추진과제 시트)를 검사해 지표 목록으로 바꾼다.
 * 올바르면 { ok: true, indicators }, 하나라도 어긋나면 { ok: false, errors }
 */
export function parseUploadedWorkbook(book: RawWorkbook, context: UploadContext): UploadResult {
  const sheet = book.main;
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
  const textOf = (texts: string[], key: ExcelFieldKey): string => {
    const index = indexes[key];
    return index === undefined ? "" : (texts[index] ?? "");
  };

  // 지표명 목록과 중복 검사. (다른 시트가 지표명으로 지표를 찾기 때문에 같은 이름이 둘이면 안 된다)
  const rowNumberByName = new Map<string, number>();
  const categoryByName = new Map<string, string>();
  for (const { rowNumber, texts } of dataRows) {
    const name = textOf(texts, "name");
    if (name === "") continue;
    const key = nameKey(name);
    const first = rowNumberByName.get(key);
    if (first !== undefined) {
      errors.push({
        row: rowNumber,
        message: `${FIELD_LABELS.name}: 같은 이름의 지표가 ${first}행에도 있습니다. 지표명은 겹치지 않게 적어 주세요.`,
      });
    } else {
      rowNumberByName.set(key, rowNumber);
      categoryByName.set(key, normalizeCategoryText(textOf(texts, "category")));
    }
  }

  // ── 월별실적 시트: 지표명 → 12개월 글자 ──
  const monthlyByName = new Map<string, string[]>();
  if (book.monthly) {
    const sub = readSubSheet(book.monthly, MONTHLY_HEADERS, MONTHLY_SHEET_NAME);
    errors.push(...sub.errors);
    for (const { rowNumber, texts } of sub.rows) {
      const name = texts[sub.index("지표명")];
      const key = nameKey(name);
      const category = categoryByName.get(key);
      if (name === "" || category === undefined) {
        errors.push({
          sheet: MONTHLY_SHEET_NAME,
          row: rowNumber,
          message: `지표명: "${name}"이(가) 지표 시트에 없습니다.`,
        });
        continue;
      }
      if (monthlyByName.has(key)) {
        errors.push({ sheet: MONTHLY_SHEET_NAME, row: rowNumber, message: `지표명: "${name}"이(가) 이 시트에 두 번 이상 있습니다.` });
        continue;
      }
      const months = Array.from({ length: MONTHS_IN_YEAR }, (_, i) => texts[sub.index(`${i + 1}월`)] ?? "");
      if (months.some((text) => text !== "") && isIndicatorCategory(category) && !isQuantitativeCategory(category)) {
        errors.push({
          sheet: MONTHLY_SHEET_NAME,
          row: rowNumber,
          message: `지표명: "${name}"은(는) ${category} 지표라 월별 실적을 넣을 수 없습니다. (계량 지표만 가능)`,
        });
        continue;
      }
      monthlyByName.set(key, months);
    }
  }

  // ── 개선조치·추진과제 시트: 지표명 → 목록 ──
  const actionsByName = new Map<string, ImprovementAction[]>();
  if (book.actions) {
    const sub = readSubSheet(book.actions, ACTION_HEADERS, ACTIONS_SHEET_NAME);
    errors.push(...sub.errors);
    for (const { rowNumber, texts } of sub.rows) {
      const name = texts[sub.index("지표명")];
      const key = nameKey(name);
      if (name === "" || !rowNumberByName.has(key)) {
        errors.push({ sheet: ACTIONS_SHEET_NAME, row: rowNumber, message: `지표명: "${name}"이(가) 지표 시트에 없습니다.` });
        continue;
      }
      const { errors: fieldErrors, action } = validateAction({
        date: texts[sub.index("일자")],
        content: texts[sub.index("조치내용")],
        owner: texts[sub.index("담당자")],
        status: texts[sub.index("상태")],
        effect: texts[sub.index("효과")],
      });
      for (const [field, message] of Object.entries(fieldErrors)) {
        if (message) errors.push({ sheet: ACTIONS_SHEET_NAME, row: rowNumber, message: `${field}: ${message}` });
      }
      if (action) {
        const list = actionsByName.get(key) ?? [];
        list.push(action);
        actionsByName.set(key, list);
      }
    }
    for (const [key, list] of actionsByName) {
      if (list.length > MAX_ACTIONS_PER_INDICATOR) {
        errors.push({
          sheet: ACTIONS_SHEET_NAME,
          message: `"${key}" 지표의 개선조치가 ${list.length}건입니다. 한 지표에는 최대 ${MAX_ACTIONS_PER_INDICATOR}건까지 넣을 수 있습니다.`,
        });
      }
    }
  }

  const tasksByName = new Map<string, PromotionTask[]>();
  if (book.tasks) {
    const sub = readSubSheet(book.tasks, TASK_HEADERS, TASKS_SHEET_NAME);
    errors.push(...sub.errors);
    for (const { rowNumber, texts } of sub.rows) {
      const name = texts[sub.index("지표명")];
      const key = nameKey(name);
      if (name === "" || !rowNumberByName.has(key)) {
        errors.push({ sheet: TASKS_SHEET_NAME, row: rowNumber, message: `지표명: "${name}"이(가) 지표 시트에 없습니다.` });
        continue;
      }
      const { errors: fieldErrors, task } = validateTask({
        title: texts[sub.index("과제명")],
        due: texts[sub.index("기한")],
        owner: texts[sub.index("담당자")],
        status: texts[sub.index("상태")],
      });
      for (const [field, message] of Object.entries(fieldErrors)) {
        if (message) errors.push({ sheet: TASKS_SHEET_NAME, row: rowNumber, message: `${field}: ${message}` });
      }
      if (task) {
        const list = tasksByName.get(key) ?? [];
        list.push(task);
        tasksByName.set(key, list);
      }
    }
    for (const [key, list] of tasksByName) {
      if (list.length > MAX_TASKS_PER_INDICATOR) {
        errors.push({
          sheet: TASKS_SHEET_NAME,
          message: `"${key}" 지표의 추진과제가 ${list.length}건입니다. 한 지표에는 최대 ${MAX_TASKS_PER_INDICATOR}건까지 넣을 수 있습니다.`,
        });
      }
    }
  }

  // ── 지표 시트의 각 줄 검사 ──
  const indicators: Indicator[] = [];
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

    // 집계방식: "누적"/"월말값". 비어 있으면 누적
    const aggregationText = textOf(texts, "aggregation");
    const aggregation = parseAggregationText(aggregationText);
    if (aggregation === null) {
      errors.push({
        row: rowNumber,
        message: `${FIELD_LABELS.aggregation}: 누적 / 월말값 중 하나여야 합니다. (파일의 값: ${aggregationText})`,
      });
    }

    // 직접 입력 폼과 같은 규칙으로 검사한다.
    const name = textOf(texts, "name");
    const months = monthlyByName.get(nameKey(name));
    const values: IndicatorFormValues = {
      ...emptyFormValues(""),
      category: normalizeCategoryText(textOf(texts, "category")),
      name,
      item: textOf(texts, "item"),
      method: textOf(texts, "method"),
      weight: textOf(texts, "weight"),
      baseValue: textOf(texts, "baseValue"),
      targetValue: textOf(texts, "targetValue"),
      actualValue: textOf(texts, "actualValue"),
      aggregation: aggregation ?? "cumulative",
      ...(months ? { monthly: months } : {}),
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

    if (result.indicator) {
      const id = textOf(texts, "id").slice(0, 100);
      const actions = actionsByName.get(nameKey(name));
      const tasks = tasksByName.get(nameKey(name));
      indicators.push({
        ...result.indicator,
        ...(id !== "" ? { id } : {}),
        ...(actions && actions.length > 0 ? { actions } : {}),
        ...(tasks && tasks.length > 0 ? { tasks } : {}),
      });
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, indicators };
}

/** 오류 목록을 화면에 보여줄 문장들로 바꾼다. (예: "5행 지표명: …", "[월별실적] 3행 지표명: …") */
export function formatUploadErrors(errors: UploadError[]): string[] {
  return errors.map((error) => {
    const place =
      error.row === undefined ? "" : `${error.row}행 `;
    const sheet = error.sheet ? `[${error.sheet}] ` : "";
    return `${sheet}${place}${error.message}`;
  });
}
