// Design Ref: §2.2 ⑤ 지표 표 — 모든 지표를 한 화면(한 표)에 보여준다. (최대 30행, 쪽 나누기 없음)
// Plan SC: 작업 5 — 지표 통합 현황 화면 (표). 부진 강조·진행 막대는 작업 6·7에서 더한다.

import { clampForDisplay, resolveProgress } from "@/lib/calc";
import { EMPTY_MARK, formatNumber, formatPercent } from "@/lib/format";
import type { Indicator } from "@/types/indicator";

interface IndicatorTableProps {
  indicators: Indicator[];
}

/** 진척률 칸: 값을 알면 퍼센트, 모르면 "직접 입력 필요", 범위 밖이면 잘라 표시하고 원래 값을 안내한다. */
function ProgressCell({ indicator }: { indicator: Indicator }) {
  const progress = resolveProgress(indicator);

  if (progress === null) {
    return <span className="text-foreground/60">직접 입력 필요</span>;
  }

  const shown = clampForDisplay(progress);
  return (
    <>
      <span>{formatPercent(shown)}</span>
      {shown !== progress && (
        <span className="block text-xs text-foreground/60">
          (원래 값 {formatPercent(progress)})
        </span>
      )}
    </>
  );
}

const HEAD_CELL = "whitespace-nowrap px-3 py-2 text-left font-medium";
const NUMBER_HEAD_CELL = "whitespace-nowrap px-3 py-2 text-right font-medium";
const CELL = "px-3 py-2 align-top";
const NUMBER_CELL = "whitespace-nowrap px-3 py-2 text-right align-top tabular-nums";

export default function IndicatorTable({ indicators }: IndicatorTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <caption className="sr-only">
          성과지표 현황 (총 {indicators.length}건)
        </caption>
        <thead className="bg-black/[.04] dark:bg-white/[.06]">
          <tr>
            <th scope="col" className={HEAD_CELL}>구분</th>
            <th scope="col" className={HEAD_CELL}>지표명</th>
            <th scope="col" className={HEAD_CELL}>평가항목</th>
            <th scope="col" className={HEAD_CELL}>평가방법</th>
            <th scope="col" className={NUMBER_HEAD_CELL}>배점</th>
            <th scope="col" className={NUMBER_HEAD_CELL}>목표</th>
            <th scope="col" className={NUMBER_HEAD_CELL}>실적</th>
            <th scope="col" className={NUMBER_HEAD_CELL}>진척률</th>
            <th scope="col" className={NUMBER_HEAD_CELL}>예상달성도</th>
            <th scope="col" className={HEAD_CELL}>보완사항</th>
          </tr>
        </thead>
        <tbody>
          {indicators.map((indicator, index) => (
            <tr
              // 지표에는 아직 고유 번호가 없어, 부점·지표명·순서로 구분한다.
              key={`${indicator.branch}-${indicator.name}-${index}`}
              className="border-t border-black/10 dark:border-white/15"
            >
              <td className={`${CELL} whitespace-nowrap`}>{indicator.category}</td>
              <td className={`${CELL} font-medium`}>{indicator.name}</td>
              <td className={CELL}>{indicator.item}</td>
              <td className={CELL}>{indicator.method}</td>
              <td className={NUMBER_CELL}>{formatNumber(indicator.weight)}</td>
              <td className={NUMBER_CELL}>{formatNumber(indicator.targetValue)}</td>
              <td className={NUMBER_CELL}>{formatNumber(indicator.actualValue)}</td>
              <td className={NUMBER_CELL}>
                <ProgressCell indicator={indicator} />
              </td>
              <td className={NUMBER_CELL}>{formatPercent(indicator.expected)}</td>
              <td className={CELL}>{indicator.note ?? EMPTY_MARK}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
