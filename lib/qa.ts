// Design Ref: §17 질의응답 — 외부 AI 없이, 질문에서 조건(구분·정상/부진·순위·개수)을 읽어 이미 계산된 지표 값으로 답한다.
// Plan SC: 작업 20 — "부진지표 진척률 낮은 것부터 5개" 같은 질문에 정확히 답한다. 모든 계산은 브라우저 안에서만 한다.
//
// 이 파일은 화면과 무관한 순수 함수라서 Vitest로 확인한다.

import { hasMissingNote } from "@/lib/calc";
import type { IndicatorRow } from "@/lib/filterSort";
import type { IndicatorCategory } from "@/types/indicator";

/** 질문에서 읽은 지표 구분 조건. 둘 다 null이면 구분을 따지지 않는다. */
export interface CategoryScope {
  /** 부점 / 공통 */
  scope: "부점" | "공통" | null;
  /** 계량 / 비계량 */
  quant: "계량" | "비계량" | null;
}

/** 답에 들어가는 지표 한 줄 */
export interface QaRow {
  index: number;
  name: string;
  category: IndicatorCategory;
  progress: number;
  gap: number;
  status: "delayed" | "normal";
  weight: number;
  note?: string;
}

/** 질의응답 결과. rows가 있으면 표로, lines가 있으면 글로 보여준다. */
export interface QaResult {
  title: string;
  lines?: string[];
  rows?: QaRow[];
}

/** 공백을 모두 없앤 문자열. 띄어쓰기가 달라도 같은 말로 읽으려는 것이다. */
export function compact(text: string): string {
  return text.replace(/\s+/g, "");
}

/** 질문에서 "부점/공통"과 "계량/비계량"을 읽는다. */
export function detectScope(question: string): CategoryScope {
  const q = compact(question);
  const scope = q.includes("부점") ? "부점" : q.includes("공통") ? "공통" : null;
  const quant = q.includes("비계량") ? "비계량" : q.includes("계량") ? "계량" : null;
  return { scope, quant };
}

/** 지표 구분이 조건에 맞으면 true */
export function matchesScope(category: string, { scope, quant }: CategoryScope): boolean {
  if (scope !== null && !category.startsWith(scope)) return false;
  if (quant === "비계량" && !category.includes("비계량")) return false;
  if (quant === "계량" && category.includes("비계량")) return false;
  return true;
}

const KOREAN_NUMBERS: Record<string, number> = {
  한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
};

/** "5개", "상위 3", "세 개" 같은 개수 표현을 읽는다. 없으면 null */
export function detectLimit(question: string): number | null {
  const q = compact(question);
  const digit = q.match(/(\d+)(?:개|건|위|가지)/) ?? q.match(/(?:상위|하위|최상위|최하위)(\d+)/);
  if (digit) return Math.max(1, Math.min(30, Number(digit[1])));
  const word = q.match(/(다섯|여섯|일곱|여덟|아홉|열|한|두|세|네)(?:개|건|가지)/);
  if (word) return KOREAN_NUMBERS[word[1]];
  return null;
}

type SortPlan = { key: "progress" | "gap" | "weight"; direction: "asc" | "desc"; label: string };

/** "진척률 낮은 것부터" 같은 정렬 표현을 읽는다. 없으면 null */
function detectSort(q: string): SortPlan | null {
  const low = /낮|하위|적은|작은|뒤처|부진한/.test(q);
  const high = /높|상위|많은|큰|앞선|우수/.test(q);
  if (/배점/.test(q)) {
    return { key: "weight", direction: low && !high ? "asc" : "desc", label: low && !high ? "배점 낮은 순" : "배점 높은 순" };
  }
  if (/차이|격차|뒤처진정도|얼마나뒤/.test(q)) {
    // gap은 (진척률 − 경과율)이라 음수일수록 많이 뒤처진 것이다.
    return { key: "gap", direction: high && !low ? "desc" : "asc", label: "경과율보다 뒤처진 정도가 큰 순" };
  }
  if (/진척/.test(q)) {
    return { key: "progress", direction: high && !low ? "desc" : "asc", label: high && !low ? "진척률 높은 순" : "진척률 낮은 순" };
  }
  return null;
}

function toQaRow(row: IndicatorRow): QaRow {
  return {
    index: row.index,
    name: row.indicator.name,
    category: row.indicator.category,
    progress: row.evaluation.progress,
    gap: row.evaluation.gap,
    status: row.evaluation.status,
    weight: row.indicator.weight,
    ...(row.indicator.note ? { note: row.indicator.note } : {}),
  };
}

/** 질문에 이름이 들어 있는 지표를 찾는다. 이름이 겹치면 더 긴 이름을 고른다. */
export function findNamedIndicator(question: string, rows: IndicatorRow[]): IndicatorRow | null {
  const q = compact(question);
  let best: IndicatorRow | null = null;
  for (const row of rows) {
    const name = compact(row.indicator.name);
    if (name.length > 0 && q.includes(name) && (best === null || name.length > compact(best.indicator.name).length)) {
      best = row;
    }
  }
  return best;
}

/** 구분 조건을 사람이 읽는 말로 */
export function scopeLabel({ scope, quant }: CategoryScope): string {
  const parts = [scope, quant].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" ") : "전체";
}

/**
 * 지표에 대한 질문에 답한다. 알아듣지 못하면 null을 돌려준다. (그때는 부르는 쪽이 자료 검색 등으로 넘어간다)
 * 값은 모두 화면에 이미 계산되어 있는 평가 결과를 그대로 쓴다.
 */
export function answerIndicatorQuestion(question: string, rows: IndicatorRow[]): QaResult | null {
  const q = compact(question);
  if (q === "") return null;

  if (rows.length === 0) {
    return { title: "등록된 지표가 없습니다", lines: ["먼저 지표를 추가하거나 엑셀로 올려 주세요."] };
  }

  const scope = detectScope(question);
  const scoped = rows.filter((row) => matchesScope(row.indicator.category, scope));
  const hasScope = scope.scope !== null || scope.quant !== null;

  // 1) 지표 이름이 들어 있으면 그 지표의 현황
  const named = findNamedIndicator(question, rows);
  if (named) {
    const { indicator, evaluation } = named;
    const lines = [
      `지표 구분: ${indicator.category}`,
      `진척률 ${evaluation.progress.toFixed(1)}% · 경과율 ${evaluation.elapsedRate.toFixed(1)}% (${
        evaluation.status === "delayed"
          ? `부진, 경과율보다 ${Math.abs(evaluation.gap).toFixed(1)}%p 낮음`
          : "정상"
      })`,
      `예상달성도 ${indicator.expected.toFixed(1)}% · 배점 ${indicator.weight}`,
      indicator.note ? `보완사항: ${indicator.note}` : "보완사항: 없음",
    ];
    return { title: indicator.name, lines, rows: [toQaRow(named)] };
  }

  const statusDelayed = /부진|보완|뒤처|미흡|늦/.test(q);
  const statusNormal = /정상|양호|순조/.test(q) && !statusDelayed;
  const sort = detectSort(q);
  const limit = detectLimit(question);
  const wantsCount = /몇개|몇건|개수|갯수|수는|몇이/.test(q);
  const wantsMissingNote = /보완사항(이)?(없|비어|빠진|미입력)|보완사항입력|보완사항을적/.test(q);
  const wantsSummary = /요약|현황|전체상황|한눈에|정리/.test(q);
  const mentionsIndicators = /지표/.test(q);

  const recognized =
    hasScope || statusDelayed || statusNormal || sort !== null || wantsCount || wantsMissingNote || wantsSummary || mentionsIndicators;
  if (!recognized) return null;

  // 2) 구분별 요약
  if (wantsSummary && !hasScope && !statusDelayed && !statusNormal && sort === null && !wantsCount) {
    const delayed = rows.filter((row) => row.evaluation.status === "delayed").length;
    const lines = [
      `전체 ${rows.length}개: 정상 ${rows.length - delayed}개, 보완 필요(부진) ${delayed}개`,
      ...Array.from(new Set(rows.map((row) => row.indicator.category))).map((category) => {
        const inCategory = rows.filter((row) => row.indicator.category === category);
        const bad = inCategory.filter((row) => row.evaluation.status === "delayed").length;
        return `${category}: ${inCategory.length}개 중 보완 필요 ${bad}개`;
      }),
      `자료 기준일 경과율: ${rows[0].evaluation.elapsedRate.toFixed(1)}%`,
    ];
    return { title: "전체 현황 요약", lines };
  }

  // 3) 조건에 맞는 지표를 거르고 정렬
  let picked = scoped;
  if (statusDelayed) picked = picked.filter((row) => row.evaluation.status === "delayed");
  if (statusNormal) picked = picked.filter((row) => row.evaluation.status === "normal");
  if (wantsMissingNote) picked = picked.filter((row) => hasMissingNote(row.indicator, row.evaluation.status));

  const conditionText = [
    hasScope ? scopeLabel(scope) : null,
    statusDelayed ? "부진" : statusNormal ? "정상" : null,
    wantsMissingNote ? "보완사항 입력 필요" : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  if (wantsCount) {
    return {
      title: `${conditionText || "전체"} 지표 개수`,
      lines: [`${picked.length}개입니다. (전체 ${rows.length}개 중)`],
      rows: picked.map(toQaRow),
    };
  }

  const key = sort ?? (statusDelayed ? ({ key: "gap", direction: "asc", label: "뒤처진 정도가 큰 순" } as SortPlan) : null);
  const ordered = [...picked];
  if (key) {
    const sign = key.direction === "asc" ? 1 : -1;
    const value = (row: IndicatorRow) =>
      key.key === "progress" ? row.evaluation.progress : key.key === "gap" ? row.evaluation.gap : row.indicator.weight;
    ordered.sort((a, b) => sign * (value(a) - value(b)));
  }
  const shown = limit === null ? ordered : ordered.slice(0, limit);

  if (shown.length === 0) {
    return { title: `${conditionText || "조건"}에 맞는 지표가 없습니다`, lines: ["조건을 바꿔 다시 물어보세요."] };
  }
  const titleParts = [conditionText || "전체", "지표", key ? `(${key.label})` : ""].filter(Boolean);
  const countText = limit !== null && ordered.length > shown.length ? ` — ${ordered.length}개 중 ${shown.length}개` : ` — ${shown.length}개`;
  return { title: `${titleParts.join(" ")}${countText}`, rows: shown.map(toQaRow) };
}
