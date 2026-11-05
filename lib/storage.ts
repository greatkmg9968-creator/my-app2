// Design Ref: §15 자동 저장 — 입력한 지표와 부점 이름을 이 컴퓨터의 브라우저(localStorage)에 저장하고 다시 읽는다.
// Plan SC: 작업 15 — 보관 방식: 내 컴퓨터에 자동 저장. 서버로는 아무것도 보내지 않는다.
//
// 저장소에서 읽은 값은 믿지 않고 입력 폼과 같은 규칙으로 다시 검사한다.
// (예전 버전이 저장한 값, 직접 고친 값, 깨진 값이 앱을 망가뜨리지 않게 하려는 것이다.)

import { validateIndicatorForm, type IndicatorFormValues } from "@/lib/indicatorForm";
import { sanitizeActions, sanitizeAttachments, sanitizeTasks } from "@/lib/records";
import { MAX_INDICATORS, MONTHS_IN_YEAR, type Indicator } from "@/types/indicator";

/** 브라우저 저장소에서 이 앱의 자료를 찾는 이름 */
export const STORAGE_KEY = "performance-dashboard-v1";

/** 저장하는 자료의 모양 버전. 모양이 바뀌면 올린다. */
export const STORAGE_VERSION = 1;

/** 저장하는 자료 */
export interface SavedState {
  version: typeof STORAGE_VERSION;
  /** 화면에 입력한 부점 이름 */
  branch: string;
  indicators: Indicator[];
}

/** 저장소에서 읽은 결과 */
export interface LoadedState {
  state: SavedState;
  /** 올바르지 않아 버린 지표 수 */
  dropped: number;
}

/** 자료를 저장소에 넣을 글자로 바꾼다. */
export function serializeState(state: { branch: string; indicators: Indicator[] }): string {
  const saved: SavedState = {
    version: STORAGE_VERSION,
    branch: state.branch,
    indicators: state.indicators,
  };
  return JSON.stringify(saved);
}

/** 저장소에서 읽은 값(알 수 없는 모양)을 글자로 바꾼다. 숫자는 글자로, 그 밖은 빈 글자 */
function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/**
 * 저장소에서 읽은 지표 한 건을 입력 폼과 같은 규칙으로 검사해 올바른 지표로 돌려준다. 올바르지 않으면 null
 * (보완사항 필수 검사는 자료 기준일에 따라 달라지므로 여기서는 하지 않는다)
 */
export function sanitizeIndicator(raw: unknown, branch: string): Indicator | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const monthlyRaw = Array.isArray(record.monthly) ? record.monthly : [];
  const values: IndicatorFormValues = {
    category: toText(record.category),
    name: toText(record.name),
    item: toText(record.item),
    method: toText(record.method),
    weight: toText(record.weight),
    baseValue: toText(record.baseValue),
    targetValue: toText(record.targetValue),
    actualValue: toText(record.actualValue),
    aggregation: toText(record.aggregation),
    monthly: Array.from({ length: MONTHS_IN_YEAR }, (_, index) => toText(monthlyRaw[index])),
    progress: toText(record.progress),
    expected: toText(record.expected),
    note: toText(record.note),
    evalDate: toText(record.evalDate),
  };

  const { indicator } = validateIndicatorForm(values, branch);
  if (!indicator) return null;

  const id = toText(record.id).slice(0, 100);
  const actions = sanitizeActions(record.actions);
  const tasks = sanitizeTasks(record.tasks);
  const attachments = sanitizeAttachments(record.attachments);
  return {
    ...indicator,
    ...(id !== "" ? { id } : {}),
    ...(actions.length > 0 ? { actions } : {}),
    ...(tasks.length > 0 ? { tasks } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

/**
 * 저장소에서 읽은 글자를 자료로 바꾼다.
 * 비어 있거나 읽을 수 없거나 모양 버전이 다르면 null (처음 쓰는 것처럼 시작한다)
 */
export function deserializeState(json: string | null): LoadedState | null {
  if (json === null || json === "") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (record.version !== STORAGE_VERSION) return null;

  const branch = toText(record.branch).trim();
  const rawList = Array.isArray(record.indicators) ? record.indicators : [];

  const indicators: Indicator[] = [];
  const seenNames = new Set<string>();
  let dropped = 0;
  for (const raw of rawList) {
    const indicator = sanitizeIndicator(raw, branch);
    const key = indicator?.name.trim().toLowerCase();
    // 올바르지 않은 지표, 최대 개수를 넘는 지표, 이름이 겹치는 지표는 버린다.
    if (!indicator || key === undefined || seenNames.has(key) || indicators.length >= MAX_INDICATORS) {
      dropped += 1;
      continue;
    }
    seenNames.add(key);
    indicators.push(indicator);
  }

  return { state: { version: STORAGE_VERSION, branch, indicators }, dropped };
}
