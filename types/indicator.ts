// Design Ref: §3.1 — 지표 한 건의 구조. 계산·검사·화면이 모두 이 타입을 기준으로 동작한다.
// Plan SC: 작업 1 — 지표 한 건의 데이터 구조(타입) 정의
// Plan SC: 작업 15 — 월별 실적(집계 방식), 개선조치 이력, 추진과제, 첨부파일 정보를 지표에 붙인다.

/**
 * 지표 구분(큰 범주) 네 가지.
 * - 부점/공통: 부점이 자체로 정한 지표인지, 모든 부점에 공통으로 적용되는 지표인지
 * - 계량/비계량: 수치(기준값·목표값·실적값)로 평가하는지, 수치로 나타낼 수 없어 진척률을 직접 입력하는지
 */
export const INDICATOR_CATEGORIES = [
  "부점 계량",
  "부점 비계량",
  "공통 계량",
  "공통 비계량",
] as const;

/** 한 화면에서 다룰 수 있는 지표의 최대 개수 */
export const MAX_INDICATORS = 30;

/** 지표 구분 하나 */
export type IndicatorCategory = (typeof INDICATOR_CATEGORIES)[number];

/** 계량 지표(수치로 평가)면 true, 비계량 지표(진척률 직접 입력)면 false */
export function isQuantitativeCategory(category: IndicatorCategory): boolean {
  return category === "부점 계량" || category === "공통 계량";
}

/** 문자열이 올바른 지표 구분이면 true (엑셀 업로드 등 바깥에서 들어온 값을 검사할 때 쓴다) */
export function isIndicatorCategory(value: string): value is IndicatorCategory {
  return (INDICATOR_CATEGORIES as readonly string[]).includes(value);
}

/**
 * 계량 지표의 집계 방식. 월별 실적(그 달 실적)에서 "현재 실적"을 어떻게 구할지 정한다.
 * - cumulative(누적): 월별 실적을 더한다. (신규 고객 수, 판매액처럼 쌓이는 지표)
 * - latest(월말 값): 가장 최근 달의 값을 그대로 쓴다. (잔액, 연체율처럼 그 시점의 수준을 보는 지표)
 */
export type AggregationMode = "cumulative" | "latest";

/** 집계 방식을 화면과 엑셀에 적는 이름 */
export const AGGREGATION_LABELS: Record<AggregationMode, string> = {
  cumulative: "누적",
  latest: "월말값",
};

/** 집계 방식을 따로 정하지 않았을 때의 기본값 */
export const DEFAULT_AGGREGATION: AggregationMode = "cumulative";

/** 월별 실적의 개월 수 */
export const MONTHS_IN_YEAR = 12;

/** 개선조치·추진과제의 진행 상태 */
export const WORK_STATUSES = ["예정", "진행", "완료"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

/** 개선조치 한 건. 부진지표를 끌어올리기 위해 한 일의 기록이다. */
export interface ImprovementAction {
  /** 조치한 날짜 "YYYY-MM-DD" */
  date: string;
  /** 조치 내용 */
  content: string;
  /** 담당자 */
  owner: string;
  /** 진행 상태 */
  status: WorkStatus;
  /** 효과 메모 (선택) */
  effect?: string;
}

/** 추진과제 한 건. 지표 달성을 위해 추진하는 일이다. */
export interface PromotionTask {
  /** 과제명 */
  title: string;
  /** 기한 "YYYY-MM-DD" (선택) */
  due?: string;
  /** 담당자 */
  owner: string;
  /** 진행 상태 */
  status: WorkStatus;
}

/** 첨부파일의 종류 */
export const ATTACHMENT_KINDS = ["추진과제", "실적자료"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/**
 * 첨부파일 정보. 파일 내용은 이 컴퓨터의 브라우저 저장소(IndexedDB)에 id로 따로 보관하고,
 * 지표에는 이름·크기 같은 정보만 둔다.
 */
export interface AttachmentMeta {
  /** 파일 내용을 찾는 번호 */
  id: string;
  kind: AttachmentKind;
  /** 파일 이름 (예: 3분기_실적.pdf) */
  name: string;
  /** 파일 크기(바이트) */
  size: number;
  /** 파일 형식(MIME). 모르면 빈 글자 */
  type: string;
  /** 올린 시각 (ISO 글자) */
  addedAt: string;
}

/**
 * 성과평가 지표 한 건.
 *
 * - 지표 데이터는 이 컴퓨터의 브라우저에 자동 저장하고, 서버로는 보내지 않는다.
 * - 날짜는 "YYYY-MM-DD" 형식의 문자열로 적는다. (예: "2026-10-15")
 * - 퍼센트 값(진척률, 예상달성도)은 0~200 사이 숫자다. (100 = 목표 100% 달성)
 */
export interface Indicator {
  /**
   * 지표 번호. 첨부파일을 이 지표에 연결하는 데 쓴다. 화면에서 지표를 만들 때 붙고,
   * 엑셀로 내보냈다 올려도 "지표ID" 열로 유지된다. (없으면 올릴 때 새로 붙는다)
   */
  id?: string;

  /** 부점. 화면 위쪽 기준 정보에 입력한 부점 이름이 자동으로 들어간다. (엑셀로 올릴 때는 이 이름과 같아야 한다) */
  branch: string;

  /** 지표 구분(큰 범주): 부점 계량 / 부점 비계량 / 공통 계량 / 공통 비계량. */
  category: IndicatorCategory;

  /** 지표명. 같은 화면 안에서 겹치지 않아야 한다. (엑셀의 월별실적·개선조치·추진과제 시트가 이 이름으로 지표를 찾는다) */
  name: string;

  /** 세부 평가항목. 지표 구분 안에서 담당자가 직접 입력한다. */
  item: string;

  /** 평가방법 */
  method: string;

  /** 배점 */
  weight: number;

  /** 기준값(시작값). 수치 지표에만 있다. */
  baseValue?: number;

  /** 목표값. 수치 지표에만 있다. */
  targetValue?: number;

  /**
   * 실적값. 수치 지표에만 있다.
   * 월별 실적(monthly)을 입력했으면 쓰지 않고, 월별 실적에서 자료 기준일까지의 값을 자동으로 구한다.
   */
  actualValue?: number;

  /** 집계 방식(계량 지표). 월별 실적에서 현재 실적을 구하는 방법. 없으면 누적이다. */
  aggregation?: AggregationMode;

  /**
   * 월별 실적(계량 지표). 1~12월의 "그 달 실적" 12칸이고, 입력하지 않은 달은 null이다.
   * 누적이면 앱이 월별 누적을 자동으로 계산해서 보여준다.
   */
  monthly?: (number | null)[];

  /**
   * 진척률(%).
   * 수치 지표는 항상 기준값·목표값·실적값으로 자동 계산하고,
   * 수치로 나타낼 수 없는 지표(또는 목표값 = 기준값인 지표)만 직접 입력한다.
   * 직접 입력값은 0~200이어야 한다.
   */
  progress?: number;

  /** 예상달성도(%). 필수이며 담당자가 입력한다. 0~200. */
  expected: number;

  /** 보완사항. 부진지표에는 필수다. */
  note?: string;

  /**
   * 평가 기준일. 실적을 집계한 날짜를 적는 표기용이다.
   * 부진 판정에는 쓰지 않고, 판정은 화면의 "자료 기준일"로만 한다.
   */
  evalDate: string;

  /** 개선조치 이력 (오래된 것부터 입력 순서대로) */
  actions?: ImprovementAction[];

  /** 추진과제 */
  tasks?: PromotionTask[];

  /** 첨부파일 정보 (파일 내용은 브라우저 저장소에 따로 있다) */
  attachments?: AttachmentMeta[];
}
