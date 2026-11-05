"use client";

// Design Ref: §2.3 지표 입력 창 — "지표 추가"·"수정"을 누르면 뜨는 창.
// Plan SC: 작업 9 — 지표 직접 입력 폼. 지표 구분(부점 계량 / 부점 비계량 / 공통 계량 / 공통 비계량)을 고른 뒤
//          그 안의 세부 평가항목을 직접 입력한다. 계량은 수치 칸, 비계량은 진척률 칸을 보여준다.
// Plan SC: 작업 10 — 부진지표인데 보완사항이 비어 있으면 저장 버튼이 눌리지 않고 이유를 안내한다.
// Plan SC: 작업 15·17 — 계량 지표는 집계 방식(누적 / 월말값)과 월별 실적(그 달 실적 12칸)을 입력할 수 있다.
//          월별 실적을 입력하면 실적값은 비워도 되고, 자료 기준일이 속한 달까지의 값으로 현재 실적을 자동 계산한다.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { monthOfDate } from "@/lib/calc";
import { formatNumber, formatPercent } from "@/lib/format";
import {
  actualFromValues,
  checkNoteRequired,
  emptyFormValues,
  needsDirectProgress,
  parseNumber,
  progressFromValues,
  validateIndicatorForm,
  valuesFromIndicator,
  type IndicatorFormErrors,
  type IndicatorFormValues,
} from "@/lib/indicatorForm";
import {
  AGGREGATION_LABELS,
  INDICATOR_CATEGORIES,
  MONTHS_IN_YEAR,
  isIndicatorCategory,
  isQuantitativeCategory,
  type Indicator,
} from "@/types/indicator";

interface IndicatorFormProps {
  /** 화면에 입력한 부점 이름. 입력칸 없이 자동으로 넣는다. */
  branch: string;
  /** 수정할 지표. 없으면 새 지표를 추가한다. */
  initial?: Indicator;
  /**
   * 화면의 자료 기준일. 새 지표의 평가 기준일 기본값이 되고,
   * 이 날짜의 경과율로 부진지표 여부(= 보완사항 필수 여부)를 판단한다.
   */
  referenceDate: string;
  /** 이미 있는 다른 지표들의 이름. 같은 이름으로는 저장할 수 없다. (수정할 때는 자기 자신의 이름을 뺀다) */
  otherNames: readonly string[];
  /** 검사를 통과한 지표를 넘겨준다. (번호·개선조치·추진과제·첨부파일 정보는 이 폼이 다루지 않으므로 없다) */
  onSubmit: (indicator: Indicator) => void;
  /** 취소하거나 Esc를 눌렀을 때 */
  onCancel: () => void;
}

const INPUT_CLASS =
  "field w-full text-sm";

/** 라벨 + 입력칸 + 안내 + 오류 문구를 묶는 칸 */
function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-foreground/70">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export default function IndicatorForm({
  branch,
  initial,
  referenceDate,
  otherNames,
  onSubmit,
  onCancel,
}: IndicatorFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const baseId = useId();
  const [values, setValues] = useState<IndicatorFormValues>(() =>
    initial ? valuesFromIndicator(initial) : emptyFormValues(referenceDate),
  );
  const [errors, setErrors] = useState<IndicatorFormErrors>({});

  // 창이 처음 뜰 때 화면 전체를 가리는 모달 창으로 연다. (Esc로 닫을 수 있고, 뒤쪽 화면은 눌리지 않는다)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const set =
    (key: keyof IndicatorFormValues) =>
    (event: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [key]: event.target.value }));

  const category = isIndicatorCategory(values.category) ? values.category : null;
  const quantitative = category !== null && isQuantitativeCategory(category);
  const directProgress = needsDirectProgress(values);

  // 계량 지표는 기준·목표·현재 실적(월별 실적에서 구한 값 포함)이 있으면 진척률을 미리 계산해서 보여준다.
  const currentActual = actualFromValues(values, referenceDate);
  const previewProgress = directProgress ? null : progressFromValues(values, referenceDate);
  const hasMonthly = values.monthly.some((text) => text.trim() !== "");
  const referenceMonth = (() => {
    try {
      return monthOfDate(referenceDate);
    } catch {
      return null;
    }
  })();

  // 부진지표인데 보완사항이 비어 있으면 저장할 수 없다. (입력하는 동안 바로 판단해서 보여준다)
  const noteCheck = checkNoteRequired(values, referenceDate);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateIndicatorForm(values, branch, referenceDate, { otherNames });
    setErrors(result.errors);
    if (result.indicator) {
      onSubmit(result.indicator);
      return;
    }
    // 첫 번째 오류 칸으로 이동해 바로 고칠 수 있게 한다.
    requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
    });
  };

  const ids = {
    name: `${baseId}-name`,
    item: `${baseId}-item`,
    method: `${baseId}-method`,
    weight: `${baseId}-weight`,
    baseValue: `${baseId}-base`,
    targetValue: `${baseId}-target`,
    actualValue: `${baseId}-actual`,
    aggregation: `${baseId}-aggregation`,
    monthly: `${baseId}-monthly`,
    progress: `${baseId}-progress`,
    expected: `${baseId}-expected`,
    evalDate: `${baseId}-evaldate`,
    note: `${baseId}-note`,
  };

  /** 월별 실적 한 칸을 바꾼다. */
  const setMonth = (index: number, text: string) =>
    setValues((current) => ({
      ...current,
      monthly: current.monthly.map((old, i) => (i === index ? text : old)),
    }));

  /** 오류가 있는 칸에 붙이는 접근성 속성 */
  const invalid = (key: keyof IndicatorFormValues, id: string) => ({
    "aria-invalid": errors[key] ? (true as const) : undefined,
    "aria-describedby": errors[key] ? `${id}-error` : undefined,
  });

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${baseId}-title`}
      onCancel={(event) => {
        // Esc를 누르면 브라우저가 창을 닫기 전에 우리 쪽에서 먼저 정리한다.
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(42rem,calc(100vw-2rem))] glass-dialog p-0 text-foreground"
    >
      <form onSubmit={handleSubmit} noValidate className="flex max-h-[90vh] flex-col">
        <header className="border-b border-white/10 px-5 py-3">
          <h2 id={`${baseId}-title`} className="text-base font-semibold">
            {initial ? "지표 수정" : "지표 추가"}
          </h2>
          <p className="mt-1 text-xs text-foreground/70">
            부점: <span className="font-medium text-foreground">{branch}</span> (화면 위쪽에 입력한 부점 이름이 자동으로 들어갑니다)
          </p>
        </header>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
          {/* 지표 구분: 큰 범주 네 가지 */}
          <fieldset
            className="flex flex-col gap-2"
            aria-invalid={errors.category ? true : undefined}
            aria-describedby={errors.category ? `${baseId}-category-error` : undefined}
          >
            <legend className="mb-1 text-sm font-medium">지표 구분</legend>
            <div className="grid grid-cols-2 gap-2">
              {INDICATOR_CATEGORIES.map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/20 px-3 py-2 text-sm hover:border-white/40 has-[:checked]:border-sky-300 has-[:checked]:bg-sky-300/10"
                >
                  <input
                    type="radio"
                    name={`${baseId}-category`}
                    value={option}
                    checked={values.category === option}
                    onChange={set("category")}
                  />
                  {option}
                </label>
              ))}
            </div>
            <p className="text-xs text-foreground/70">
              계량은 수치(기준값·목표값·실적값)로 평가하고, 비계량은 수치로 나타낼 수 없어 진척률을 직접 입력합니다.
            </p>
            {errors.category && (
              <p
                id={`${baseId}-category-error`}
                role="alert"
                className="text-xs text-red-400"
              >
                {errors.category}
              </p>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={ids.name} label="지표명" error={errors.name} className="sm:col-span-2">
              <input
                id={ids.name}
                type="text"
                value={values.name}
                onChange={set("name")}
                className={INPUT_CLASS}
                {...invalid("name", ids.name)}
              />
            </Field>

            <Field
              id={ids.item}
              label="세부 평가항목"
              hint={category ? `${category} 지표의 세부 평가항목을 직접 입력합니다.` : "선택한 지표 구분 안에서 직접 입력합니다."}
              error={errors.item}
              className="sm:col-span-2"
            >
              <input
                id={ids.item}
                type="text"
                value={values.item}
                onChange={set("item")}
                className={INPUT_CLASS}
                {...invalid("item", ids.item)}
              />
            </Field>

            <Field id={ids.method} label="평가방법" error={errors.method} className="sm:col-span-2">
              <input
                id={ids.method}
                type="text"
                value={values.method}
                onChange={set("method")}
                className={INPUT_CLASS}
                {...invalid("method", ids.method)}
              />
            </Field>

            <Field id={ids.weight} label="배점" error={errors.weight}>
              <input
                id={ids.weight}
                type="text"
                inputMode="decimal"
                value={values.weight}
                onChange={set("weight")}
                className={INPUT_CLASS}
                {...invalid("weight", ids.weight)}
              />
            </Field>

            <Field
              id={ids.evalDate}
              label="평가 기준일"
              hint="실적을 집계한 날짜입니다. 부진 판정에는 쓰지 않습니다."
              error={errors.evalDate}
            >
              <input
                id={ids.evalDate}
                type="date"
                value={values.evalDate}
                onChange={set("evalDate")}
                className={INPUT_CLASS}
                {...invalid("evalDate", ids.evalDate)}
              />
            </Field>
          </div>

          {/* 계량: 수치 칸 */}
          {quantitative && (
            <section aria-label="수치 입력" className="grid gap-4 sm:grid-cols-3">
              <Field id={ids.baseValue} label="기준값(시작값)" error={errors.baseValue}>
                <input
                  id={ids.baseValue}
                  type="text"
                  inputMode="decimal"
                  value={values.baseValue}
                  onChange={set("baseValue")}
                  className={INPUT_CLASS}
                  {...invalid("baseValue", ids.baseValue)}
                />
              </Field>
              <Field id={ids.targetValue} label="목표값" error={errors.targetValue}>
                <input
                  id={ids.targetValue}
                  type="text"
                  inputMode="decimal"
                  value={values.targetValue}
                  onChange={set("targetValue")}
                  className={INPUT_CLASS}
                  {...invalid("targetValue", ids.targetValue)}
                />
              </Field>
              <Field
                id={ids.actualValue}
                label="실적값"
                hint={hasMonthly ? "월별 실적을 입력했으면 비워도 됩니다." : undefined}
                error={errors.actualValue}
              >
                <input
                  id={ids.actualValue}
                  type="text"
                  inputMode="decimal"
                  value={values.actualValue}
                  onChange={set("actualValue")}
                  className={INPUT_CLASS}
                  {...invalid("actualValue", ids.actualValue)}
                />
              </Field>

              <p className="text-sm sm:col-span-3" data-testid="progress-preview">
                {hasMonthly && currentActual !== null && (
                  <span className="mr-4" data-testid="actual-preview">
                    <span className="text-foreground/70">
                      현재 실적{referenceMonth !== null ? `(${referenceMonth}월까지)` : ""}:{" "}
                    </span>
                    <strong>{formatNumber(currentActual)}</strong>
                  </span>
                )}
                <span className="text-foreground/70">진척률(자동 계산): </span>
                <strong>
                  {directProgress
                    ? "목표값과 기준값이 같아 계산할 수 없습니다"
                    : previewProgress === null
                      ? "수치를 모두 입력하면 계산됩니다"
                      : formatPercent(previewProgress)}
                </strong>
              </p>

              {/* 집계 방식: 월별 실적에서 현재 실적을 어떻게 구할지 */}
              <Field
                id={ids.aggregation}
                label="집계 방식"
                hint={
                  values.aggregation === "latest"
                    ? "월말값: 입력한 달 중 가장 최근 달의 값을 현재 실적으로 씁니다. (잔액, 연체율처럼 그 시점의 수준을 보는 지표)"
                    : "누적: 월별 실적을 더해서 현재 실적을 구합니다. (신규 고객 수, 판매액처럼 쌓이는 지표)"
                }
                error={errors.aggregation}
                className="sm:col-span-3"
              >
                <select
                  id={ids.aggregation}
                  value={values.aggregation}
                  onChange={set("aggregation")}
                  className={INPUT_CLASS}
                  {...invalid("aggregation", ids.aggregation)}
                >
                  <option value="cumulative">{AGGREGATION_LABELS.cumulative} (월별 실적을 더함)</option>
                  <option value="latest">{AGGREGATION_LABELS.latest} (가장 최근 달의 값)</option>
                </select>
              </Field>

              {/* 월별 실적: 그 달 실적 12칸 (선택) */}
              <details className="sm:col-span-3" open={hasMonthly} data-testid="monthly-details">
                <summary className="cursor-pointer text-sm font-medium">
                  월별 실적 입력 (선택){hasMonthly ? " — 입력됨" : ""}
                </summary>
                <p className="mt-2 text-xs text-foreground/70">
                  각 달의 &quot;그 달 실적&quot;을 입력하면 월별 누적과 추이 그래프를 지표 세부 화면에서 볼 수 있고, 자료 기준일이
                  속한 달까지의 값으로 현재 실적이 자동 계산됩니다. 입력하지 않은 달은 비워 두세요.
                </p>
                <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4" role="group" aria-label="월별 실적">
                  {Array.from({ length: MONTHS_IN_YEAR }, (_, index) => {
                    const text = values.monthly[index] ?? "";
                    const bad = text.trim() !== "" && parseNumber(text) === null;
                    return (
                      <div key={index} className="flex flex-col gap-1">
                        <label htmlFor={`${ids.monthly}-${index}`} className="text-xs font-medium">
                          {index + 1}월
                        </label>
                        <input
                          id={`${ids.monthly}-${index}`}
                          type="text"
                          inputMode="decimal"
                          value={text}
                          onChange={(event) => setMonth(index, event.target.value)}
                          className={INPUT_CLASS}
                          aria-invalid={bad ? true : undefined}
                          aria-describedby={bad ? `${ids.monthly}-error` : undefined}
                        />
                      </div>
                    );
                  })}
                </div>
                {errors.monthly && (
                  <p id={`${ids.monthly}-error`} role="alert" className="mt-2 text-xs text-red-400">
                    {errors.monthly}
                  </p>
                )}
              </details>
            </section>
          )}

          {/* 비계량이거나, 계량이지만 목표값 = 기준값이라 자동 계산할 수 없을 때: 진척률 직접 입력 */}
          {directProgress && (
            <Field
              id={ids.progress}
              label="진척률(%) 직접 입력"
              hint="0~200 사이 숫자 (100 = 목표 100% 달성)"
              error={errors.progress}
            >
              <input
                id={ids.progress}
                type="text"
                inputMode="decimal"
                value={values.progress}
                onChange={set("progress")}
                className={INPUT_CLASS}
                {...invalid("progress", ids.progress)}
              />
            </Field>
          )}

          <Field
            id={ids.expected}
            label="예상달성도(%)"
            hint="0~200 사이 숫자 (100 = 목표 100% 달성)"
            error={errors.expected}
          >
            <input
              id={ids.expected}
              type="text"
              inputMode="decimal"
              value={values.expected}
              onChange={set("expected")}
              className={INPUT_CLASS}
              {...invalid("expected", ids.expected)}
            />
          </Field>

          <Field
            id={ids.note}
            label={noteCheck.required ? "보완사항 (필수)" : "보완사항"}
            hint={
              noteCheck.required
                ? undefined
                : "정상 지표는 비워 둘 수 있습니다. 부진지표(진척률이 경과율보다 낮은 지표)는 반드시 적어야 합니다."
            }
            error={noteCheck.message ?? undefined}
          >
            <textarea
              id={ids.note}
              rows={3}
              value={values.note}
              onChange={set("note")}
              className={INPUT_CLASS}
              aria-invalid={noteCheck.required ? true : undefined}
              aria-describedby={noteCheck.required ? `${ids.note}-error` : undefined}
            />
          </Field>
        </div>

        <footer className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="btn"
          >
            취소
          </button>
          <button
            type="submit"
            // 부진지표인데 보완사항이 비어 있으면 눌리지 않는다. 이유는 보완사항 칸 아래에 보인다.
            disabled={noteCheck.required}
            aria-describedby={noteCheck.required ? `${ids.note}-error` : undefined}
            className="btn btn-primary"
          >
            {initial ? "수정 저장" : "지표 추가"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
