// Design Ref: §2.2 대시보드 — 지표 구분 네 가지마다 정상·보완 지표의 개수(비율)를 게이지형 도넛으로 보여준다.
// Plan SC: 작업 14 — 성과지표 통합 대시보드. 달성율은 넣지 않는다. 도넛을 누르면 아래로 세부 지표가 펼쳐진다.

import { formatPercent } from "@/lib/format";
import type { CategorySummary } from "@/lib/summary";
import type { IndicatorCategory } from "@/types/indicator";

/** 지금 펼쳐진 것: 구분 하나, 전체 지표 보기("all"), 또는 아무것도 펼치지 않음(null) */
export type Selection = IndicatorCategory | "all" | null;

interface CategoryDonutsProps {
  summaries: CategorySummary[];
  selected: Selection;
  /** 도넛을 눌렀을 때. 이미 펼쳐진 구분을 다시 누르면 부르는 쪽에서 접는다. */
  onSelect: (category: IndicatorCategory) => void;
}

const SIZE = 140;
const CENTER = SIZE / 2;
const RADIUS = 54;
const STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** 도넛 한 개: 둘레의 초록 부분이 정상, 붉은 부분이 보완(부진) 지표의 비율이다. */
function Donut({ summary }: { summary: CategorySummary }) {
  const { total, normalRate, delayedRate } = summary;
  const normalLength = total === 0 ? 0 : (CIRCUMFERENCE * (normalRate ?? 0)) / 100;
  const delayedLength = total === 0 ? 0 : (CIRCUMFERENCE * (delayedRate ?? 0)) / 100;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-36 w-36" aria-hidden="true">
      {/* 바탕 고리 */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        className="stroke-black/10 dark:stroke-white/15"
      />
      {/* 12시 방향에서 시계 방향으로 정상 → 보완 순서로 칠한다. */}
      <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
        {normalLength > 0 && (
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeDasharray={`${normalLength} ${CIRCUMFERENCE - normalLength}`}
            className="stroke-emerald-600"
            data-part="normal"
          />
        )}
        {delayedLength > 0 && (
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeDasharray={`${delayedLength} ${CIRCUMFERENCE - delayedLength}`}
            strokeDashoffset={-normalLength}
            className="stroke-red-600"
            data-part="delayed"
          />
        )}
      </g>
      <text
        x={CENTER}
        y={CENTER - 2}
        textAnchor="middle"
        className="fill-foreground text-[22px] font-semibold"
      >
        {normalRate === null ? "-" : formatPercent(normalRate)}
      </text>
      <text x={CENTER} y={CENTER + 18} textAnchor="middle" className="fill-foreground/60 text-[11px]">
        정상 비율
      </text>
    </svg>
  );
}

export default function CategoryDonuts({ summaries, selected, onSelect }: CategoryDonutsProps) {
  return (
    <section aria-label="지표 구분별 현황" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {summaries.map((summary) => {
        const isSelected = selected === summary.category;
        const empty = summary.total === 0;
        return (
          <button
            key={summary.category}
            type="button"
            onClick={() => onSelect(summary.category)}
            aria-pressed={isSelected}
            aria-label={
              empty
                ? `${summary.category}: 지표 없음`
                : `${summary.category}: 전체 ${summary.total}개, 정상 ${summary.normal}개(${formatPercent(summary.normalRate ?? 0)}), 보완 ${summary.delayed}개(${formatPercent(summary.delayedRate ?? 0)}). 눌러서 세부 지표 ${isSelected ? "접기" : "보기"}`
            }
            data-category={summary.category}
            className={`flex flex-col items-center gap-3 rounded-lg border p-4 text-center transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.05] ${
              isSelected
                ? "border-foreground bg-black/[.04] ring-2 ring-foreground/30 dark:bg-white/[.06]"
                : "border-black/10 dark:border-white/15"
            }`}
          >
            <h3 className="text-base font-semibold">{summary.category}</h3>
            <Donut summary={summary} />
            {empty ? (
              <p className="text-sm text-foreground/60">지표 없음</p>
            ) : (
              <ul className="w-full space-y-1 text-sm">
                <li className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" aria-hidden="true" />
                    정상
                  </span>
                  <span className="tabular-nums" data-testid="normal-count">
                    {summary.normal}개 ({formatPercent(summary.normalRate ?? 0)})
                  </span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" aria-hidden="true" />
                    보완 필요
                  </span>
                  <span className="tabular-nums" data-testid="delayed-count">
                    {summary.delayed}개 ({formatPercent(summary.delayedRate ?? 0)})
                  </span>
                </li>
                <li className="flex items-center justify-between gap-2 border-t border-black/10 pt-1 text-foreground/70 dark:border-white/15">
                  <span>전체</span>
                  <span className="tabular-nums">{summary.total}개</span>
                </li>
              </ul>
            )}
            <span className="text-xs text-foreground/60">
              {isSelected ? "▲ 세부 지표 접기" : "▼ 눌러서 세부 지표 보기"}
            </span>
          </button>
        );
      })}
    </section>
  );
}
