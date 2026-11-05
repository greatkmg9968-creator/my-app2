// Design Ref: §3.2 내보내기 — 현황을 보고용 엑셀 파일로 저장한다. 이 파일은 칸에 들어갈 값만 정하는 순수 로직이다.
// Plan SC: 작업 12 — 현황 엑셀 내보내기. 필터와 관계없이 항상 전체 지표를 내보낸다.
// Plan SC: 작업 15~18 — 월별실적·개선조치·추진과제 시트와 집계방식·지표ID 열, 첨부파일목록(참고용)
//
// 내보낸 파일은 "엑셀 올리기"로 다시 올릴 수 있다. 양식의 13개 열과 집계방식·지표ID 열은 그대로 두고,
// 현재실적·부진여부·경과율·차이(%p) 열을 더 붙이며 올릴 때는 이 열들을 무시하고 다시 계산한다.

import { hasMissingNote } from "@/lib/calc";
import type { IndicatorRow } from "@/lib/filterSort";
import { formatPercent } from "@/lib/format";
import { normalizeMonthly } from "@/lib/monthly";
import {
  EXCEL_COLUMNS,
  EXPORT_EXTRA_COLUMNS,
  OPTIONAL_COLUMNS,
  STATUS_LABELS,
  type ExcelFieldKey,
} from "@/lib/excelFormat";
import { AGGREGATION_LABELS, DEFAULT_AGGREGATION, type Indicator } from "@/types/indicator";

/** 엑셀 한 칸에 넣을 값. 빈 칸은 null */
export type ExportCell = string | number | null;

/** 내보내는 파일의 머리글 줄 (양식 13개 열 + 집계방식·지표ID + 현재실적·부진여부·경과율·차이) */
export const EXPORT_HEADERS: readonly string[] = [
  ...EXCEL_COLUMNS.map((column) => column.header),
  ...OPTIONAL_COLUMNS.map((column) => column.header),
  ...EXPORT_EXTRA_COLUMNS.map((column) => column.header),
];

/** 값이 없으면 빈 칸(null)으로 바꾼다. */
function orBlank<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

/**
 * 표의 한 줄을 엑셀 한 줄의 칸 값들로 바꾼다. 순서는 EXPORT_HEADERS와 같다.
 * - 실적값: 입력해 둔 값 그대로. (월별 실적에서 구한 값은 "현재실적" 열에 따로 적는다)
 * - 진척률: 화면에서 잘라 보여주는 값이 아니라 계산된 원래 값을 넣는다.
 * - 집계방식: 계량 지표만 "누적"/"월말값"을 적고, 비계량은 빈 칸이다.
 * - 평가기준일: 시간대에 따라 날짜가 밀리지 않도록 "YYYY-MM-DD" 글자로 넣는다.
 */
export function toExportCells({ indicator, evaluation }: IndicatorRow): ExportCell[] {
  const quantitative = indicator.baseValue !== undefined;
  const byKey: Record<ExcelFieldKey, ExportCell> = {
    branch: indicator.branch,
    category: indicator.category,
    name: indicator.name,
    item: indicator.item,
    method: indicator.method,
    weight: indicator.weight,
    baseValue: orBlank(indicator.baseValue),
    targetValue: orBlank(indicator.targetValue),
    actualValue: orBlank(indicator.actualValue),
    aggregation: quantitative ? AGGREGATION_LABELS[indicator.aggregation ?? DEFAULT_AGGREGATION] : null,
    monthly: null, // 월별 실적은 지표 시트가 아니라 월별실적 시트에 적는다.
    progress: evaluation.progress,
    expected: indicator.expected,
    note: orBlank(indicator.note),
    evalDate: indicator.evalDate,
    id: orBlank(indicator.id),
  };

  return [
    ...EXCEL_COLUMNS.map((column) => byKey[column.key]),
    ...OPTIONAL_COLUMNS.map((column) => byKey[column.key]),
    orBlank(evaluation.actual),
    STATUS_LABELS[evaluation.status],
    evaluation.elapsedRate,
    evaluation.gap,
  ];
}

/** 월별실적 시트의 데이터 줄들: [지표명, 1월 … 12월]. 월별 실적이 있는 지표만 */
export function monthlySheetRows(indicators: readonly Indicator[]): ExportCell[][] {
  return indicators
    .filter((indicator) => (indicator.monthly ?? []).some((value) => value !== null))
    .map((indicator) => [indicator.name, ...normalizeMonthly(indicator.monthly)]);
}

/** 개선조치 시트의 데이터 줄들: [지표명, 일자, 조치내용, 담당자, 상태, 효과] */
export function actionSheetRows(indicators: readonly Indicator[]): ExportCell[][] {
  return indicators.flatMap((indicator) =>
    (indicator.actions ?? []).map((action) => [
      indicator.name,
      action.date,
      action.content,
      action.owner,
      action.status,
      orBlank(action.effect),
    ]),
  );
}

/** 추진과제 시트의 데이터 줄들: [지표명, 과제명, 기한, 담당자, 상태] */
export function taskSheetRows(indicators: readonly Indicator[]): ExportCell[][] {
  return indicators.flatMap((indicator) =>
    (indicator.tasks ?? []).map((task) => [
      indicator.name,
      task.title,
      orBlank(task.due),
      task.owner,
      task.status,
    ]),
  );
}

/** 첨부파일목록 시트의 데이터 줄들(참고용): [지표명, 구분, 파일명, 크기(KB), 올린시각] */
export function attachmentSheetRows(indicators: readonly Indicator[]): ExportCell[][] {
  return indicators.flatMap((indicator) =>
    (indicator.attachments ?? []).map((file) => [
      indicator.name,
      file.kind,
      file.name,
      Math.max(1, Math.round(file.size / 1024)),
      file.addedAt,
    ]),
  );
}

/** 파일 위쪽에 적는 기준 정보 줄들. (제목, 자료 기준일, 경과율, 필요하면 경고) */
export function exportInfoLines(args: {
  branch: string;
  referenceDate: string;
  elapsedRate: number;
  rows: IndicatorRow[];
}): { text: string; warning: boolean }[] {
  const lines = [
    { text: `${args.branch} 성과지표 현황`, warning: false },
    { text: `자료 기준일: ${args.referenceDate}`, warning: false },
    { text: `경과율: ${formatPercent(args.elapsedRate)}`, warning: false },
  ];

  const missing = args.rows.filter((row) => hasMissingNote(row.indicator, row.evaluation.status));
  if (missing.length > 0) {
    lines.push({
      text: `※ 보완사항이 비어 있는 부진지표가 ${missing.length}건 있습니다. (${missing
        .map((row) => row.indicator.name)
        .join(", ")})`,
      warning: true,
    });
  }
  return lines;
}
