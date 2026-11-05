// Design Ref: §12 필요 실적 역산 — 목표를 이루려면 앞으로 얼마가 더 필요한지 알려준다.
// Plan SC: 작업 16 — 각 지표별 목표 달성을 위한 필요 실적 역산

import { formatNumber, formatPercent } from "@/lib/format";
import type { TargetPlan } from "@/lib/target";

interface TargetPlanPanelProps {
  plan: TargetPlan;
  /** 자료 기준일의 경과율(%) */
  elapsedRate: number;
  /** 자료 기준일이 속한 달(1~12) */
  referenceMonth: number;
}

/** 한 줄: 제목과 값 */
function Row({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-white/10 py-2 text-sm last:border-b-0">
      <dt className="text-foreground/70">{label}</dt>
      <dd className="font-medium tabular-nums" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

export default function TargetPlanPanel({ plan, elapsedRate, referenceMonth }: TargetPlanPanelProps) {
  const quantitative = plan.kind === "quantitative";
  const word = plan.direction === "decrease" ? "줄여야" : "늘려야";
  const unitless = (value: number) => (quantitative ? formatNumber(value) : `${formatNumber(value)}%p`);

  return (
    <div data-testid="target-plan">
      <p className="mb-2 text-xs text-foreground/70">
        자료 기준일({referenceMonth}월)을 기준으로 계산합니다.{" "}
        {quantitative
          ? "실적은 지표의 단위 그대로입니다."
          : "수치로 평가하지 않는 지표라 진척률(%) 기준으로 계산합니다."}
      </p>

      {plan.achieved ? (
        <p
          role="status"
          className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm font-medium"
        >
          목표를 이미 달성했습니다.
        </p>
      ) : null}

      <dl>
        <Row label={quantitative ? "현재 실적" : "현재 진척률"} testId="plan-current">
          {quantitative ? formatNumber(plan.current) : formatPercent(plan.current)}
        </Row>

        {!plan.achieved && (
          <Row
            label={quantitative ? `목표까지 더 ${word} 하는 양` : "진척률 100%까지 더 필요한 양"}
            testId="plan-remaining"
          >
            {unitless(plan.remaining)}
          </Row>
        )}

        {!plan.achieved && (
          <Row label={`남은 기간(${plan.monthsLeft}개월) 동안 매달 필요한 양`} testId="plan-per-month">
            {plan.perMonth !== null
              ? `${unitless(plan.perMonth)} / 월`
              : plan.monthsLeft === 0
                ? "남은 기간이 없습니다 (12월)"
                : "구하지 않음 (월말값 지표는 월별로 더하는 값이 아니라서)"}
          </Row>
        )}

        <Row
          label={`부진 탈출선 (경과율 ${formatPercent(elapsedRate)} 시점의 목표 경로)`}
          testId="plan-catchup-level"
        >
          {quantitative ? formatNumber(plan.catchUpLevel) : formatPercent(plan.catchUpLevel)}
        </Row>
        <Row label="부진 탈출선까지 더 필요한 양" testId="plan-catchup-remaining">
          {plan.catchUpRemaining === 0 ? (
            <span className="text-emerald-400">이미 넘었습니다</span>
          ) : (
            <span className="text-red-400">{unitless(plan.catchUpRemaining)}</span>
          )}
        </Row>
      </dl>
    </div>
  );
}
