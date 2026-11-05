// Design Ref: §13 월별 실적 추이 — 월별 누적(또는 월말값) 꺾은선과 목표 경로를 한 그래프에 그린다.
// Plan SC: 작업 17 — 각 지표 월별 실적 추이 시각화. 차트 라이브러리 없이 SVG로 직접 그린다.

import { formatNumber } from "@/lib/format";
import type { MonthPoint } from "@/lib/monthly";

interface MonthlyChartProps {
  series: MonthPoint[];
  /** 자료 기준일이 속한 달(1~12). 그래프에 세로 표시를 한다. */
  referenceMonth: number;
  /** 누적이면 "누적 실적", 월말값이면 "월말 값"으로 범례에 적는다. */
  levelLabel: string;
}

const WIDTH = 640;
const HEIGHT = 280;
const PAD = { left: 56, right: 16, top: 16, bottom: 36 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
const TICKS = 4;

/** 값 목록으로 그래프 세로축 범위를 정한다. 값이 모두 같으면 위아래로 조금 벌린다. */
function domainOf(values: number[]): { min: number; max: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return { min: min - 1, max: max + 1 };
  const margin = (max - min) * 0.08;
  return { min: min - margin, max: max + margin };
}

export default function MonthlyChart({ series, referenceMonth, levelLabel }: MonthlyChartProps) {
  const values = series.flatMap((p) => [p.level, p.plan]).filter((v): v is number => v !== null);
  if (values.length === 0) {
    return <p className="text-sm text-foreground/70">그래프로 그릴 값이 없습니다.</p>;
  }

  const { min, max } = domainOf(values);
  const x = (month: number) => PAD.left + ((month - 0.5) / series.length) * PLOT_W;
  const y = (value: number) => PAD.top + (1 - (value - min) / (max - min)) * PLOT_H;

  /** 값이 있는 달만 이어 그린 선의 좌표 글자 */
  const line = (pick: (p: MonthPoint) => number | null) =>
    series
      .filter((p) => pick(p) !== null)
      .map((p) => `${x(p.month).toFixed(1)},${y(pick(p) as number).toFixed(1)}`)
      .join(" ");

  const levelPoints = series.filter((p) => p.level !== null);
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => min + ((max - min) * i) / TICKS);

  return (
    <figure>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`월별 ${levelLabel}과 목표 경로 그래프. ${levelPoints
          .map((p) => `${p.month}월 ${formatNumber(p.level ?? undefined)}`)
          .join(", ")}`}
        data-testid="monthly-chart"
      >
        {/* 가로 눈금선과 세로축 숫자 */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-black/10 dark:stroke-white/15"
            />
            <text
              x={PAD.left - 8}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-foreground/60 text-[11px]"
            >
              {formatNumber(Number(tick.toPrecision(4)))}
            </text>
          </g>
        ))}

        {/* 자료 기준일이 속한 달 */}
        <line
          x1={x(referenceMonth)}
          x2={x(referenceMonth)}
          y1={PAD.top}
          y2={HEIGHT - PAD.bottom}
          strokeDasharray="2 4"
          className="stroke-foreground/50"
        />
        <text x={x(referenceMonth)} y={PAD.top + 10} textAnchor="middle" className="fill-foreground/70 text-[10px]">
          기준일
        </text>

        {/* 가로축: 1월 ~ 12월 */}
        {series.map((p) => (
          <text
            key={p.month}
            x={x(p.month)}
            y={HEIGHT - PAD.bottom + 18}
            textAnchor="middle"
            className="fill-foreground/60 text-[11px]"
          >
            {p.month}월
          </text>
        ))}

        {/* 목표 경로(점선) */}
        <polyline
          points={line((p) => p.plan)}
          fill="none"
          strokeWidth={2}
          strokeDasharray="6 5"
          className="stroke-foreground/45"
          data-line="plan"
        />

        {/* 실적(굵은 선과 점) */}
        <polyline
          points={line((p) => p.level)}
          fill="none"
          strokeWidth={3}
          className="stroke-blue-600"
          data-line="level"
        />
        {levelPoints.map((p) => (
          <circle
            key={p.month}
            cx={x(p.month)}
            cy={y(p.level as number)}
            r={p.entered === null ? 3 : 4.5}
            className={p.entered === null ? "fill-background stroke-blue-600" : "fill-blue-600"}
            strokeWidth={2}
          >
            <title>{`${p.month}월 ${levelLabel} ${formatNumber(p.level ?? undefined)}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-foreground/70">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 bg-blue-600" aria-hidden="true" />
          {levelLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-5 border-t-2 border-dashed border-foreground/45" aria-hidden="true" />
          목표 경로 (기준값에서 목표값까지 매달 같은 폭)
        </span>
        <span>세로 점선: 자료 기준일이 속한 달</span>
      </figcaption>
    </figure>
  );
}
