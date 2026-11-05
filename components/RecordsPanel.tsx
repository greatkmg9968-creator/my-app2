"use client";

// Design Ref: §14 지표에 붙는 기록 — 개선조치 이력과 추진과제를 지표 세부 화면에서 추가·수정·삭제한다.
// Plan SC: 작업 18 — 부진지표 개선조치 이력 관리, 각 지표별 추진과제
//
// 목록은 이 컴포넌트가 직접 저장하지 않고, 바뀐 목록을 onChange로 위(지표 세부 화면)에 넘긴다.

import { useId, useState } from "react";
import {
  MAX_ACTIONS_PER_INDICATOR,
  MAX_TASKS_PER_INDICATOR,
  emptyActionValues,
  emptyTaskValues,
  validateAction,
  validateTask,
  type ActionFormErrors,
  type ActionFormValues,
  type TaskFormErrors,
  type TaskFormValues,
} from "@/lib/records";
import {
  WORK_STATUSES,
  type ImprovementAction,
  type PromotionTask,
  type WorkStatus,
} from "@/types/indicator";

const INPUT_CLASS =
  "field w-full text-sm";
const SMALL_BUTTON =
  "btn btn-sm";
const PRIMARY_BUTTON =
  "btn btn-primary";

/** 진행 상태별 표시 색 */
const STATUS_TONE: Record<WorkStatus, string> = {
  예정: "bg-white/10 text-gray-300",
  진행: "bg-sky-400/15 text-sky-200",
  완료: "bg-emerald-400/15 text-emerald-200",
};

/** 목록에서 바로 진행 상태를 바꾸는 선택 상자 */
function StatusSelect({
  value,
  label,
  onChange,
}: {
  value: WorkStatus;
  label: string;
  onChange: (status: WorkStatus) => void;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value as WorkStatus)}
      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_TONE[value]}`}
    >
      {WORK_STATUSES.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  );
}

/** 라벨과 입력칸, 오류 문구를 묶는다. */
function FormField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 개선조치 이력
// ─────────────────────────────────────────────────────────────────────────────

interface ActionsPanelProps {
  actions: ImprovementAction[];
  /** 새 조치의 날짜 기본값 (화면의 자료 기준일) */
  defaultDate: string;
  onChange: (next: ImprovementAction[]) => void;
}

export function ActionsPanel({ actions, defaultDate, onChange }: ActionsPanelProps) {
  const baseId = useId();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [values, setValues] = useState<ActionFormValues>(emptyActionValues(defaultDate));
  const [errors, setErrors] = useState<ActionFormErrors>({});

  const open = (target: number | "new") => {
    setValues(target === "new" ? emptyActionValues(defaultDate) : { ...emptyActionValues(), ...toActionValues(actions[target]) });
    setErrors({});
    setEditing(target);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = validateAction(values);
    setErrors(result.errors);
    if (!result.action) return;
    onChange(
      editing === "new" || editing === null
        ? [...actions, result.action]
        : actions.map((item, index) => (index === editing ? (result.action as ImprovementAction) : item)),
    );
    setEditing(null);
  };

  // 날짜 순으로 보여주되, 수정·삭제는 원래 목록의 위치(index)로 한다.
  const sorted = actions
    .map((action, index) => ({ action, index }))
    .sort((a, b) => a.action.date.localeCompare(b.action.date));

  const field = (key: keyof ActionFormValues) => ({
    id: `${baseId}-${key}`,
    value: values[key],
    onChange: (event: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [key]: event.target.value })),
    "aria-invalid": errors[key] ? (true as const) : undefined,
    "aria-describedby": errors[key] ? `${baseId}-${key}-error` : undefined,
    className: INPUT_CLASS,
  });

  return (
    <div data-testid="actions-panel">
      {sorted.length === 0 ? (
        <p className="text-sm text-foreground/70">기록된 개선조치가 없습니다.</p>
      ) : (
        <ol className="space-y-2">
          {sorted.map(({ action, index }) => (
            <li
              key={index}
              className="rounded-2xl border border-white/10 bg-white/[.03] p-3 text-sm"
              data-testid="action-item"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium tabular-nums">{action.date}</span>
                <span className="flex items-center gap-2">
                  <StatusSelect
                    value={action.status}
                    label={`${action.date} 개선조치 진행 상태`}
                    onChange={(status) =>
                      onChange(actions.map((item, i) => (i === index ? { ...item, status } : item)))
                    }
                  />
                  <button type="button" className={SMALL_BUTTON} onClick={() => open(index)}>
                    수정
                  </button>
                  <button
                    type="button"
                    className={SMALL_BUTTON}
                    onClick={() => {
                      if (window.confirm("이 개선조치를 삭제할까요?")) {
                        onChange(actions.filter((_, i) => i !== index));
                      }
                    }}
                  >
                    삭제
                  </button>
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap">{action.content}</p>
              <p className="mt-1 text-xs text-foreground/70">
                담당: {action.owner}
                {action.effect ? ` · 효과: ${action.effect}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}

      {editing === null ? (
        <button
          type="button"
          className={`${PRIMARY_BUTTON} mt-3`}
          onClick={() => open("new")}
          disabled={actions.length >= MAX_ACTIONS_PER_INDICATOR}
        >
          개선조치 추가
        </button>
      ) : (
        <form
          onSubmit={submit}
          noValidate
          className="mt-3 grid gap-3 rounded-2xl border border-white/15 bg-white/[.03] p-3 sm:grid-cols-2"
          aria-label={editing === "new" ? "개선조치 추가" : "개선조치 수정"}
        >
          <FormField id={`${baseId}-date`} label="조치 날짜" error={errors.date}>
            <input type="date" {...field("date")} />
          </FormField>
          <FormField id={`${baseId}-owner`} label="담당자" error={errors.owner}>
            <input type="text" {...field("owner")} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField id={`${baseId}-content`} label="조치 내용" error={errors.content}>
              <textarea rows={2} {...field("content")} />
            </FormField>
          </div>
          <FormField id={`${baseId}-status`} label="진행 상태" error={errors.status}>
            <select {...field("status")}>
              {WORK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id={`${baseId}-effect`} label="효과 메모 (선택)" error={errors.effect}>
            <input type="text" {...field("effect")} />
          </FormField>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className={PRIMARY_BUTTON}>
              {editing === "new" ? "추가" : "수정 저장"}
            </button>
            <button type="button" className={SMALL_BUTTON} onClick={() => setEditing(null)}>
              취소
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function toActionValues(action: ImprovementAction): ActionFormValues {
  return {
    date: action.date,
    content: action.content,
    owner: action.owner,
    status: action.status,
    effect: action.effect ?? "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 추진과제
// ─────────────────────────────────────────────────────────────────────────────

interface TasksPanelProps {
  tasks: PromotionTask[];
  onChange: (next: PromotionTask[]) => void;
}

function toTaskValues(task: PromotionTask): TaskFormValues {
  return { title: task.title, due: task.due ?? "", owner: task.owner, status: task.status };
}

export function TasksPanel({ tasks, onChange }: TasksPanelProps) {
  const baseId = useId();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [values, setValues] = useState<TaskFormValues>(emptyTaskValues());
  const [errors, setErrors] = useState<TaskFormErrors>({});

  const open = (target: number | "new") => {
    setValues(target === "new" ? emptyTaskValues() : toTaskValues(tasks[target]));
    setErrors({});
    setEditing(target);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = validateTask(values);
    setErrors(result.errors);
    if (!result.task) return;
    onChange(
      editing === "new" || editing === null
        ? [...tasks, result.task]
        : tasks.map((item, index) => (index === editing ? (result.task as PromotionTask) : item)),
    );
    setEditing(null);
  };

  const field = (key: keyof TaskFormValues) => ({
    id: `${baseId}-${key}`,
    value: values[key],
    onChange: (event: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [key]: event.target.value })),
    "aria-invalid": errors[key] ? (true as const) : undefined,
    "aria-describedby": errors[key] ? `${baseId}-${key}-error` : undefined,
    className: INPUT_CLASS,
  });

  return (
    <div data-testid="tasks-panel">
      {tasks.length === 0 ? (
        <p className="text-sm text-foreground/70">등록된 추진과제가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task, index) => (
            <li
              key={index}
              className="rounded-2xl border border-white/10 bg-white/[.03] p-3 text-sm"
              data-testid="task-item"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{task.title}</span>
                <span className="flex items-center gap-2">
                  <StatusSelect
                    value={task.status}
                    label={`${task.title} 추진과제 진행 상태`}
                    onChange={(status) =>
                      onChange(tasks.map((item, i) => (i === index ? { ...item, status } : item)))
                    }
                  />
                  <button type="button" className={SMALL_BUTTON} onClick={() => open(index)}>
                    수정
                  </button>
                  <button
                    type="button"
                    className={SMALL_BUTTON}
                    onClick={() => {
                      if (window.confirm(`추진과제 "${task.title}"을(를) 삭제할까요?`)) {
                        onChange(tasks.filter((_, i) => i !== index));
                      }
                    }}
                  >
                    삭제
                  </button>
                </span>
              </div>
              <p className="mt-1 text-xs text-foreground/70">
                담당: {task.owner}
                {task.due ? ` · 기한: ${task.due}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      {editing === null ? (
        <button
          type="button"
          className={`${PRIMARY_BUTTON} mt-3`}
          onClick={() => open("new")}
          disabled={tasks.length >= MAX_TASKS_PER_INDICATOR}
        >
          추진과제 추가
        </button>
      ) : (
        <form
          onSubmit={submit}
          noValidate
          className="mt-3 grid gap-3 rounded-2xl border border-white/15 bg-white/[.03] p-3 sm:grid-cols-2"
          aria-label={editing === "new" ? "추진과제 추가" : "추진과제 수정"}
        >
          <div className="sm:col-span-2">
            <FormField id={`${baseId}-title`} label="과제명" error={errors.title}>
              <input type="text" {...field("title")} />
            </FormField>
          </div>
          <FormField id={`${baseId}-owner`} label="담당자" error={errors.owner}>
            <input type="text" {...field("owner")} />
          </FormField>
          <FormField id={`${baseId}-due`} label="기한 (선택)" error={errors.due}>
            <input type="date" {...field("due")} />
          </FormField>
          <FormField id={`${baseId}-status`} label="진행 상태" error={errors.status}>
            <select {...field("status")}>
              {WORK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </FormField>
          <div className="flex items-end gap-2">
            <button type="submit" className={PRIMARY_BUTTON}>
              {editing === "new" ? "추가" : "수정 저장"}
            </button>
            <button type="button" className={SMALL_BUTTON} onClick={() => setEditing(null)}>
              취소
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
