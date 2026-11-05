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
        className="stroke-white/10"
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
            className="stroke-emerald-500"
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
            className="stroke-red-500"
            data-part="delayed"
          />
        )}
      </g>
      <text
        x={CENTER}
        y={CENTER - 2}
        textAnchor="middle"
        className="fill-white text-[22px] font-semibold"
      >
        {normalRate === null ? "-" : formatPercent(normalRate)}
      </text>
      <text x={CENTER} y={CENTER + 18} textAnchor="middle" className="fill-gray-400 text-[11px]">
        정상 비율
      </text>
    </svg>
  );
}

/** 카드마다 다른 빛깔. 테두리와 카드 뒤의 은은한 빛에 같은 그라데이션을 쓴다. (구분 순서대로) */
const GRADIENTS = [
  "linear-gradient(137deg, #FF3D77 0%, #FFB1CE 45%, #FF9D3C 100%)",
  "linear-gradient(137deg, #FFFFFF 0%, #7DD3FC 45%, #06B6D4 100%)",
  "linear-gradient(137deg, #4361EE 0%, #E0AEFF 45%, #F72585 100%)",
  "linear-gradient(137deg, #D9F99D 0%, #34D399 45%, #0EA5E9 100%)",
];

export default function CategoryDonuts({ summaries, selected, onSelect }: CategoryDonutsProps) {
  // 구분 하나가 펼쳐져 있으면 나머지 카드는 살짝 흐리게 해서 선택된 카드가 돋보이게 한다.
  const categoryOpen = selected !== null && selected !== "all";

  return (
    <section
      aria-label="지표 구분별 현황"
      className="grid grid-cols-1 gap-10 sm:grid-cols-2 sm:gap-x-6 xl:grid-cols-4 xl:gap-4"
    >
      {summaries.map((summary, index) => {
        const isSelected = selected === summary.category;
        const dimmed = categoryOpen && !isSelected;
        const empty = summary.total === 0;
        const gradient = GRADIENTS[index % GRADIENTS.length];
        return (
          <div
            key={summary.category}
            // 처음 나타날 때 아래에서 위로 올라오며 차례로 나타난다. (움직임 줄이기 설정이면 꺼진다)
            className={`card-in group relative mx-auto flex w-full max-w-[300px] flex-col transition-all duration-300 ease-out motion-reduce:transition-none ${
              isSelected ? "-translate-y-2 scale-[1.03]" : "hover:-translate-y-1"
            } ${dimmed ? "opacity-60 hover:opacity-100" : ""} motion-reduce:transform-none`}
            style={{ animationDelay: `${0.1 * (index + 1)}s` }}
          >
            {/* 카드 뒤에서 번지는 빛. 선택하면 더 밝고 크게, 마우스를 올리면 조금 밝아진다. */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 rounded-[40px] transition-all duration-300 motion-reduce:transition-none ${
                isSelected ? "scale-110 opacity-100" : "opacity-60 group-hover:opacity-85"
              }`}
              style={{ background: gradient, filter: "blur(45px)" }}
            />
            <button
              type="button"
              onClick={() => onSelect(summary.category)}
              aria-pressed={isSelected}
              aria-label={
                empty
                  ? `${summary.category}: 지표 없음`
                  : `${summary.category}: 전체 ${summary.total}개, 정상 ${summary.normal}개(${formatPercent(summary.normalRate ?? 0)}), 보완 ${summary.delayed}개(${formatPercent(summary.delayedRate ?? 0)}). 눌러서 세부 지표 ${isSelected ? "접기" : "보기"}`
              }
              data-category={summary.category}
              // 8px 그라데이션 테두리: 안쪽은 어두운 면(padding-box), 테두리 자리에는 그라데이션(border-box)
              className="relative z-10 flex w-full flex-col items-center gap-3 overflow-hidden rounded-[40px] border-[8px] border-solid border-transparent p-5 text-center text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300"
              style={{
                background: `linear-gradient(#1A1A1C, #1A1A1C) padding-box, ${gradient} border-box`,
              }}
            >
              <h3 className="text-xl font-medium tracking-tight">{summary.category}</h3>
              <Donut summary={summary} />
              {empty ? (
                <p className="text-sm text-gray-400">지표 없음</p>
              ) : (
                <ul className="w-full space-y-1.5 text-sm">
                  <li className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
                      정상
                    </span>
                    <span className="tabular-nums" data-testid="normal-count">
                      {summary.normal}개 ({formatPercent(summary.normalRate ?? 0)})
                    </span>
                  </li>
                  <li className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
                      보완 필요
                    </span>
                    <span className="tabular-nums" data-testid="delayed-count">
                      {summary.delayed}개 ({formatPercent(summary.delayedRate ?? 0)})
                    </span>
                  </li>
                  <li className="flex items-center justify-between gap-2 border-t border-white/15 pt-1.5 text-gray-400">
                    <span>전체</span>
                    <span className="tabular-nums">{summary.total}개</span>
                  </li>
                </ul>
              )}
              <span className="text-xs text-gray-400 selection:bg-white/20">
                {isSelected ? "▲ 세부 지표 접기" : "▼ 눌러서 세부 지표 보기"}
              </span>
            </button>
          </div>
        );
      })}
    </section>
  );
}
