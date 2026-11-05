"use client";

// Design Ref: §11 지표 세부 화면 — 지표 이름을 누르면 열리는 창. 한 지표에 대한 모든 정보를 모아서 보여준다.
// Plan SC: 작업 16~19 — 필요 실적 역산, 월별 실적 추이 그래프, 개선조치 이력, 추진과제, 첨부파일(실적자료 등)

import { useEffect, useId, useRef } from "react";
import AttachmentPanel from "@/components/AttachmentPanel";
import MonthlyChart from "@/components/MonthlyChart";
import ProgressBar from "@/components/ProgressBar";
import { ActionsPanel, TasksPanel } from "@/components/RecordsPanel";
import TargetPlanPanel from "@/components/TargetPlanPanel";
import { hasMissingNote, hasMonthlyValues, monthOfDate, type IndicatorEvaluation } from "@/lib/calc";
import { EMPTY_MARK, formatBehindText, formatNumber, formatPercent } from "@/lib/format";
import { monthlySeries } from "@/lib/monthly";
import { planToTarget } from "@/lib/target";
import {
  AGGREGATION_LABELS,
  DEFAULT_AGGREGATION,
  isQuantitativeCategory,
  type Indicator,
} from "@/types/indicator";

/** 세부 화면에서 바꿀 수 있는 값. (지표의 나머지 값은 "지표 수정"으로 바꾼다) */
export type DetailPatch = Pick<Partial<Indicator>, "actions" | "tasks" | "attachments">;

interface IndicatorDetailProps {
  indicator: Indicator;
  evaluation: IndicatorEvaluation;
  /** 화면의 자료 기준일 */
  referenceDate: string;
  /** 모든 지표의 첨부파일 크기 합계(바이트) */
  totalAttachmentBytes: number;
  onClose: () => void;
  /** "지표 수정"을 눌렀을 때 */
  onEdit: () => void;
  /** 개선조치·추진과제·첨부파일이 바뀌었을 때 */
  onUpdate: (patch: DetailPatch) => void;
}

/** 세부 화면의 한 부분: 제목과 내용 */
function Section({
  title,
  description,
  children,
  testId,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      aria-label={title}
      className="glass-panel p-4"
      data-testid={testId}
    >
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 text-xs text-foreground/70">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** 이름과 값 한 쌍 */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-foreground/60">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

export default function IndicatorDetail({
  indicator,
  evaluation,
  referenceDate,
  totalAttachmentBytes,
  onClose,
  onEdit,
  onUpdate,
}: IndicatorDetailProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // 창이 처음 뜰 때 화면 전체를 가리는 모달 창으로 연다. (Esc로 닫을 수 있다)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const quantitative = isQuantitativeCategory(indicator.category);
  const delayed = evaluation.status === "delayed";
  const missingNote = hasMissingNote(indicator, evaluation.status);
  const referenceMonth = monthOfDate(referenceDate);
  const plan = planToTarget(indicator, referenceDate);
  const series = monthlySeries(indicator);
  const monthlyEntered = hasMonthlyValues(indicator);
  const mode = indicator.aggregation ?? DEFAULT_AGGREGATION;
  const levelLabel = mode === "latest" ? "월말 값" : "누적 실적";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(60rem,calc(100vw-2rem))] glass-dialog p-0 text-foreground"
      data-testid="indicator-detail"
    >
      <div className="flex max-h-[92vh] flex-col">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-xs text-foreground/70">{indicator.category}</p>
            <h2 id={titleId} className="text-lg font-semibold">
              {indicator.name}
            </h2>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="btn"
            >
              지표 수정
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-primary"
            >
              닫기
            </button>
          </div>
        </header>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          {/* ① 요약 */}
          <Section title="지표 요약" testId="detail-summary">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <Fact label="세부 평가항목">{indicator.item}</Fact>
              <Fact label="평가방법">{indicator.method}</Fact>
              <Fact label="배점">{formatNumber(indicator.weight)}</Fact>
              <Fact label="진척률">
                <span className={delayed ? "text-red-400" : undefined}>
                  {formatPercent(evaluation.displayProgress)}
                </span>
                {evaluation.displayProgress !== evaluation.progress && (
                  <span className="ml-1 text-xs font-normal text-foreground/60">
                    (원래 값 {formatPercent(evaluation.progress)})
                  </span>
                )}
              </Fact>
              <Fact label="상태">
                {delayed ? (
                  <>
                    <span className="mr-1.5 inline-block rounded bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white">
                      보완 필요
                    </span>
                    <span className="text-xs font-normal text-red-400">
                      {formatBehindText(evaluation.gap)}
                    </span>
                  </>
                ) : (
                  <span className="inline-block rounded bg-emerald-600 px-1.5 py-0.5 text-xs font-medium text-white">
                    정상
                  </span>
                )}
              </Fact>
              <Fact label="예상달성도">{formatPercent(indicator.expected)}</Fact>
              {quantitative && (
                <>
                  <Fact label="기준값 → 목표값">
                    {formatNumber(indicator.baseValue)} → {formatNumber(indicator.targetValue)}
                  </Fact>
                  <Fact label="현재 실적">{formatNumber(evaluation.actual ?? undefined)}</Fact>
                  <Fact label="집계 방식">{AGGREGATION_LABELS[mode]}</Fact>
                </>
              )}
              <Fact label="평가 기준일">{indicator.evalDate}</Fact>
            </dl>

            <div className="mt-4 max-w-md">
              <ProgressBar progress={evaluation.progress} elapsedRate={evaluation.elapsedRate} delayed={delayed} />
              <p className="mt-1 text-xs text-foreground/60">
                막대: 진척률, 세로선: 자료 기준일의 경과율 {formatPercent(evaluation.elapsedRate)}
              </p>
            </div>

            <div className="mt-4">
              <p className="text-xs text-foreground/60">보완사항</p>
              {missingNote ? (
                <p role="alert" className="mt-0.5 text-sm font-medium text-red-400">
                  부진지표인데 보완사항이 비어 있습니다. &quot;지표 수정&quot;에서 입력해 주세요.
                </p>
              ) : (
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{indicator.note ?? EMPTY_MARK}</p>
              )}
            </div>
          </Section>

          {/* ② 필요 실적 역산 */}
          <Section title="목표 달성을 위한 필요 실적 (역산)" testId="detail-target">
            <TargetPlanPanel plan={plan} elapsedRate={evaluation.elapsedRate} referenceMonth={referenceMonth} />
          </Section>

          {/* ③ 월별 실적 추이 */}
          <Section
            title="월별 실적 추이"
            description={
              quantitative
                ? `${AGGREGATION_LABELS[mode]} 방식: ${
                    mode === "latest"
                      ? "입력한 달의 값이 그대로 그 시점의 수준입니다."
                      : "그 달 실적을 더해 월별 누적을 계산합니다."
                  }`
                : undefined
            }
            testId="detail-monthly"
          >
            {!quantitative ? (
              <p className="text-sm text-foreground/70">
                수치로 평가하지 않는 지표(비계량)는 월별 실적 추이를 제공하지 않습니다. 진척률은 &quot;지표 수정&quot;에서 직접
                고칠 수 있습니다.
              </p>
            ) : !monthlyEntered ? (
              <div className="text-sm text-foreground/70">
                <p>입력한 월별 실적이 없습니다. &quot;지표 수정&quot;의 &quot;월별 실적 입력&quot;에서 그 달 실적을 넣으면 추이 그래프가 그려집니다.</p>
                <button
                  type="button"
                  onClick={onEdit}
                  className="btn btn-sm mt-2"
                >
                  월별 실적 입력하러 가기
                </button>
              </div>
            ) : (
              <>
                <MonthlyChart series={series} referenceMonth={referenceMonth} levelLabel={levelLabel} />
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[480px] border-collapse text-sm" data-testid="monthly-table">
                    <caption className="sr-only">월별 실적표</caption>
                    <thead className="bg-white/[.06]">
                      <tr>
                        <th scope="col" className="px-3 py-1.5 text-left font-medium">월</th>
                        <th scope="col" className="px-3 py-1.5 text-right font-medium">그 달 실적</th>
                        <th scope="col" className="px-3 py-1.5 text-right font-medium">{levelLabel}</th>
                        <th scope="col" className="px-3 py-1.5 text-right font-medium">목표 경로</th>
                        <th scope="col" className="px-3 py-1.5 text-right font-medium">경로 대비</th>
                      </tr>
                    </thead>
                    <tbody>
                      {series.map((point) => {
                        const diff =
                          point.level !== null && point.plan !== null ? point.level - point.plan : null;
                        const better =
                          diff !== null &&
                          indicator.baseValue !== undefined &&
                          indicator.targetValue !== undefined &&
                          (indicator.targetValue >= indicator.baseValue ? diff >= 0 : diff <= 0);
                        return (
                          <tr
                            key={point.month}
                            className={`border-t border-white/10 ${
                              point.month === referenceMonth ? "bg-blue-600/10" : ""
                            }`}
                          >
                            <th scope="row" className="px-3 py-1.5 text-left font-normal">
                              {point.month}월{point.month === referenceMonth ? " (기준일)" : ""}
                            </th>
                            <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(point.entered ?? undefined)}</td>
                            <td className="px-3 py-1.5 text-right font-medium tabular-nums">{formatNumber(point.level ?? undefined)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-foreground/70">{formatNumber(point.plan !== null ? Number(point.plan.toFixed(2)) : undefined)}</td>
                            <td
                              className={`px-3 py-1.5 text-right tabular-nums ${
                                diff === null ? "" : better ? "text-emerald-400" : "text-red-400"
                              }`}
                            >
                              {diff === null ? EMPTY_MARK : `${diff > 0 ? "+" : ""}${formatNumber(Number(diff.toFixed(2)))}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Section>

          {/* ④ 개선조치 이력 */}
          <Section
            title="개선조치 이력"
            description="부진지표를 끌어올리기 위해 한 일을 날짜 순으로 기록합니다."
            testId="detail-actions"
          >
            <ActionsPanel
              actions={indicator.actions ?? []}
              defaultDate={referenceDate}
              onChange={(next) => onUpdate({ actions: next })}
            />
          </Section>

          {/* ⑤ 추진과제 */}
          <Section title="추진과제" description="지표 달성을 위해 추진하는 과제입니다." testId="detail-tasks">
            <TasksPanel tasks={indicator.tasks ?? []} onChange={(next) => onUpdate({ tasks: next })} />
          </Section>

          {/* ⑥ 첨부파일 */}
          <Section
            title="첨부파일 (추진과제 자료 · 실적자료)"
            description="한글·엑셀·PDF 등을 올려 두고 다시 열어 볼 수 있습니다."
            testId="detail-attachments"
          >
            <AttachmentPanel
              attachments={indicator.attachments ?? []}
              totalBytes={totalAttachmentBytes}
              onChange={(next) => onUpdate({ attachments: next })}
            />
          </Section>
        </div>
      </div>
    </dialog>
  );
}
