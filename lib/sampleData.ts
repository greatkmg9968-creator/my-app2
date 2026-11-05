// Design Ref: §9 — 화면 확인용 샘플 지표 22건. (최대 30개까지 추가·엑셀 등록할 수 있다)
// Plan SC: 작업 3 — 개발용 샘플 지표 데이터 (부진/정상/초과 달성 섞어서)
//
// 주의: 이 값은 개발 확인용 가짜 데이터이며 실제 지표 값이 아니다.
// 자료 기준일 SAMPLE_REFERENCE_DATE(경과율 78.9%) 기준으로 부진·정상·초과 달성이 섞이도록 짰다.
// 지표 구분은 부점 계량 / 부점 비계량 / 공통 계량 / 공통 비계량 네 가지가 모두 들어 있다.

import type {
  AggregationMode,
  ImprovementAction,
  Indicator,
  PromotionTask,
} from "@/types/indicator";

/** 샘플을 확인할 때 쓰는 자료 기준일. 연중 288일째, 경과율 78.9% */
export const SAMPLE_REFERENCE_DATE = "2026-10-15";

/** 샘플 부점 이름. 처음 열면 이 이름이 들어 있고, 화면에서 바꿀 수 있다. */
export const SAMPLE_BRANCH = "캠코인재개발원";

/** 모든 샘플 지표에 공통인 값 */
const COMMON = { branch: SAMPLE_BRANCH, evalDate: SAMPLE_REFERENCE_DATE } as const;

/**
 * 샘플을 만들 때 쓰는 분야 이름(영업, 수신 …)으로 지표 구분의 "부점/공통"을 정한다.
 * 내부통제·고객·효율 분야는 모든 부점에 공통인 지표로, 나머지는 부점 지표로 본다.
 */
function scopeOf(field: string): "부점" | "공통" {
  return ["내부통제", "고객", "효율"].includes(field) ? "공통" : "부점";
}

/** numeric()에 넘기는 수치 칸. 월별 실적이 있으면 실적값은 생략하고 월별 실적에서 현재 실적을 구한다. */
interface NumericValues {
  base: number;
  target: number;
  actual?: number;
  /** 목표값 = 기준값이라 진척률을 자동 계산할 수 없을 때만 직접 입력한다. */
  progress?: number;
  aggregation?: AggregationMode;
  monthly?: (number | null)[];
}

/** 수치 지표(계량): 기준값·목표값·실적값(또는 월별 실적)이 있어 진척률을 자동 계산한다. 첫 칸은 샘플 분야 이름이다. */
function numeric(
  field: string,
  name: string,
  item: string,
  method: string,
  weight: number,
  values: NumericValues,
  expected: number,
  note?: string,
): Indicator {
  return {
    ...COMMON,
    category: `${scopeOf(field)} 계량`,
    name,
    item,
    method,
    weight,
    baseValue: values.base,
    targetValue: values.target,
    ...(values.actual !== undefined ? { actualValue: values.actual } : {}),
    ...(values.aggregation ? { aggregation: values.aggregation } : {}),
    ...(values.monthly ? { monthly: values.monthly } : {}),
    ...(values.progress !== undefined ? { progress: values.progress } : {}),
    expected,
    ...(note ? { note } : {}),
  };
}

/** 수치로 나타낼 수 없는 지표(비계량): 진척률을 직접 입력한다. */
function manual(
  field: string,
  name: string,
  item: string,
  method: string,
  weight: number,
  progress: number,
  expected: number,
  note?: string,
): Indicator {
  return {
    ...COMMON,
    category: `${scopeOf(field)} 비계량`,
    name,
    item,
    method,
    weight,
    expected,
    progress,
    ...(note ? { note } : {}),
  };
}

/** 개발용 샘플 지표 22건. 아래에서 번호와 개선조치·추진과제를 붙여 SAMPLE_INDICATORS로 내보낸다. */
const RAW_SAMPLES: Indicator[] = [
  // ── 부점 계량 (캠코인재개발원): 수치로 평가하는 지표 ─────────────────────
  numeric("연수", "연수시설의 합리적 운영", "연수시설 가동률(%)", "기말 가동률 − 기초 가동률", 10, { base: 60, target: 80, aggregation: "latest", monthly: [62, 64, 66, 68, 70, 71, 72, 73, 74, 75, null, null] }, 85, "객실·강의실 가동 계획을 보완하고 외부 위탁 교육 유치를 늘린다."),
  numeric("연수", "AI 역량 강화를 위한 노력과 성과", "AI 교육 이수 인원(명)", "연간 누적 이수 인원 ÷ 목표", 8, { base: 0, target: 400, monthly: [20, 30, 40, 45, 40, 35, 30, 40, 35, 45, null, null] }, 95),
  numeric("연수", "지식경영, 아이디어 제안 활성화 성과", "아이디어 제안 건수(건)", "연간 누적 제안 건수 ÷ 목표", 7, { base: 0, target: 120, actual: 70 }, 70, "부서별 제안 목표를 정하고 우수 제안을 포상한다."),

  // ── 부점 비계량 (캠코인재개발원): 정성 평가, 진척률 직접 입력 ───────────────
  manual("연수", "조직 및 인적자원관리", "조직·인사 운영 평가", "정성 평가 결과 환산", 30, 85, 90),
  manual("연수", "안전 및 재난관리", "안전·재난 점검 이행", "점검·훈련 이행 항목 ÷ 계획 항목", 15, 70, 80, "미실시 안전 훈련을 4분기 일정에 배치한다."),
  manual("연수", "상생,협력 및 지역발전", "상생·협력 활동 이행", "이행 활동 ÷ 계획 활동", 12, 90, 95),

  // ── 공통 계량: 높을수록 좋은 지표와 낮을수록 좋은 지표 ─────────────────────
  numeric("고객", "모바일뱅킹 가입 증가", "신규 가입자 수", "연간 누적 명수 ÷ 목표", 4, { base: 0, target: 800, actual: 790 }, 100),
  numeric("고객", "우수 고객 비중 확대", "우수 고객 비중(%)", "기말 비중 − 기초 비중", 4, { base: 20, target: 30, actual: 24 }, 50, "우수 고객 전환 대상을 선별해 상담을 진행한다."),
  numeric("고객", "민원 건수 감축", "민원 건수", "기초 건수에서 목표까지 감축", 3, { base: 50, target: 20, actual: 30 }, 70, "민원 다발 유형을 분석해 교육을 시행한다."),
  numeric("내부통제", "업무 오류 감축", "오류 건수", "기초 건수에서 목표까지 감축", 3, { base: 40, target: 10, actual: 8 }, 110),
  numeric("고객", "고객 대기 시간 단축", "평균 대기 시간(분)", "기초 시간에서 목표까지 단축", 3, { base: 15, target: 8, actual: 12 }, 50, "혼잡 시간대 창구 인력을 조정한다."),
  numeric("효율", "직원 이직률 관리", "이직률(%)", "기초 이직률에서 목표까지 개선", 3, { base: 10, target: 5, actual: 6 }, 85),
  numeric("효율", "영업경비 절감", "영업경비(백만원)", "기초 경비에서 목표까지 절감", 3, { base: 500, target: 450, actual: 480 }, 45, "소모품과 출장비 집행 기준을 강화한다."),
  // 목표값 = 기준값이라 진척률을 직접 입력하는 계량 지표
  numeric("효율", "목표 미확정 지표", "실적 수치", "목표 확정 후 평가", 3, { base: 10, target: 10, actual: 12, progress: 85 }, 80),

  // ── 공통 비계량: 수치로 나타낼 수 없는 지표, 진척률 직접 입력 ──────────────
  manual("내부통제", "내부통제 점검 이행", "점검 이행 비율", "점검표 이행 항목 ÷ 전체 항목", 3, 90, 95),
  manual("내부통제", "필수 교육 이수", "교육 이수율", "이수 인원 ÷ 대상 인원", 3, 100, 100),
  manual("고객", "소비자 보호 활동", "활동 이행 비율", "이행 활동 ÷ 계획 활동", 3, 50, 60, "상품 설명 점검 활동을 월 단위로 늘린다."),
  manual("효율", "ESG 활동 실적", "활동 이행 비율", "이행 활동 ÷ 계획 활동", 3, 120, 130),
  manual("효율", "지역사회 공헌", "봉사 활동 이행", "참여 활동 ÷ 계획 활동", 3, 79, 85),
  // 경계 사례: 진척률이 경과율(78.9%)과 같으면 정상, 0.1 낮으면 부진
  manual("내부통제", "영업점 안전 점검", "점검 이행 비율", "완료 점검 ÷ 계획 점검", 3, 78.9, 85),
  manual("효율", "업무 매뉴얼 개정", "개정 완료 비율", "개정 완료 ÷ 대상 매뉴얼", 3, 78.8, 80, "남은 매뉴얼은 담당자별로 마감일을 정한다."),
  manual("고객", "정성 평가 지표", "정성 평가 결과", "평가 완료 후 점수 입력", 3, 88, 90),
];
/** 샘플에 붙이는 개선조치·추진과제. (지표 이름으로 찾는다) */
const SAMPLE_RECORDS: Record<string, { actions?: ImprovementAction[]; tasks?: PromotionTask[] }> = {
  "연수시설의 합리적 운영": {
    actions: [
      { date: "2026-08-20", content: "비수기 객실·강의실 외부 위탁 교육 유치 상담", owner: "김운영", status: "완료", effect: "위탁 교육 2건 확정" },
      { date: "2026-10-05", content: "4분기 시설 가동 계획 재수립", owner: "김운영", status: "진행" },
    ],
    tasks: [
      { title: "외부 위탁 교육 유치 확대", due: "2026-12-15", owner: "운영팀", status: "진행" },
      { title: "시설 예약·가동 현황 정비", due: "2026-10-31", owner: "시설팀", status: "예정" },
    ],
  },
  "AI 역량 강화를 위한 노력과 성과": {
    actions: [{ date: "2026-09-12", content: "전 직원 대상 생성형 AI 활용 교육 운영", owner: "박교육", status: "완료", effect: "교육 이수 45명" }],
    tasks: [{ title: "AI 활용 사례 공유회", due: "2026-11-30", owner: "교육팀", status: "진행" }],
  },
  "지식경영, 아이디어 제안 활성화 성과": {
    tasks: [{ title: "우수 제안 포상과 사례 공유", due: "2026-12-10", owner: "기획팀", status: "예정" }],
  },
  "민원 건수 감축": {
    actions: [{ date: "2026-09-25", content: "민원 다발 유형 분석 및 창구 직원 교육", owner: "이고객", status: "완료", effect: "월 민원 건수 감소 추세" }],
  },
};
/** 개발용 샘플 지표 22건. 번호(sample-1 …)와 개선조치·추진과제가 붙어 있다. */
export const SAMPLE_INDICATORS: Indicator[] = RAW_SAMPLES.map((indicator, index) => ({
  ...indicator,
  id: `sample-${index + 1}`,
  ...(SAMPLE_RECORDS[indicator.name] ?? {}),
}));
