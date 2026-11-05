// Design Ref: §14 지표에 붙는 기록 — 개선조치 이력, 추진과제, 첨부파일 정보의 입력 검사와 보조 규칙.
// Plan SC: 작업 18(개선조치·추진과제), 작업 19(첨부파일)
//
// 화면의 입력 창, 엑셀 올리기, 브라우저 저장소에서 읽은 값이 모두 이 검사를 거친다.

import { isValidDateString } from "@/lib/calc";
import {
  ATTACHMENT_KINDS,
  WORK_STATUSES,
  type AttachmentKind,
  type AttachmentMeta,
  type ImprovementAction,
  type Indicator,
  type PromotionTask,
  type WorkStatus,
} from "@/types/indicator";

/** 글자 칸의 최대 길이 */
export const MAX_TEXT_LENGTH = 500;
export const MAX_SHORT_TEXT_LENGTH = 50;

/** 지표 하나에 붙일 수 있는 개선조치·추진과제·첨부파일의 최대 개수 */
export const MAX_ACTIONS_PER_INDICATOR = 100;
export const MAX_TASKS_PER_INDICATOR = 50;
export const MAX_ATTACHMENTS_PER_INDICATOR = 20;

/** 첨부파일 하나의 최대 크기(10MB)와 전체 최대 크기(200MB) */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 200 * 1024 * 1024;

export function isWorkStatus(value: string): value is WorkStatus {
  return (WORK_STATUSES as readonly string[]).includes(value);
}

export function isAttachmentKind(value: string): value is AttachmentKind {
  return (ATTACHMENT_KINDS as readonly string[]).includes(value);
}

/** 개선조치를 입력할 때의 값 (모두 글자) */
export interface ActionFormValues {
  date: string;
  content: string;
  owner: string;
  status: string;
  effect: string;
}

/** 추진과제를 입력할 때의 값 (모두 글자) */
export interface TaskFormValues {
  title: string;
  due: string;
  owner: string;
  status: string;
}

export type ActionFormErrors = Partial<Record<keyof ActionFormValues, string>>;
export type TaskFormErrors = Partial<Record<keyof TaskFormValues, string>>;

/** 글자 칸 하나를 검사한다. 앞뒤 공백을 지우고, 비었거나 너무 길면 오류 문구를 돌려준다. */
function checkText(
  value: string,
  label: string,
  max: number,
  required: boolean,
): { text: string; error?: string } {
  const text = value.trim();
  if (required && text === "") return { text, error: `${label}을(를) 입력해 주세요.` };
  if (text.length > max) return { text, error: `${label}은(는) ${max}자 이하로 적어 주세요.` };
  return { text };
}

export const emptyActionValues = (date = ""): ActionFormValues => ({
  date,
  content: "",
  owner: "",
  status: "예정",
  effect: "",
});

export const emptyTaskValues = (): TaskFormValues => ({ title: "", due: "", owner: "", status: "예정" });

/** 개선조치 입력을 검사해 개선조치 한 건으로 바꾼다. 오류가 있으면 action은 null */
export function validateAction(values: ActionFormValues): {
  errors: ActionFormErrors;
  action: ImprovementAction | null;
} {
  const errors: ActionFormErrors = {};
  if (!isValidDateString(values.date)) errors.date = "조치 날짜를 올바르게 선택해 주세요.";

  const content = checkText(values.content, "조치 내용", MAX_TEXT_LENGTH, true);
  if (content.error) errors.content = content.error;
  const owner = checkText(values.owner, "담당자", MAX_SHORT_TEXT_LENGTH, true);
  if (owner.error) errors.owner = owner.error;
  const effect = checkText(values.effect, "효과 메모", MAX_TEXT_LENGTH, false);
  if (effect.error) errors.effect = effect.error;
  if (!isWorkStatus(values.status)) errors.status = "진행 상태는 예정 / 진행 / 완료 중 하나여야 합니다.";

  if (Object.keys(errors).length > 0 || !isWorkStatus(values.status)) return { errors, action: null };
  return {
    errors,
    action: {
      date: values.date,
      content: content.text,
      owner: owner.text,
      status: values.status,
      ...(effect.text !== "" ? { effect: effect.text } : {}),
    },
  };
}

/** 추진과제 입력을 검사해 추진과제 한 건으로 바꾼다. 기한은 비워도 된다. 오류가 있으면 task는 null */
export function validateTask(values: TaskFormValues): {
  errors: TaskFormErrors;
  task: PromotionTask | null;
} {
  const errors: TaskFormErrors = {};
  const title = checkText(values.title, "과제명", MAX_TEXT_LENGTH, true);
  if (title.error) errors.title = title.error;
  const owner = checkText(values.owner, "담당자", MAX_SHORT_TEXT_LENGTH, true);
  if (owner.error) errors.owner = owner.error;
  const due = values.due.trim();
  if (due !== "" && !isValidDateString(due)) errors.due = "기한을 올바른 날짜로 선택해 주세요.";
  if (!isWorkStatus(values.status)) errors.status = "진행 상태는 예정 / 진행 / 완료 중 하나여야 합니다.";

  if (Object.keys(errors).length > 0 || !isWorkStatus(values.status)) return { errors, task: null };
  return {
    errors,
    task: {
      title: title.text,
      owner: owner.text,
      status: values.status,
      ...(due !== "" ? { due } : {}),
    },
  };
}

/** 글자가 아닌 값(브라우저 저장소에서 읽은 값 등)을 글자로 바꾼다. 글자가 아니면 빈 글자 */
function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 저장소·엑셀에서 읽은 개선조치 목록을 걸러서 올바른 것만 돌려준다. */
export function sanitizeActions(raw: unknown): ImprovementAction[] {
  if (!Array.isArray(raw)) return [];
  const result: ImprovementAction[] = [];
  for (const item of raw.slice(0, MAX_ACTIONS_PER_INDICATOR)) {
    const record = (item ?? {}) as Record<string, unknown>;
    const { action } = validateAction({
      date: asText(record.date),
      content: asText(record.content),
      owner: asText(record.owner),
      status: asText(record.status),
      effect: asText(record.effect),
    });
    if (action) result.push(action);
  }
  return result;
}

/** 저장소·엑셀에서 읽은 추진과제 목록을 걸러서 올바른 것만 돌려준다. */
export function sanitizeTasks(raw: unknown): PromotionTask[] {
  if (!Array.isArray(raw)) return [];
  const result: PromotionTask[] = [];
  for (const item of raw.slice(0, MAX_TASKS_PER_INDICATOR)) {
    const record = (item ?? {}) as Record<string, unknown>;
    const { task } = validateTask({
      title: asText(record.title),
      due: asText(record.due),
      owner: asText(record.owner),
      status: asText(record.status),
    });
    if (task) result.push(task);
  }
  return result;
}

/** 저장소에서 읽은 첨부파일 정보를 걸러서 올바른 것만 돌려준다. */
export function sanitizeAttachments(raw: unknown): AttachmentMeta[] {
  if (!Array.isArray(raw)) return [];
  const result: AttachmentMeta[] = [];
  for (const item of raw.slice(0, MAX_ATTACHMENTS_PER_INDICATOR)) {
    const record = (item ?? {}) as Record<string, unknown>;
    const id = asText(record.id);
    const name = asText(record.name);
    const kind = asText(record.kind);
    const size = typeof record.size === "number" ? record.size : Number.NaN;
    if (id === "" || name === "" || !isAttachmentKind(kind)) continue;
    if (!Number.isFinite(size) || size < 0 || size > MAX_ATTACHMENT_BYTES) continue;
    result.push({
      id,
      kind,
      name: name.slice(0, 200),
      size,
      type: asText(record.type).slice(0, 100),
      addedAt: asText(record.addedAt),
    });
  }
  return result;
}

/** 올리려는 파일이 크기·개수 제한에 걸리는지 확인한다. 통과하면 null, 아니면 안내 문구 */
export function checkAttachmentFile(
  file: { name: string; size: number },
  current: { countInIndicator: number; totalBytes: number },
): string | null {
  if (file.size === 0) return `"${file.name}"은(는) 빈 파일이라 올릴 수 없습니다.`;
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `"${file.name}"은(는) 파일 하나당 최대 10MB를 넘어 올릴 수 없습니다.`;
  }
  if (current.countInIndicator >= MAX_ATTACHMENTS_PER_INDICATOR) {
    return `한 지표에는 파일을 최대 ${MAX_ATTACHMENTS_PER_INDICATOR}개까지 올릴 수 있습니다.`;
  }
  if (current.totalBytes + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
    return "저장된 파일의 전체 크기가 200MB를 넘게 됩니다. 필요 없는 파일을 삭제한 뒤 올려 주세요.";
  }
  return null;
}

/** 모든 지표의 첨부파일 크기 합계(바이트) */
export function totalAttachmentBytes(indicators: readonly Indicator[]): number {
  return indicators.reduce(
    (sum, indicator) => sum + (indicator.attachments ?? []).reduce((s, file) => s + file.size, 0),
    0,
  );
}

/** 같은 이름의 지표가 둘 이상이면 그 이름들을 돌려준다. (대소문자·앞뒤 공백은 같은 이름으로 본다) */
export function findDuplicateNames(names: readonly string[]): string[] {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (seen.has(key)) duplicates.add(seen.get(key) as string);
    else seen.set(key, name.trim());
  }
  return [...duplicates];
}

/** 지표 번호를 새로 만든다. */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 번호가 없는 지표에만 새 번호를 붙인다. (번호가 같은 지표가 둘이면 뒤쪽에 새 번호를 준다) */
export function ensureIds(indicators: readonly Indicator[], makeId: () => string = newId): Indicator[] {
  const used = new Set<string>();
  return indicators.map((indicator) => {
    let id = indicator.id;
    if (id === undefined || id === "" || used.has(id)) id = makeId();
    used.add(id);
    return id === indicator.id ? indicator : { ...indicator, id };
  });
}

/**
 * 엑셀로 지표 목록을 통째로 바꿀 때, 첨부파일 정보와 번호를 이어 준다.
 * 같은 번호(없으면 같은 이름)의 이전 지표가 있으면 그 지표의 번호와 첨부파일 정보를 새 지표에 옮긴다.
 * (엑셀에는 파일 자체가 없으므로, 이렇게 하지 않으면 올릴 때마다 첨부파일이 지표에서 떨어져 나간다)
 */
export function carryOverAttachments(
  next: readonly Indicator[],
  previous: readonly Indicator[],
): Indicator[] {
  const byId = new Map(previous.filter((p) => p.id).map((p) => [p.id as string, p]));
  const byName = new Map(previous.map((p) => [p.name.trim().toLowerCase(), p]));
  return next.map((indicator) => {
    const match =
      (indicator.id ? byId.get(indicator.id) : undefined) ?? byName.get(indicator.name.trim().toLowerCase());
    if (!match) return indicator;
    return {
      ...indicator,
      id: match.id ?? indicator.id,
      ...(match.attachments && match.attachments.length > 0 ? { attachments: match.attachments } : {}),
    };
  });
}

/** 목록에서 사라진 지표들의 첨부파일 번호(저장소에서 지워야 할 파일)를 모은다. */
export function orphanedAttachmentIds(
  before: readonly Indicator[],
  after: readonly Indicator[],
): string[] {
  const kept = new Set(after.flatMap((i) => (i.attachments ?? []).map((a) => a.id)));
  return before.flatMap((i) => (i.attachments ?? []).map((a) => a.id)).filter((id) => !kept.has(id));
}
