// Design Ref: §2.2 ⑤ 지표 표 — 지표 구분 도넛을 눌러 펼친 세부 지표를 표로 보여준다. (최대 30행, 쪽 나누기 없음)
// Plan SC: 작업 5(표), 작업 6(부진지표 강조 + 경과율과의 차이(%p)), 작업 7(진행 막대)
// 작업 9: 줄마다 "수정"·"삭제" 버튼(관리 칸)을 둔다. 실제 수정·삭제는 위(IndicatorDashboard)가 한다.
// 작업 14~19: 지표명을 누르면 세부 화면(역산·월별 추이·개선조치·추진과제·첨부파일)이 열린다.
// 어떤 지표를 어떤 순서로 보여줄지는 위(IndicatorDashboard)에서 정하고, 이 표는 받은 줄을 그대로 그린다.

import ProgressBar from "@/components/ProgressBar";
import { hasMissingNote, hasMonthlyValues, type IndicatorEvaluation } from "@/lib/calc";
import type { IndicatorRow } from "@/lib/filterSort";
import {
  EMPTY_MARK,
  formatBehindText,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import type { Indicator } from "@/types/indicator";

interface IndicatorTableProps {
  rows: IndicatorRow[];
  /** 지표명을 눌렀을 때. 전체 목록에서의 지표 위치(index)를 넘겨준다. 없으면 이름은 글자로만 보인다. */
  onOpenDetail?: (index: number) => void;
  /** "수정" 버튼을 눌렀을 때. 전체 목록에서의 지표 위치(index)를 넘겨준다. 없으면 관리 칸을 그리지 않는다. */
  onEdit?: (index: number) => void;
  /** "삭제" 버튼을 눌렀을 때. 전체 목록에서의 지표 위치(index)를 넘겨준다. */
  onDelete?: (index: number) => void;
}

/**
 * 진척률 칸.
 * - 퍼센트 숫자와 진행 막대(경과율 눈금선 포함)
 * - 부진: "부진" 표시와 경과율보다 얼마나 낮은지(%p)
 * - 0~200 밖의 값은 잘라 표시하고 원래 값을 안내한다.
 */
function ProgressCell({ evaluation }: { evaluation: IndicatorEvaluation }) {
  const { progress, displayProgress, status, gap, elapsedRate } = evaluation;

  return (
    <>
      <span className={status === "delayed" ? "font-semibold" : undefined}>
        {formatPercent(displayProgress)}
      </span>
      {displayProgress !== progress && (
        <span className="block text-xs text-foreground/60">
          (원래 값 {formatPercent(progress)})
        </span>
      )}
      <span className="mt-2 block">
        <ProgressBar
          progress={progress}
          elapsedRate={elapsedRate}
          delayed={status === "delayed"}
        />
      </span>
      {status === "delayed" && (
        <span className="mt-1 block">
          <span className="inline-block rounded bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white">
            부진
          </span>
          <span className="mt-0.5 block text-xs text-red-700 dark:text-red-300">
            {formatBehindText(gap)}
          </span>
        </span>
      )}
    </>
  );
}

/** 지표에 붙은 기록(월별 실적·개선조치·추진과제·첨부파일)을 한 줄로 요약한다. 하나도 없으면 null */
function recordSummary(indicator: Indicator): string | null {
  const parts: string[] = [];
  if (hasMonthlyValues(indicator)) parts.push("월별 실적");
  if ((indicator.actions ?? []).length > 0) parts.push(`조치 ${indicator.actions?.length}`);
  if ((indicator.tasks ?? []).length > 0) parts.push(`과제 ${indicator.tasks?.length}`);
  if ((indicator.attachments ?? []).length > 0) parts.push(`파일 ${indicator.attachments?.length}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

const HEAD_CELL = "whitespace-nowrap px-3 py-2 text-left font-medium";
const NUMBER_HEAD_CELL = "whitespace-nowrap px-3 py-2 text-right font-medium";
const CELL = "px-3 py-2 align-top";
const NUMBER_CELL = "whitespace-nowrap px-3 py-2 text-right align-top tabular-nums";

/** 관리 칸의 작은 버튼 모양 */
const ACTION_BUTTON =
  "rounded border border-black/20 px-2 py-0.5 text-xs hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10";

export default function IndicatorTable({ rows, onOpenDetail, onEdit, onDelete }: IndicatorTableProps) {
  const showActions = onEdit !== undefined || onDelete !== undefined;

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <caption className="sr-only">
          성과지표 현황 (총 {rows.length}건)
        </caption>
        <thead className="bg-black/[.04] dark:bg-white/[.06]">
          <tr>
            <th scope="col" className={HEAD_CELL}>지표 구분</th>
            <th scope="col" className={HEAD_CELL}>지표명</th>
            <th scope="col" className={HEAD_CELL}>세부 평가항목</th>
            <th scope="col" className={HEAD_CELL}>평가방법</th>
            <th scope="col" className={NUMBER_HEAD_CELL}>배점</th>
            <th scope="col" className={NUMBER_HEAD_CELL}>목표</th>
            <th scope="col" className={NUMBER_HEAD_CELL}>현재 실적</th>
            <th scope="col" className={NUMBER_HEAD_CELL}>진척률</th>
            <th scope="col" className={NUMBER_HEAD_CELL}>예상달성도</th>
            <th scope="col" className={HEAD_CELL}>보완사항</th>
            {showActions && <th scope="col" className={HEAD_CELL}>관리</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ indicator, evaluation, index }) => {
            const records = recordSummary(indicator);
            return (
              <tr
                // 지표에는 고유 번호가 없을 수 있어, 전체 목록에서의 위치(index)로 구분한다.
                key={index}
                // 부진지표는 붉은 배경과 왼쪽 굵은 선으로 강조한다. (색뿐 아니라 "부진" 글자도 함께 보여준다)
                className={
                  evaluation.status === "delayed"
                    ? "border-t border-black/10 border-l-4 border-l-red-600 bg-red-500/10 dark:border-white/15"
                    : "border-t border-black/10 border-l-4 border-l-transparent dark:border-white/15"
                }
                data-status={evaluation.status}
              >
                <td className={`${CELL} whitespace-nowrap`}>{indicator.category}</td>
                <td className={`${CELL} font-medium`}>
                  {onOpenDetail ? (
                    <button
                      type="button"
                      onClick={() => onOpenDetail(index)}
                      className="text-left font-medium underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
                      aria-label={`${indicator.name} 세부 화면 열기`}
                      data-testid="open-detail"
                    >
                      {indicator.name}
                    </button>
                  ) : (
                    indicator.name
                  )}
                  {records && (
                    <span className="mt-0.5 block text-xs font-normal text-foreground/60">{records}</span>
                  )}
                </td>
                <td className={CELL}>{indicator.item}</td>
                <td className={CELL}>{indicator.method}</td>
                <td className={NUMBER_CELL}>{formatNumber(indicator.weight)}</td>
                <td className={NUMBER_CELL}>{formatNumber(indicator.targetValue)}</td>
                <td className={NUMBER_CELL}>{formatNumber(evaluation.actual ?? undefined)}</td>
                <td className={NUMBER_CELL}>
                  <ProgressCell evaluation={evaluation} />
                </td>
                <td className={NUMBER_CELL}>{formatPercent(indicator.expected)}</td>
                <td className={CELL}>
                  {hasMissingNote(indicator, evaluation.status) ? (
                    // 부진인데 보완사항이 비어 있다. (예: 자료 기준일을 바꿔 새로 부진이 된 지표)
                    onEdit ? (
                      <button
                        type="button"
                        onClick={() => onEdit(index)}
                        className="rounded border border-red-600 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-500/10 dark:text-red-300"
                      >
                        보완사항 입력 필요
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-red-700 dark:text-red-300">
                        보완사항 입력 필요
                      </span>
                    )
                  ) : (
                    (indicator.note ?? EMPTY_MARK)
                  )}
                </td>
                {showActions && (
                  <td className={`${CELL} whitespace-nowrap`}>
                    <div className="flex gap-1">
                      {onEdit && (
                        <button
                          type="button"
                          className={ACTION_BUTTON}
                          aria-label={`${indicator.name} 수정`}
                          onClick={() => onEdit(index)}
                        >
                          수정
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          className={ACTION_BUTTON}
                          aria-label={`${indicator.name} 삭제`}
                          onClick={() => onDelete(index)}
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
