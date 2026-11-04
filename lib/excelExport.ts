// Design Ref: §3.2 내보내기 — 현황을 보고용 엑셀 파일로 저장한다. 이 파일은 칸에 들어갈 값만 정하는 순수 로직이다.
// Plan SC: 작업 12 — 현황 엑셀 내보내기. 필터와 관계없이 항상 전체 지표를 내보낸다.
//
// 내보낸 파일은 "엑셀 올리기"로 다시 올릴 수 있다. 양식의 13개 열은 그대로 두고,
// 부진 여부·경과율·차이(%p) 열을 더 붙이며 올릴 때는 이 세 열을 무시하고 다시 계산한다.

import { hasMissingNote } from "@/lib/calc";
import type { IndicatorRow } from "@/lib/filterSort";
import { formatPercent } from "@/lib/format";
import {
  EXCEL_COLUMNS,
  EXPORT_EXTRA_COLUMNS,
  STATUS_LABELS,
  type ExcelFieldKey,
} from "@/lib/excelFormat";

/** 엑셀 한 칸에 넣을 값. 빈 칸은 null */
export type ExportCell = string | number | null;

/** 내보내는 파일의 머리글 줄 (양식 13개 열 + 부진여부·경과율·차이) */
export const EXPORT_HEADERS: readonly string[] = [
  ...EXCEL_COLUMNS.map((column) => column.header),
  ...EXPORT_EXTRA_COLUMNS.map((column) => column.header),
];

/** 값이 없으면 빈 칸(null)으로 바꾼다. */
function orBlank<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

/**
 * 표의 한 줄을 엑셀 한 줄의 칸 값들로 바꾼다. 순서는 EXPORT_HEADERS와 같다.
 * - 진척률: 화면에서 잘라 보여주는 값이 아니라 계산된 원래 값을 넣는다. (진척률을 알 수 없으면 빈 칸)
 * - 평가기준일: 시간대에 따라 날짜가 밀리지 않도록 "YYYY-MM-DD" 글자로 넣는다.
 */
export function toExportCells({ indicator, evaluation }: IndicatorRow): ExportCell[] {
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
    progress: evaluation.progress,
    expected: indicator.expected,
    note: orBlank(indicator.note),
    evalDate: indicator.evalDate,
  };

  return [
    ...EXCEL_COLUMNS.map((column) => byKey[column.key]),
    STATUS_LABELS[evaluation.status],
    evaluation.elapsedRate,
    evaluation.gap,
  ];
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
