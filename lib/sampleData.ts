// Design Ref: §9 — 화면 확인용 샘플 지표 30건. 최대 개수(30개)와 같은 크기로 만든다.
// Plan SC: 작업 3 — 개발용 샘플 지표 데이터 (부진/정상/초과 달성 섞어서)
//
// 주의: 이 값은 개발 확인용 가짜 데이터이며 실제 지표 값이 아니다.
// 자료 기준일 SAMPLE_REFERENCE_DATE(경과율 78.9%) 기준으로 부진·정상·초과·판정 보류가 섞이도록 짰다.

import type { Indicator } from "@/types/indicator";

/** 샘플을 확인할 때 쓰는 자료 기준일. 연중 288일째, 경과율 78.9% */
export const SAMPLE_REFERENCE_DATE = "2026-10-15";

/** 샘플 부점 이름 */
export const SAMPLE_BRANCH = "샘플부점";

/** 모든 샘플 지표에 공통인 값 */
const COMMON = { branch: SAMPLE_BRANCH, evalDate: SAMPLE_REFERENCE_DATE } as const;

/** 수치 지표: 기준값·목표값·실적값이 있어 진척률을 자동 계산한다. */
function numeric(
  category: string,
  name: string,
  item: string,
  method: string,
  weight: number,
  values: { base: number; target: number; actual: number },
  expected: number,
  note?: string,
): Indicator {
  return {
    ...COMMON,
    category,
    name,
    item,
    method,
    weight,
    baseValue: values.base,
    targetValue: values.target,
    actualValue: values.actual,
    expected,
    ...(note ? { note } : {}),
  };
}

/** 수치로 나타낼 수 없는 지표: 진척률을 직접 입력한다. progress를 생략하면 "판정 보류"가 된다. */
function manual(
  category: string,
  name: string,
  item: string,
  method: string,
  weight: number,
  progress: number | undefined,
  expected: number,
  note?: string,
): Indicator {
  return {
    ...COMMON,
    category,
    name,
    item,
    method,
    weight,
    expected,
    ...(progress !== undefined ? { progress } : {}),
    ...(note ? { note } : {}),
  };
}

/** 개발용 샘플 지표 30건 (배점 합계 100) */
export const SAMPLE_INDICATORS: Indicator[] = [
  // ── 영업·수신·여신: 높을수록 좋은 수치 지표 ─────────────────────────
  numeric("영업", "신규 고객 유치", "신규 고객 수", "연간 누적 명수 ÷ 목표", 4, { base: 0, target: 1200, actual: 1050 }, 95),
  numeric("수신", "수신 잔액 증대", "수신 잔액(억원)", "기말 잔액 − 기초 잔액", 4, { base: 1000, target: 1500, actual: 1300 }, 75, "법인 예금 유치 활동을 4분기에 집중한다."),
  numeric("여신", "여신 잔액 증대", "여신 잔액(억원)", "기말 잔액 − 기초 잔액", 4, { base: 800, target: 1000, actual: 960 }, 100),
  numeric("영업", "카드 신규 발급", "발급 건수", "연간 누적 건수 ÷ 목표", 4, { base: 0, target: 500, actual: 300 }, 65, "제휴 가맹점 행사와 연계해 발급을 늘린다."),
  numeric("영업", "펀드 판매", "판매액(억원)", "연간 누적 판매액 ÷ 목표", 4, { base: 0, target: 200, actual: 310 }, 150),
  numeric("영업", "방카슈랑스 수수료", "수수료 수익(백만원)", "연간 누적 수수료 ÷ 목표", 4, { base: 0, target: 400, actual: 420 }, 110),
  numeric("영업", "외환 거래 확대", "외환 거래액(백만불)", "기말 거래액 − 기초 거래액", 4, { base: 50, target: 150, actual: 100 }, 60, "수출입 기업 대상 방문 영업을 늘린다."),
  numeric("고객", "모바일뱅킹 가입 증가", "신규 가입자 수", "연간 누적 명수 ÷ 목표", 4, { base: 0, target: 800, actual: 790 }, 100),
  numeric("고객", "우수 고객 비중 확대", "우수 고객 비중(%)", "기말 비중 − 기초 비중", 4, { base: 20, target: 30, actual: 24 }, 50, "우수 고객 전환 대상을 선별해 상담을 진행한다."),
  numeric("수신", "비이자 수익 확대", "비이자 수익(백만원)", "연간 누적 수익 ÷ 목표", 4, { base: 0, target: 100, actual: 260 }, 200),

  // ── 리스크·고객·효율: 낮을수록 좋은 수치 지표 ────────────────────────
  numeric("고객", "민원 건수 감축", "민원 건수", "기초 건수에서 목표까지 감축", 3, { base: 50, target: 20, actual: 30 }, 70, "민원 다발 유형을 분석해 교육을 시행한다."),
  numeric("리스크", "연체율 관리", "연체율(%)", "기초 연체율에서 목표까지 개선", 3, { base: 2.0, target: 1.0, actual: 1.2 }, 85),
  numeric("내부통제", "업무 오류 감축", "오류 건수", "기초 건수에서 목표까지 감축", 3, { base: 40, target: 10, actual: 8 }, 110),
  numeric("고객", "고객 대기 시간 단축", "평균 대기 시간(분)", "기초 시간에서 목표까지 단축", 3, { base: 15, target: 8, actual: 12 }, 50, "혼잡 시간대 창구 인력을 조정한다."),
  numeric("효율", "직원 이직률 관리", "이직률(%)", "기초 이직률에서 목표까지 개선", 3, { base: 10, target: 5, actual: 6 }, 85),
  numeric("효율", "영업경비 절감", "영업경비(백만원)", "기초 경비에서 목표까지 절감", 3, { base: 500, target: 450, actual: 480 }, 45, "소모품과 출장비 집행 기준을 강화한다."),
  numeric("리스크", "부실채권 비율 관리", "부실채권 비율(%)", "기초 비율에서 목표까지 개선", 3, { base: 1.5, target: 0.8, actual: 0.9 }, 90),

  // ── 경계·극단 사례: 화면에서 잘라 표시하는 경우 ───────────────────────
  numeric("수신", "순이자마진 개선", "마진 변화(bp)", "기말 마진 − 기초 마진", 3, { base: 0, target: 10, actual: -4 }, 20, "금리 조정 시기에 맞춘 상품 구성을 재검토한다."),

  // ── 수치로 나타낼 수 없는 지표: 진척률 직접 입력 ──────────────────────
  manual("고객", "고객 만족도 평가", "만족도 등급 이행", "분기별 평가 등급 환산", 3, 85, 90),
  manual("내부통제", "내부통제 점검 이행", "점검 이행 비율", "점검표 이행 항목 ÷ 전체 항목", 3, 90, 95),
  manual("내부통제", "필수 교육 이수", "교육 이수율", "이수 인원 ÷ 대상 인원", 3, 100, 100),
  manual("내부통제", "자체 점검 이행", "점검 완료 비율", "완료 점검 ÷ 계획 점검", 3, 70, 80, "미실시 점검을 4분기 일정에 배치한다."),
  manual("고객", "소비자 보호 활동", "활동 이행 비율", "이행 활동 ÷ 계획 활동", 3, 50, 60, "상품 설명 점검 활동을 월 단위로 늘린다."),
  manual("효율", "ESG 활동 실적", "활동 이행 비율", "이행 활동 ÷ 계획 활동", 3, 120, 130),
  manual("효율", "지역사회 공헌", "봉사 활동 이행", "참여 활동 ÷ 계획 활동", 3, 79, 85),
  manual("내부통제", "영업점 안전 점검", "점검 이행 비율", "완료 점검 ÷ 계획 점검", 3, 78.9, 85),
  manual("효율", "업무 매뉴얼 개정", "개정 완료 비율", "개정 완료 ÷ 대상 매뉴얼", 3, 78.8, 80, "남은 매뉴얼은 담당자별로 마감일을 정한다."),

  // ── 판정 보류: 진척률을 알 수 없는 지표 ──────────────────────────────
  numeric("효율", "목표 미확정 지표", "실적 수치", "목표 확정 후 평가", 3, { base: 10, target: 10, actual: 12 }, 80),
  numeric("영업", "신규 서비스 도입 준비", "준비 단계 수", "목표 확정 후 평가", 3, { base: 0, target: 0, actual: 0 }, 50),
  manual("고객", "정성 평가 지표", "정성 평가 결과", "평가 완료 후 점수 입력", 3, undefined, 70),
];
