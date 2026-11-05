// Design Ref: §2.2 ⑤ — 진척률 막대(경과율 눈금선 함께). 100%가 가득 찬 길이, 100% 초과분은 끝 표시.
// Plan SC: 작업 7 — 지표마다 진행 막대로 진척률과 경과율을 비교
// 모양은 3D 원통(튜브)처럼: 홈이 파인 바탕 위에 위쪽이 밝고 아래가 어두운 막대, 광택 줄, 은은한 빛 번짐을 준다.

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
      // 홈이 파인 바탕(안쪽 그림자)
      className="relative ml-auto h-3.5 w-36 rounded-full bg-gradient-to-b from-black/70 to-white/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.85),0_1px_0_rgba(255,255,255,0.14)]"
      data-fill={fillPercent}
      data-overflow={overflow}
    >
      {/* 채워진 부분: 위가 밝고 아래가 어두운 원통 + 빛 번짐 */}
      <div
        className={`relative h-full overflow-hidden rounded-full ${
          delayed
            ? "bg-gradient-to-b from-red-300 via-red-500 to-red-800 shadow-[0_0_12px_rgba(248,113,113,0.6),inset_0_-2px_3px_rgba(0,0,0,0.35)]"
            : "bg-gradient-to-b from-emerald-200 via-emerald-500 to-emerald-800 shadow-[0_0_12px_rgba(52,211,153,0.6),inset_0_-2px_3px_rgba(0,0,0,0.35)]"
        }`}
        style={{ width: `${fillPercent}%` }}
      >
        {/* 광택 줄 */}
        <div aria-hidden="true" className="absolute left-1 right-1 top-[2px] h-[3px] rounded-full bg-white/50" />
      </div>
      {/* 100% 초과 표시: 막대 오른쪽 끝에 색이 다른 조각을 붙인다. */}
      {overflow && (
        <div
          aria-hidden="true"
          className="absolute right-0 top-0 h-full w-2.5 rounded-r-full bg-gradient-to-b from-amber-200 via-amber-400 to-amber-700 shadow-[0_0_10px_rgba(251,191,36,0.7)]"
        />
      )}
      {/* 경과율 눈금선: 막대가 이 선보다 짧으면 시간보다 뒤처진 것이다. */}
      <div
        aria-hidden="true"
        className="absolute -top-[4px] h-[22px] w-[3px] -translate-x-1/2 rounded-full bg-gradient-to-b from-white to-gray-300 shadow-[0_0_8px_rgba(255,255,255,0.9),1px_2px_3px_rgba(0,0,0,0.7)]"
        style={{ left: `${tickPercent}%` }}
      />
    </div>
  );
}