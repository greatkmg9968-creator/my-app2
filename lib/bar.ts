// Design Ref: §2.2 ⑤ — 진행 막대는 100%를 가득 찬 길이로 하고, 100% 초과분은 끝 표시와 숫자로 보여준다.
// Plan SC: 작업 7 — 진척률·경과율 시각화 (지표마다 진행 막대로 비교)

/** 진행 막대를 그리는 데 필요한 값 */
export interface BarGeometry {
  /** 채워진 길이(%). 0~100. 0 미만은 빈 막대(0), 100 이상은 가득 찬 막대(100) */
  fillPercent: number;
  /** 100%를 넘었는지. true면 막대 끝에 초과 표시를 붙인다. */
  overflow: boolean;
  /** 경과율 눈금선의 위치(%). 0~100 */
  tickPercent: number;
}

function clamp100(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * 진척률과 경과율로 막대 모양을 정한다.
 * 막대 길이는 100%가 기준이다. 100%를 넘는 값(최대 200%)은 길이를 늘리지 않고 overflow로 알린다.
 */
export function calcBarGeometry(progress: number, elapsedRate: number): BarGeometry {
  return {
    fillPercent: clamp100(progress),
    overflow: progress > 100,
    tickPercent: clamp100(elapsedRate),
  };
}
