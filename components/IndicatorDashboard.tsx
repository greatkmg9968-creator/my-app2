"use client";

// Design Ref: §2.2 ②③④⑤ — 기준 정보(자료 기준일·경과율·저장 안 됨 안내), 요약 카드, 필터·정렬, 지표 표를 한 화면에 모은다.
// Plan SC: 작업 6 — 자료 기준일·경과율 표시, 부진지표 강조, 판정 보류 개수, 저장 안 됨 안내와 확인 창
// Plan SC: 작업 8 — 필터(부진지표만, 지표 구분별)와 정렬(진척률, 차이, 지표명, 배점)
// Plan SC: 작업 9 — 지표 직접 입력(추가·수정·삭제, 최대 30개). 지표 구분은 부점/공통 × 계량/비계량 네 가지다.
//
// 자료 기준일은 화면에서 바꿀 수 있고(기본값은 오늘), 바꾸면 경과율과 부진 판정이 바로 다시 계산된다.
// 필터·정렬은 보이는 목록만 바꾼다. 요약 카드의 개수는 항상 전체 지표 기준이다.
// 지표 목록은 이 화면의 메모리에만 있고 저장하지 않는다. (새로고침하면 처음 상태로 돌아간다)

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import IndicatorForm from "@/components/IndicatorForm";
import IndicatorTable from "@/components/IndicatorTable";
import { useBeforeUnloadWarning } from "@/components/useBeforeUnloadWarning";
import {
  calcElapsedRate,
  evaluateIndicator,
  hasMissingNote,
  toDateString,
} from "@/lib/calc";
import {
  filterRows,
  hasActiveFilters,
  NO_FILTERS,
  sortRows,
  type IndicatorRow,
  type RowFilters,
  type SortDirection,
  type SortKey,
} from "@/lib/filterSort";
import { checkUploadFile, TEMPLATE_FILE_NAME } from "@/lib/excelFormat";
import { formatUploadErrors, parseUploadedSheet } from "@/lib/excelRows";
import { EMPTY_MARK, formatPercent } from "@/lib/format";
import {
  INDICATOR_CATEGORIES,
  MAX_INDICATORS,
  type Indicator,
} from "@/types/indicator";

/** 지금 열려 있는 입력 창. 없으면 null */
type FormTarget = { mode: "add" } | { mode: "edit"; index: number } | null;

/** 엑셀 올리기·양식 받기 결과 안내. 성공이면 한 줄, 실패면 어느 줄이 왜 안 되는지 목록으로 보여준다. */
interface UploadNotice {
  kind: "success" | "error";
  title: string;
  details: string[];
}

/** 오류 목록을 화면에 보여줄 최대 줄 수. 넘으면 "외 N건"으로 줄인다. */
const MAX_NOTICE_DETAILS = 15;

/** 엑셀 파일 내용을 브라우저가 내려받게 한다. */
function downloadBytes(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** 도구 줄의 일반 버튼 모양 */
const TOOL_BUTTON =
  "rounded border border-black/20 px-3 py-1 text-sm hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/25 dark:hover:bg-white/10";

/** 정렬 기준 선택지 */
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "default", label: "입력 순서" },
  { value: "progress", label: "진척률" },
  { value: "gap", label: "경과율과의 차이(%p)" },
  { value: "name", label: "지표명" },
  { value: "weight", label: "배점" },
];

/** 도구 줄의 선택 상자·입력 상자 공통 모양 */
const CONTROL_CLASS =
  "rounded border border-black/20 bg-background px-2 py-1 text-sm dark:border-white/25";

interface IndicatorDashboardProps {
  /** 처음에 보여줄 지표. 화면에서 추가·수정·삭제하면 이 화면 안에서만 바뀐다. */
  initialIndicators: Indicator[];
  /** 로그인한 사용자의 부점. 새 지표에 자동으로 넣는다. */
  branch: string;
}

// 오늘 날짜는 브라우저에서만 안다. 서버에서 처음 그릴 때는 빈 값을 쓰고,
// 브라우저에서 이어받으면 오늘 날짜로 바뀐다. (서버·브라우저 날짜가 달라 생기는 오류를 피한다)
const subscribeNothing = () => () => {};
const getToday = () => toDateString(new Date());
const getTodayOnServer = () => "";

/** 경과율을 계산한다. 날짜가 비었거나 올바르지 않으면 null */
function safeElapsedRate(date: string): number | null {
  if (date === "") return null;
  try {
    return calcElapsedRate(date);
  } catch {
    return null;
  }
}

/** 요약 카드 한 칸 */
function SummaryCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone?: "danger";
}) {
  return (
    <div
      className={
        tone === "danger"
          ? "rounded-lg border border-red-600/40 bg-red-500/10 px-4 py-3"
          : "rounded-lg border border-black/10 px-4 py-3 dark:border-white/15"
      }
    >
      <p className="text-xs text-foreground/70">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">
        {count}
        <span className="ml-1 text-sm font-normal">개</span>
      </p>
    </div>
  );
}

export default function IndicatorDashboard({
  initialIndicators,
  branch,
}: IndicatorDashboardProps) {
  // 지표 목록. 이 화면의 메모리에만 두고 저장하지 않는다.
  const [indicators, setIndicators] = useState<Indicator[]>(initialIndicators);
  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  const isFull = indicators.length >= MAX_INDICATORS;

  const today = useSyncExternalStore(subscribeNothing, getToday, getTodayOnServer);
  // 사용자가 고른 날짜. 아직 고르지 않았으면 오늘 날짜를 쓴다.
  const [pickedDate, setPickedDate] = useState<string | null>(null);

  const referenceDate = pickedDate ?? today;
  // 오늘 날짜를 아직 모르는 첫 순간(서버에서 그릴 때)에는 계산하지 않는다.
  const isReady = today !== "" || pickedDate !== null;
  const elapsedRate = isReady ? safeElapsedRate(referenceDate) : null;

  const rows: IndicatorRow[] | null = useMemo(() => {
    if (elapsedRate === null) return null;
    return indicators.map((indicator, index) => ({
      indicator,
      evaluation: evaluateIndicator(indicator, referenceDate),
      index,
    }));
  }, [indicators, referenceDate, elapsedRate]);

  // 필터·정렬 조건. 보이는 목록만 바꾸고 지표 데이터는 바꾸지 않는다.
  const [filters, setFilters] = useState<RowFilters>(NO_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const visibleRows = useMemo(
    () => (rows === null ? null : sortRows(filterRows(rows, filters), sortKey, sortDirection)),
    [rows, filters, sortKey, sortDirection],
  );

  // 지표 값은 저장되지 않으므로, 지표가 있는 동안에는 새로고침·창 닫기 전에 확인 창을 띄운다.
  useBeforeUnloadWarning(indicators.length > 0);

  /** 입력 창에서 검사를 통과한 지표를 목록에 넣는다. (추가면 맨 뒤에, 수정이면 그 자리에) */
  const handleSubmit = (indicator: Indicator) => {
    if (formTarget?.mode === "edit") {
      const { index } = formTarget;
      setIndicators((current) => current.map((item, i) => (i === index ? indicator : item)));
    } else {
      setIndicators((current) =>
        current.length >= MAX_INDICATORS ? current : [...current, indicator],
      );
    }
    setFormTarget(null);
  };

  const handleDelete = (index: number) => {
    const target = indicators[index];
    if (!target) return;
    if (!window.confirm(`"${target.name}" 지표를 삭제할까요?`)) return;
    setIndicators((current) => current.filter((_, i) => i !== index));
  };

  // 엑셀 양식 받기·올리기
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadNotice, setUploadNotice] = useState<UploadNotice | null>(null);
  const [excelBusy, setExcelBusy] = useState(false);

  /** 엑셀 양식(.xlsx)을 만들어 내려받는다. 양식에는 내 부점 이름이 미리 적혀 있다. */
  const handleDownloadTemplate = async () => {
    setExcelBusy(true);
    setUploadNotice(null);
    try {
      // 엑셀 도구(ExcelJS)는 크기가 커서 필요할 때만 불러온다.
      const { buildTemplate } = await import("@/lib/excel");
      downloadBytes(await buildTemplate(branch), TEMPLATE_FILE_NAME);
      setUploadNotice({
        kind: "success",
        title: `엑셀 양식을 내려받았습니다. (${TEMPLATE_FILE_NAME})`,
        details: ["엑셀에서 \"지표\" 시트에 지표를 적고 저장한 뒤, \"엑셀 올리기\"로 올려 주세요. 작성 방법은 \"작성 안내\" 시트에 있습니다."],
      });
    } catch {
      setUploadNotice({
        kind: "error",
        title: "엑셀 양식을 만들지 못했습니다.",
        details: ["잠시 뒤 다시 시도해 주세요."],
      });
    } finally {
      setExcelBusy(false);
    }
  };

  /** 고른 엑셀 파일을 검사해서, 모두 통과하면 지표 목록을 올린 지표로 바꾼다. */
  const handleFileChosen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 같은 파일을 다시 고쳐서 올려도 이벤트가 오도록 선택값을 비워 둔다.
    event.target.value = "";
    if (!file) return;

    const fileError = checkUploadFile(file);
    if (fileError) {
      setUploadNotice({ kind: "error", title: "이 파일은 올릴 수 없습니다.", details: [fileError] });
      return;
    }

    setExcelBusy(true);
    setUploadNotice(null);
    try {
      const { readSheet } = await import("@/lib/excel");
      const sheet = await readSheet(await file.arrayBuffer());
      const result = parseUploadedSheet(sheet, { branch, referenceDate });

      if (!result.ok) {
        const lines = formatUploadErrors(result.errors);
        const shown = lines.slice(0, MAX_NOTICE_DETAILS);
        if (lines.length > shown.length) shown.push(`…외 ${lines.length - shown.length}건`);
        setUploadNotice({
          kind: "error",
          title: `올리지 못했습니다. 고칠 곳이 ${lines.length}건 있습니다. (기존 지표는 그대로입니다)`,
          details: shown,
        });
        return;
      }

      // 올리면 기존 지표가 모두 바뀌므로 먼저 확인한다.
      if (
        indicators.length > 0 &&
        !window.confirm(
          `기존 지표 ${indicators.length}건이 모두 사라지고, 올린 파일의 지표 ${result.indicators.length}건으로 바뀝니다. 계속할까요?`,
        )
      ) {
        setUploadNotice({ kind: "error", title: "올리기를 취소했습니다. (기존 지표는 그대로입니다)", details: [] });
        return;
      }

      setIndicators(result.indicators);
      setUploadNotice({
        kind: "success",
        title: `엑셀 파일에서 지표 ${result.indicators.length}건을 올렸습니다.`,
        details: [],
      });
    } catch {
      setUploadNotice({
        kind: "error",
        title: "엑셀 파일을 읽지 못했습니다.",
        details: ["엑셀에서 만든 .xlsx 파일이 맞는지, 파일이 손상되지 않았는지 확인해 주세요."],
      });
    } finally {
      setExcelBusy(false);
    }
  };

  const handleClearAll = () => {
    if (!window.confirm(`지표 ${indicators.length}건을 모두 지울까요? (샘플 지표도 함께 지워집니다)`)) {
      return;
    }
    setIndicators([]);
    setFilters(NO_FILTERS);
    setSortKey("default");
    setSortDirection("asc");
  };

  const delayedCount = rows?.filter((r) => r.evaluation.status === "delayed").length ?? 0;
  const normalCount = rows?.filter((r) => r.evaluation.status === "normal").length ?? 0;
  const pendingCount = rows?.filter((r) => r.evaluation.status === "pending").length ?? 0;
  // 부진인데 보완사항이 비어 있는 지표 수. (자료 기준일을 바꾸면 새로 생길 수 있다)
  const missingNoteCount =
    rows?.filter((r) => hasMissingNote(r.indicator, r.evaluation.status)).length ?? 0;

  return (
    <>
      {/* ② 기준 정보 */}
      <section
        aria-label="기준 정보"
        className="mb-4 rounded-lg border border-black/10 p-4 dark:border-white/15"
      >
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-foreground/70">자료 기준일</span>
            <input
              type="date"
              value={referenceDate}
              onChange={(event) => setPickedDate(event.target.value)}
              className="rounded border border-black/20 bg-background px-2 py-1 dark:border-white/25"
            />
          </label>
          <p className="text-sm">
            <span className="text-foreground/70">경과율 </span>
            <strong className="text-lg tabular-nums" data-testid="elapsed-rate">
              {elapsedRate === null ? EMPTY_MARK : formatPercent(elapsedRate)}
            </strong>
          </p>
        </div>
        <p className="mt-3 text-xs text-foreground/70">
          이 화면의 값은 저장되지 않습니다. 새로고침하거나 창을 닫으면 사라지니, 엑셀로 내보내 보관하세요.
        </p>
      </section>

      {rows === null || visibleRows === null ? (
        <p
          role="status"
          className="rounded-lg border border-dashed border-black/20 p-8 text-center text-sm dark:border-white/25"
        >
          {isReady ? "자료 기준일을 올바르게 선택해 주세요." : "자료 기준일을 확인하는 중입니다."}
        </p>
      ) : (
        <>
          {/* ③ 요약 카드 */}
          <section aria-label="지표 요약" className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="전체 지표" count={rows.length} />
            <SummaryCard label="부진지표" count={delayedCount} tone="danger" />
            <SummaryCard label="정상" count={normalCount} />
            <SummaryCard label="판정 보류" count={pendingCount} />
          </section>

          {/* 보완사항이 빠진 부진지표 알림 */}
          {missingNoteCount > 0 && (
            <p
              role="status"
              data-testid="missing-note-alert"
              className="mb-4 rounded-lg border border-red-600/50 bg-red-500/10 px-4 py-3 text-sm"
            >
              <strong>보완사항을 입력해야 하는 부진지표가 {missingNoteCount}건 있습니다.</strong>{" "}
              표에서 &quot;보완사항 입력 필요&quot; 버튼을 눌러 보완사항을 적어 주세요.
            </p>
          )}

          {/* ④ 도구 줄: 지표 직접 입력 */}
          <section
            aria-label="지표 입력 도구"
            className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15"
          >
            <button
              type="button"
              onClick={() => setFormTarget({ mode: "add" })}
              disabled={isFull}
              className="rounded bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              지표 추가
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              disabled={indicators.length === 0}
              className={TOOL_BUTTON}
            >
              전체 지우기
            </button>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              disabled={excelBusy}
              className={TOOL_BUTTON}
            >
              엑셀 양식 받기
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={excelBusy}
              className={TOOL_BUTTON}
            >
              엑셀 올리기
            </button>
            {/* 숨겨 둔 파일 선택 상자. "엑셀 올리기" 버튼이 대신 눌러 준다. */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileChosen}
              className="sr-only"
              tabIndex={-1}
              aria-label="올릴 엑셀 파일 선택"
              data-testid="excel-file-input"
            />
            <p className="text-sm text-foreground/70" data-testid="indicator-count">
              등록된 지표 {indicators.length} / 최대 {MAX_INDICATORS}개
              {isFull && " — 가득 찼습니다. 새 지표를 추가하려면 먼저 지표를 삭제해 주세요."}
            </p>

            {/* 엑셀 양식 받기·올리기 결과 */}
            {uploadNotice && (
              <div
                role={uploadNotice.kind === "error" ? "alert" : "status"}
                data-testid="upload-notice"
                data-kind={uploadNotice.kind}
                className={`w-full rounded-lg border px-4 py-3 text-sm ${
                  uploadNotice.kind === "error"
                    ? "border-red-600/50 bg-red-500/10"
                    : "border-emerald-600/50 bg-emerald-500/10"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{uploadNotice.title}</p>
                  <button
                    type="button"
                    onClick={() => setUploadNotice(null)}
                    className="shrink-0 rounded border border-black/20 px-2 py-0.5 text-xs hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10"
                  >
                    닫기
                  </button>
                </div>
                {uploadNotice.details.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    {uploadNotice.details.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* ④ 필터·정렬 */}
          <section
            aria-label="필터와 정렬"
            className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-lg border border-black/10 p-4 dark:border-white/15"
          >
            <label className="flex items-center gap-2 pb-1 text-sm">
              <input
                type="checkbox"
                checked={filters.delayedOnly}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, delayedOnly: event.target.checked }))
                }
                className="h-4 w-4"
              />
              부진지표만 보기
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground/70">지표 구분</span>
              <select
                value={filters.category}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    category: event.target.value as RowFilters["category"],
                  }))
                }
                className={CONTROL_CLASS}
              >
                <option value="">전체</option>
                {INDICATOR_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground/70">정렬 기준</span>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                className={CONTROL_CLASS}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground/70">정렬 방향</span>
              <select
                value={sortDirection}
                onChange={(event) => setSortDirection(event.target.value as SortDirection)}
                disabled={sortKey === "default"}
                className={`${CONTROL_CLASS} disabled:opacity-50`}
              >
                <option value="asc">오름차순 (낮은 것부터)</option>
                <option value="desc">내림차순 (높은 것부터)</option>
              </select>
            </label>

            {(hasActiveFilters(filters) || sortKey !== "default") && (
              <button
                type="button"
                onClick={() => {
                  setFilters(NO_FILTERS);
                  setSortKey("default");
                  setSortDirection("asc");
                }}
                className="rounded border border-black/20 px-3 py-1 text-sm hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10"
              >
                조건 초기화
              </button>
            )}
          </section>

          <h2 className="mb-3 text-base font-semibold">
            지표 현황{" "}
            <span className="font-normal text-foreground/70">
              {visibleRows.length === rows.length
                ? `(전체 ${rows.length}건)`
                : `(전체 ${rows.length}건 중 ${visibleRows.length}건 표시)`}
            </span>
          </h2>
          {/* 막대 읽는 법 */}
          <p className="mb-3 text-xs text-foreground/70">
            막대 읽는 법: 막대 길이는 진척률(100%가 가득 찬 길이)이고, 세로선은 자료 기준일 시점의 경과율입니다.
            막대가 세로선보다 짧으면 시간보다 뒤처진 부진지표입니다. 막대 끝의 노란 조각은 100%를 넘긴 지표입니다.
          </p>
          {visibleRows.length === 0 ? (
            <p
              role="status"
              className="rounded-lg border border-dashed border-black/20 p-8 text-center text-sm dark:border-white/25"
            >
              {indicators.length === 0
                ? "등록된 지표가 없습니다. 위의 \"지표 추가\"를 눌러 지표를 입력해 주세요."
                : "조건에 맞는 지표가 없습니다. 위의 필터를 바꾸거나 \"조건 초기화\"를 눌러 주세요."}
            </p>
          ) : (
            <IndicatorTable
              rows={visibleRows}
              onEdit={(index) => setFormTarget({ mode: "edit", index })}
              onDelete={handleDelete}
            />
          )}
        </>
      )}

      {/* 지표 입력 창 (추가·수정) */}
      {formTarget && (
        <IndicatorForm
          key={formTarget.mode === "edit" ? `edit-${formTarget.index}` : "add"}
          branch={branch}
          initial={formTarget.mode === "edit" ? indicators[formTarget.index] : undefined}
          referenceDate={referenceDate}
          onSubmit={handleSubmit}
          onCancel={() => setFormTarget(null)}
        />
      )}
    </>
  );
}
