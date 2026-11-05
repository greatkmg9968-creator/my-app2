// Design Ref: §2.2 ⑤ — 진척률 막대(경과율 눈금선 함께). 100%가 가득 찬 길이, 100% 초과분은 끝 표시.
// Plan SC: 작업 7 — 지표마다 진행 막대로 진척률과 경과율을 비교

import { calcBarGeometry } from "@/lib/bar";
import { formatPercent } from "@/lib/format";

interface ProgressBarProps {
  /** 진척률(%). 저장된 원래 값 (0~200 밖일 수도 있다) */
  progress: number;
  /** 자료 기준일의 경과율(%) */
  elapsedRate: number;
  /** 부진이면 붉은색, 아니면 초록색으로 채운다. */
  delayed: boolean;
}

export default function ProgressBar({ progress, elapsedRate, delayed }: ProgressBarProps) {
  const { fillPercent, overflow, tickPercent } = calcBarGeometry(progress, elapsedRate);

  return (
    <div
      // 화면 읽기 프로그램을 쓰는 분도 값을 알 수 있게 글로 설명을 붙인다.
      role="img"
      aria-label={`진척률 ${formatPercent(progress)}, 경과율 ${formatPercent(elapsedRate)}${
        overflow ? ", 100% 초과 달성" : ""
      }`}
      className="relative ml-auto h-2.5 w-32 rounded-full bg-white/15"
      data-fill={fillPercent}
      data-overflow={overflow}
    >
      {/* 채워진 부분 */}
      <div
        className={`h-full rounded-full ${delayed ? "bg-red-600" : "bg-emerald-600"}`}
        style={{ width: `${fillPercent}%` }}
      />
      {/* 100% 초과 표시: 막대 오른쪽 끝에 색이 다른 조각을 붙인다. */}
      {overflow && (
        <div
          aria-hidden="true"
          className="absolute right-0 top-0 h-full w-2 rounded-r-full bg-amber-400"
        />
      )}
      {/* 경과율 눈금선: 막대가 이 선보다 짧으면 시간보다 뒤처진 것이다. */}
      <div
        aria-hidden="true"
        className="absolute -top-[3px] h-4 w-0.5 -translate-x-1/2 bg-foreground"
        style={{ left: `${tickPercent}%` }}
      />
    </div>
  );
}
