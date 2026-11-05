// Design Ref: §2.2 ⑤ 지표 표 — 지표 구분 도넛을 눌러 펼친 세부 지표를 표로 보여준다. (최대 30행, 쪽 나누기 없음)
// Plan SC: 작업 5(표), 작업 6(부진지표 강조 + 경과율과의 차이(%p)), 작업 7(진행 막대)
// 작업 9: 줄마다 "수정"·"삭제" 버튼(관리 칸)을 둔다. 실제 수정·삭제는 위(IndicatorDashboard)가 한다.
// 작업 14~19: 지표명을 누르면 세부 화면(역산·월별 추이·개선조치·추진과제·첨부파일)이 열린다.
// 어떤 지표를 어떤 순서로 보여줄지는 위(IndicatorDashboard)에서 정하고, 이 표는 받은 줄을 그대로 그린다.

import ProgressBar from "@/components/ProgressBar";
import { hasMissingNote, type IndicatorEvaluation } from "@/lib/calc";
import type { IndicatorRow } from "@/lib/filterSort";
import {
  EMPTY_MARK,
  formatBehindText,
  formatNumber,
  formatPercent,
} from "@/lib/format";

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
          <span className="mt-0.5 block text-xs text-red-300">
            {formatBehindText(gap)}
          </span>
        </span>
      )}
    </>
  );
}

const HEAD_CELL = "whitespace-nowrap px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-300";
const NUMBER_HEAD_CELL = "whitespace-nowrap px-4 py-3 text-right text-xs font-medium tracking-wide text-gray-300";
const CELL = "px-4 py-3 align-top text-gray-200";
const NUMBER_CELL = "whitespace-nowrap px-4 py-3 text-right align-top tabular-nums text-gray-200";

/** 관리 칸의 작은 버튼 모양 */
const ACTION_BUTTON =
  "btn btn-sm";

export default function IndicatorTable({ rows, onOpenDetail, onEdit, onDelete }: IndicatorTableProps) {
  const showActions = onEdit !== undefined || onDelete !== undefined;

  return (
    <div className="overflow-x-auto rounded-3xl border border-white/10 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <table className="w-full min-w-[1500px] border-collapse text-sm">
        <caption className="sr-only">
          성과지표 현황 (총 {rows.length}건)
        </caption>
        <thead className="bg-gradient-to-r from-sky-300/10 via-violet-300/10 to-pink-300/10">
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
            <th scope="col" className={HEAD_CELL}>개선, 추진사항</th>
            {showActions && <th scope="col" className={HEAD_CELL}>관리</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ indicator, evaluation, index }) => {
            return (
              <tr
                // 지표에는 고유 번호가 없을 수 있어, 전체 목록에서의 위치(index)로 구분한다.
                key={index}
                // 부진지표는 붉은 배경과 왼쪽 굵은 선으로 강조한다. (색뿐 아니라 "부진" 글자도 함께 보여준다)
                className={
                  evaluation.status === "delayed"
                    ? "border-t border-white/10 border-l-4 border-l-red-400 bg-gradient-to-r from-red-400/15 via-red-400/[.04] to-transparent transition-colors hover:from-red-400/25"
                    : "border-t border-white/10 border-l-4 border-l-transparent transition-colors hover:bg-white/[.05]"
                }
                data-status={evaluation.status}
              >
                <td className={`${CELL} whitespace-nowrap`}>{indicator.category}</td>
                {/* 지표명 칸은 넉넉한 폭을 두어 한두 줄로 보이게 한다. */}
                <td className={`${CELL} min-w-[16rem] font-medium`}>
                  {onOpenDetail ? (
                    <button
                      type="button"
                      onClick={() => onOpenDetail(index)}
                      className="text-left font-medium text-sky-200 underline decoration-sky-200/30 underline-offset-4 transition-colors hover:text-white hover:decoration-sky-200"
                      aria-label={`${indicator.name} 세부 화면 열기`}
                      data-testid="open-detail"
                    >
                      {indicator.name}
                    </button>
                  ) : (
                    indicator.name
                  )}
                </td>
                <td className={`${CELL} min-w-[12rem]`}>{indicator.item}</td>
                <td className={`${CELL} min-w-[13rem]`}>{indicator.method}</td>
                <td className={NUMBER_CELL}>{formatNumber(indicator.weight)}</td>
                <td className={NUMBER_CELL}>{formatNumber(indicator.targetValue)}</td>
                <td className={NUMBER_CELL}>{formatNumber(evaluation.actual ?? undefined)}</td>
                <td className={NUMBER_CELL}>
                  <ProgressCell evaluation={evaluation} />
                </td>
                <td className={NUMBER_CELL}>{formatPercent(indicator.expected)}</td>
                <td className={`${CELL} min-w-[15rem]`}>
                  {hasMissingNote(indicator, evaluation.status) ? (
                    // 부진인데 개선, 추진사항이 비어 있다. (예: 자료 기준일을 바꿔 새로 부진이 된 지표)
                    onEdit ? (
                      <button
                        type="button"
                        onClick={() => onEdit(index)}
                        className="btn btn-sm btn-danger"
                      >
                        개선, 추진사항 입력 필요
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-red-300">
                        개선, 추진사항 입력 필요
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
