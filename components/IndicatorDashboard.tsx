"use client";

// Design Ref: §2.2 성과지표 통합 대시보드 — 기준 정보, 지표 구분별 도넛(정상·보완 개수와 비율), 아래로 펼치는 세부 지표 표.
// Plan SC: 작업 14 — 도넛 4개를 누르면 그 구분의 세부 지표가 아래로 펼쳐지고, "전체 지표 보기"로 모두 볼 수 있다.
// Plan SC: 작업 6·8·9·10·11·12 — 자료 기준일·경과율, 필터·정렬, 지표 입력, 보완사항 필수, 엑셀 올리기·내보내기
// Plan SC: 작업 15~19 — 이 컴퓨터에 자동 저장, 지표 세부 화면(역산·월별 추이·개선조치·추진과제·첨부파일)
//
// 자료 기준일은 화면에서 바꿀 수 있고(기본값은 오늘), 바꾸면 경과율과 부진 판정이 바로 다시 계산된다.
// 지표 목록과 부점 이름은 바뀔 때마다 이 컴퓨터의 브라우저(localStorage)에 자동 저장하고, 서버로는 보내지 않는다.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import CategoryDonuts, { type Selection } from "@/components/CategoryDonuts";
import IndicatorDetail, { type DetailPatch } from "@/components/IndicatorDetail";
import IndicatorForm from "@/components/IndicatorForm";
import IndicatorTable from "@/components/IndicatorTable";
import { clearAllFiles, deleteFiles } from "@/lib/attachmentStore";
import {
  calcElapsedRate,
  evaluateIndicator,
  hasMissingNote,
  toDateString,
} from "@/lib/calc";
import { checkUploadFile, exportFileName, TEMPLATE_FILE_NAME } from "@/lib/excelFormat";
import { formatUploadErrors, parseUploadedWorkbook } from "@/lib/excelRows";
import {
  filterRows,
  hasActiveFilters,
  sortRows,
  type IndicatorRow,
  type SortDirection,
  type SortKey,
} from "@/lib/filterSort";
import { EMPTY_MARK, formatPercent } from "@/lib/format";
import {
  carryOverAttachments,
  ensureIds,
  newId,
  orphanedAttachmentIds,
  totalAttachmentBytes,
} from "@/lib/records";
import { SAMPLE_INDICATORS } from "@/lib/sampleData";
import { serializeState, STORAGE_KEY } from "@/lib/storage";
import { summarizeByCategory } from "@/lib/summary";
import {
  INDICATOR_CATEGORIES,
  MAX_INDICATORS,
  type Indicator,
  type IndicatorCategory,
} from "@/types/indicator";

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
  "field text-sm";

/** 지금 열려 있는 입력 창. 없으면 null */
type FormTarget = { mode: "add" } | { mode: "edit"; index: number } | null;

/**
 * 엑셀 양식 받기·올리기·내보내기 결과 안내. 성공이면 한 줄, 실패면 어느 줄이 왜 안 되는지 목록으로 보여준다.
 * warning은 끝까지 진행했지만 알려야 할 것이 있을 때다. (예: 내보냈지만 보완사항이 빈 부진지표가 있음)
 */
interface UploadNotice {
  kind: "success" | "warning" | "error";
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
  "btn";

interface IndicatorDashboardProps {
  /** 처음에 보여줄 지표. 화면에서 추가·수정·삭제하면 이 화면 안에서 바뀌고, 이 컴퓨터에 자동 저장된다. */
  initialIndicators: Indicator[];
  /** 처음에 채워 둘 부점 이름. 화면에서 바꿀 수 있고, 새 지표에 자동으로 들어간다. */
  initialBranch: string;
  /** 시작할 때 보여줄 안내 (예: 저장된 자료 중 일부를 읽지 못해 제외했다). 없으면 null */
  initialNotice?: string | null;
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

/** 수정할 때 폼이 다루지 않는 값(번호·개선조치·추진과제·첨부파일 정보)을 기존 지표에서 이어 받는다. */
function carriedRecords(existing: Indicator | undefined): Partial<Indicator> {
  if (!existing) return { id: newId() };
  return {
    id: existing.id ?? newId(),
    ...(existing.actions ? { actions: existing.actions } : {}),
    ...(existing.tasks ? { tasks: existing.tasks } : {}),
    ...(existing.attachments ? { attachments: existing.attachments } : {}),
  };
}

export default function IndicatorDashboard({
  initialIndicators,
  initialBranch,
  initialNotice = null,
}: IndicatorDashboardProps) {
  // 지표 목록. 바뀔 때마다 이 컴퓨터에 자동 저장한다.
  const [indicators, setIndicators] = useState<Indicator[]>(initialIndicators);

  // 부점 이름. 로그인이 없으므로 화면에서 직접 입력한다. (입력 중에는 공백도 그대로 두고, 쓸 때는 앞뒤 공백을 지운다)
  const [branchInput, setBranchInput] = useState(initialBranch);
  const branch = branchInput.trim();
  const branchReady = branch !== "";

  /** 부점 이름을 바꾸면 이미 있는 지표의 부점도 같은 이름으로 맞춘다. (엑셀로 내보낸 뒤 다시 올릴 때 부점이 어긋나지 않게) */
  const handleBranchChange = (value: string) => {
    setBranchInput(value);
    const next = value.trim();
    if (next === "") return;
    setIndicators((current) =>
      current.map((item) => (item.branch === next ? item : { ...item, branch: next })),
    );
  };

  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const isFull = indicators.length >= MAX_INDICATORS;

  // ── 자동 저장 ───────────────────────────────────────────────
  const [saveFailed, setSaveFailed] = useState(false);
  const [startNotice, setStartNotice] = useState<string | null>(initialNotice);

  useEffect(() => {
    let failed = false;
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeState({ branch: branchInput.trim(), indicators }));
    } catch {
      // 저장 공간이 모자라거나 브라우저가 저장을 막은 경우
      failed = true;
    }
    // 이 효과 안에서 바로 상태를 바꾸지 않고, 다음 순간에 반영한다.
    const timer = setTimeout(() => setSaveFailed(failed), 0);
    return () => clearTimeout(timer);
  }, [indicators, branchInput]);

  // ── 자료 기준일과 평가 ─────────────────────────────────────
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

  const summaries = useMemo(() => summarizeByCategory(rows ?? []), [rows]);

  // ── 도넛을 눌러 펼친 목록, 필터·정렬 ─────────────────────────
  const [selection, setSelection] = useState<Selection>(null);
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<IndicatorCategory | "">("");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const resetView = () => {
    setDelayedOnly(false);
    setCategoryFilter("");
    setSortKey("default");
    setSortDirection("asc");
  };

  const selectCategory = (category: IndicatorCategory) => {
    setSelection((current) => (current === category ? null : category));
    resetView();
  };
  const toggleAll = () => {
    setSelection((current) => (current === "all" ? null : "all"));
    resetView();
  };

  /** 펼친 목록에 보여줄 줄들: 구분 → 필터 → 정렬 순으로 거른다. */
  const panelRows = useMemo(() => {
    if (rows === null || selection === null) return null;
    const base = selection === "all" ? rows : rows.filter((row) => row.indicator.category === selection);
    const filtered = filterRows(base, {
      delayedOnly,
      category: selection === "all" ? categoryFilter : "",
    });
    return { base, visible: sortRows(filtered, sortKey, sortDirection) };
  }, [rows, selection, delayedOnly, categoryFilter, sortKey, sortDirection]);

  // ── 지표 추가·수정·삭제 ──────────────────────────────────────
  /** 입력 창에서 검사를 통과한 지표를 목록에 넣는다. (추가면 맨 뒤에, 수정이면 그 자리에) */
  const handleSubmit = (indicator: Indicator) => {
    if (formTarget?.mode === "edit") {
      const { index } = formTarget;
      setIndicators((current) =>
        current.map((item, i) => (i === index ? { ...carriedRecords(item), ...indicator } : item)),
      );
    } else {
      setIndicators((current) =>
        current.length >= MAX_INDICATORS ? current : [...current, { ...carriedRecords(undefined), ...indicator }],
      );
    }
    setFormTarget(null);
  };

  const handleDelete = (index: number) => {
    const target = indicators[index];
    if (!target) return;
    const fileCount = target.attachments?.length ?? 0;
    const message =
      fileCount > 0
        ? `"${target.name}" 지표를 삭제할까요? (올려 둔 파일 ${fileCount}개도 이 컴퓨터에서 함께 지워집니다)`
        : `"${target.name}" 지표를 삭제할까요?`;
    if (!window.confirm(message)) return;
    setIndicators((current) => current.filter((_, i) => i !== index));
    setDetailIndex((current) => (current === index ? null : current));
    // 지표가 사라지면 그 지표의 파일도 저장소에서 지운다. (실패해도 다음에 앱을 열 때 정리된다)
    void deleteFiles((target.attachments ?? []).map((file) => file.id)).catch(() => undefined);
  };

  /** 지표 세부 화면에서 바뀐 개선조치·추진과제·첨부파일 정보를 지표에 넣는다. 비어 있으면 그 칸을 없앤다. */
  const handleDetailUpdate = (index: number, patch: DetailPatch) => {
    setIndicators((current) =>
      current.map((item, i) => {
        if (i !== index) return item;
        const next: Indicator = { ...item, ...patch };
        for (const key of ["actions", "tasks", "attachments"] as const) {
          if (key in patch && (next[key] ?? []).length === 0) delete next[key];
        }
        return next;
      }),
    );
  };

  const handleClearAll = () => {
    const fileTotal = totalAttachmentBytes(indicators) > 0;
    if (
      !window.confirm(
        `지표 ${indicators.length}건을 모두 지울까요? (샘플 지표도 함께 지워집니다${fileTotal ? ", 올려 둔 파일도 이 컴퓨터에서 지워집니다" : ""})`,
      )
    ) {
      return;
    }
    setIndicators([]);
    setSelection(null);
    setDetailIndex(null);
    resetView();
    void clearAllFiles().catch(() => undefined);
  };

  /** 지표가 하나도 없을 때 둘러보기용 샘플 지표를 넣는다. (부점 이름은 지금 입력한 이름으로 맞춘다) */
  const handleLoadSamples = () => {
    setIndicators(SAMPLE_INDICATORS.map((item) => ({ ...item, branch })));
  };

  // ── 엑셀 양식 받기·올리기·내보내기 ────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadNotice, setUploadNotice] = useState<UploadNotice | null>(null);
  const [excelBusy, setExcelBusy] = useState(false);

  /** 엑셀 양식(.xlsx)을 만들어 내려받는다. 양식에는 화면에 입력한 부점 이름이 미리 적혀 있다. */
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
        details: [
          "엑셀에서 \"지표\" 시트에 지표를 적고 저장한 뒤, \"엑셀 올리기\"로 올려 주세요. 월별 실적·개선조치·추진과제 시트는 필요할 때만 쓰시면 됩니다. 작성 방법은 \"작성 안내\" 시트에 있습니다.",
        ],
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

  /**
   * 현재 현황을 엑셀 파일로 저장한다.
   * 필터·정렬과 관계없이 항상 전체 지표를 내보내고, 입력 순서 그대로 적는다.
   * 보완사항이 빈 부진지표가 있어도 막지 않고 경고만 보여준다.
   */
  const handleExport = async () => {
    if (rows === null || elapsedRate === null) return;
    setExcelBusy(true);
    setUploadNotice(null);
    try {
      const { buildExport } = await import("@/lib/excel");
      const fileName = exportFileName(referenceDate);
      downloadBytes(await buildExport({ rows, branch, referenceDate, elapsedRate }), fileName);

      const missing = rows.filter((row) => hasMissingNote(row.indicator, row.evaluation.status));
      const fileCount = indicators.reduce((sum, item) => sum + (item.attachments?.length ?? 0), 0);
      const fileNote =
        fileCount > 0
          ? ` 올려 둔 파일 ${fileCount}개는 엑셀에 들어가지 않으니(이름 목록만 들어갑니다) 원본을 따로 보관하세요.`
          : "";
      if (missing.length > 0) {
        setUploadNotice({
          kind: "warning",
          title: `엑셀 파일을 내보냈습니다. (${fileName}) 다만 보완사항이 비어 있는 부진지표가 ${missing.length}건 있습니다.`,
          details: [
            ...missing.slice(0, MAX_NOTICE_DETAILS).map((row) => `${row.indicator.name}: 보완사항을 적어 주세요.`),
            "파일에도 같은 경고를 적어 두었습니다. 보완사항을 적고 다시 내보내면 경고가 사라집니다.",
          ],
        });
      } else {
        setUploadNotice({
          kind: "success",
          title: `엑셀 파일을 내보냈습니다. (${fileName}) 지표 ${rows.length}건 전체가 들어 있습니다.`,
          details: [
            `이 파일은 백업이나 전달용입니다. "엑셀 올리기"로 다시 올릴 수 있고, 월별 실적·개선조치·추진과제도 함께 들어 있습니다.${fileNote}`,
          ],
        });
      }
    } catch {
      setUploadNotice({
        kind: "error",
        title: "엑셀 파일을 내보내지 못했습니다.",
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
      const { readWorkbook } = await import("@/lib/excel");
      const book = await readWorkbook(await file.arrayBuffer());
      const result = parseUploadedWorkbook(book, { branch, referenceDate });

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
          `기존 지표 ${indicators.length}건이 모두 사라지고, 올린 파일의 지표 ${result.indicators.length}건으로 바뀝니다. (같은 지표에 올려 둔 첨부파일은 그대로 이어집니다) 계속할까요?`,
        )
      ) {
        setUploadNotice({ kind: "error", title: "올리기를 취소했습니다. (기존 지표는 그대로입니다)", details: [] });
        return;
      }

      // 엑셀에는 파일 자체가 없으므로, 같은 지표(번호 또는 이름이 같은 지표)의 첨부파일 정보를 이어 준다.
      const next = ensureIds(carryOverAttachments(result.indicators, indicators));
      const orphans = orphanedAttachmentIds(indicators, next);
      setIndicators(next);
      setSelection(null);
      setDetailIndex(null);
      resetView();
      void deleteFiles(orphans).catch(() => undefined);
      setUploadNotice({
        kind: "success",
        title: `엑셀 파일에서 지표 ${next.length}건을 올렸습니다.`,
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

  // ── 화면에 쓸 값들 ──────────────────────────────────────────
  const delayedCount = rows?.filter((r) => r.evaluation.status === "delayed").length ?? 0;
  const normalCount = (rows?.length ?? 0) - delayedCount;
  // 부진인데 보완사항이 비어 있는 지표 수. (자료 기준일을 바꾸면 새로 생길 수 있다)
  const missingNoteCount =
    rows?.filter((r) => hasMissingNote(r.indicator, r.evaluation.status)).length ?? 0;

  const detailRow = detailIndex === null ? null : (rows?.find((row) => row.index === detailIndex) ?? null);
  const formOtherNames = indicators
    .filter((_, i) => !(formTarget?.mode === "edit" && formTarget.index === i))
    .map((item) => item.name);

  const panelTitle = selection === "all" ? "전체 지표" : `${selection} 지표`;

  return (
    <>
      {/* 시작 안내·저장 실패 안내 */}
      {startNotice && (
        <p
          role="status"
          data-testid="start-notice"
          className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-amber-300/40 bg-amber-300/10 text-amber-50 px-4 py-3 text-sm"
        >
          <span>{startNotice}</span>
          <button type="button" onClick={() => setStartNotice(null)} className={`${TOOL_BUTTON} shrink-0 px-2 py-0.5 text-xs`}>
            닫기
          </button>
        </p>
      )}
      {saveFailed && (
        <p
          role="alert"
          data-testid="save-failed"
          className="mb-4 rounded-2xl border border-red-400/40 bg-red-400/10 text-red-50 px-4 py-3 text-sm"
        >
          <strong>자동 저장에 실패했습니다.</strong> 이 브라우저의 저장 공간이 부족하거나 저장이 막혀 있습니다. 지금 입력한
          내용이 사라지지 않게 &quot;엑셀 내보내기&quot;로 백업해 주세요.
        </p>
      )}

      {/* ② 기준 정보 */}
      <section
        aria-label="기준 정보"
        className="glass-panel mb-5 p-5"
      >
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-foreground/70">부점</span>
            <input
              type="text"
              value={branchInput}
              onChange={(event) => handleBranchChange(event.target.value)}
              placeholder="부점 이름"
              maxLength={40}
              aria-invalid={branchReady ? undefined : true}
              data-testid="branch-input"
              className="field w-44"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-foreground/70">자료 기준일</span>
            <input
              type="date"
              value={referenceDate}
              onChange={(event) => setPickedDate(event.target.value)}
              className="field"
            />
          </label>
          <p className="text-sm">
            <span className="text-foreground/70">경과율 </span>
            <strong className="text-lg tabular-nums" data-testid="elapsed-rate">
              {elapsedRate === null ? EMPTY_MARK : formatPercent(elapsedRate)}
            </strong>
          </p>
        </div>
        <p className="mt-3 text-xs text-foreground/70" data-testid="save-notice">
          입력한 내용은 <strong>이 컴퓨터의 브라우저에 자동 저장</strong>됩니다. 서버로는 보내지 않으며, 다른 컴퓨터나 다른
          브라우저에서는 보이지 않습니다. 브라우저의 사이트 데이터를 지우면 사라지니 가끔 &quot;엑셀 내보내기&quot;로 백업해 두세요.
        </p>
        {!branchReady && (
          <p role="alert" className="mt-2 text-xs text-red-400">
            부점 이름을 입력해야 지표를 추가하거나 엑셀 양식·올리기·내보내기를 쓸 수 있습니다.
          </p>
        )}
      </section>

      {rows === null ? (
        <p
          role="status"
          className="rounded-3xl border border-dashed border-white/20 p-8 text-center text-sm"
        >
          {isReady ? "자료 기준일을 올바르게 선택해 주세요." : "자료 기준일을 확인하는 중입니다."}
        </p>
      ) : (
        <>
          {/* 보완사항이 빠진 부진지표 알림 */}
          {missingNoteCount > 0 && (
            <p
              role="status"
              data-testid="missing-note-alert"
              className="mb-4 rounded-2xl border border-red-400/40 bg-red-400/10 text-red-50 px-4 py-3 text-sm"
            >
              <strong>보완사항을 입력해야 하는 부진지표가 {missingNoteCount}건 있습니다.</strong>{" "}
              지표 구분을 눌러 펼친 표에서 &quot;보완사항 입력 필요&quot; 버튼을 눌러 보완사항을 적어 주세요.
            </p>
          )}

          {/* ④ 도구 줄: 지표 직접 입력, 엑셀 */}
          <section
            aria-label="지표 입력 도구"
            className="glass-panel panel-violet mb-8 flex flex-wrap items-center gap-3 p-5"
          >
            <button
              type="button"
              onClick={() => setFormTarget({ mode: "add" })}
              disabled={isFull || !branchReady}
              className="btn btn-primary"
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
              disabled={excelBusy || !branchReady}
              className={TOOL_BUTTON}
            >
              엑셀 양식 받기
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={excelBusy || !branchReady}
              className={TOOL_BUTTON}
            >
              엑셀 올리기
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={excelBusy || !branchReady || indicators.length === 0}
              title="필터·정렬과 관계없이 전체 지표를 내보냅니다."
              className={TOOL_BUTTON}
            >
              엑셀 내보내기
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

            {/* 엑셀 양식 받기·올리기·내보내기 결과 */}
            {uploadNotice && (
              <div
                role={uploadNotice.kind === "error" ? "alert" : "status"}
                data-testid="upload-notice"
                data-kind={uploadNotice.kind}
                className={`w-full rounded-2xl border px-4 py-3 text-sm ${
                  uploadNotice.kind === "error"
                    ? "border-red-400/40 bg-red-400/10"
                    : uploadNotice.kind === "warning"
                      ? "border-amber-300/40 bg-amber-300/10"
                      : "border-emerald-400/40 bg-emerald-400/10"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{uploadNotice.title}</p>
                  <button
                    type="button"
                    onClick={() => setUploadNotice(null)}
                    className="btn btn-sm shrink-0"
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

          {/* 대시보드: 지표 구분별 정상·보완 도넛 */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-gradient text-lg font-semibold">
              지표 구분별 현황{" "}
              <span className="text-sm font-normal text-foreground/70" data-testid="overall-summary">
                (전체 {rows.length}개 · 정상 {normalCount}개 · 보완 필요 {delayedCount}개)
              </span>
            </h2>
            <button
              type="button"
              onClick={toggleAll}
              aria-pressed={selection === "all"}
              disabled={rows.length === 0}
              data-testid="show-all"
              className={`${TOOL_BUTTON} ${selection === "all" ? "btn-active" : ""}`}
            >
              {selection === "all" ? "전체 지표 접기" : "전체 지표 보기"}
            </button>
          </div>
          <CategoryDonuts summaries={summaries} selected={selection} onSelect={selectCategory} />

          {/* 아래로 펼치는 세부 지표 */}
          {selection !== null && panelRows !== null && (
            <section
              aria-label={`${panelTitle} 세부 목록`}
              data-testid="detail-panel"
              className="glass-panel panel-amber mt-10 p-5"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-gradient text-lg font-semibold">
                  {panelTitle}{" "}
                  <span className="text-sm font-normal text-foreground/70">
                    {panelRows.visible.length === panelRows.base.length
                      ? `(${panelRows.base.length}건)`
                      : `(${panelRows.base.length}건 중 ${panelRows.visible.length}건 표시)`}
                  </span>
                </h2>
                <button type="button" onClick={() => setSelection(null)} className={TOOL_BUTTON}>
                  접기
                </button>
              </div>

              {/* 필터·정렬 */}
              <div
                role="group"
                aria-label="필터와 정렬"
                className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3"
              >
                <label className="flex items-center gap-2 pb-1 text-sm">
                  <input
                    type="checkbox"
                    checked={delayedOnly}
                    onChange={(event) => setDelayedOnly(event.target.checked)}
                    className="h-4 w-4"
                  />
                  보완 필요(부진) 지표만 보기
                </label>

                {selection === "all" && (
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-foreground/70">지표 구분</span>
                    <select
                      value={categoryFilter}
                      onChange={(event) => setCategoryFilter(event.target.value as IndicatorCategory | "")}
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
                )}

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

                {(hasActiveFilters({ delayedOnly, category: categoryFilter }) || sortKey !== "default") && (
                  <button type="button" onClick={resetView} className={TOOL_BUTTON}>
                    조건 초기화
                  </button>
                )}
              </div>

              {/* 막대 읽는 법 */}
              <p className="mb-3 text-xs text-foreground/70">
                막대 읽는 법: 막대 길이는 진척률(100%가 가득 찬 길이)이고, 세로선은 자료 기준일 시점의 경과율입니다.
                막대가 세로선보다 짧으면 시간보다 뒤처진 부진지표입니다. 막대 끝의 노란 조각은 100%를 넘긴 지표입니다.
                지표명을 누르면 필요 실적 역산, 월별 추이, 개선조치, 추진과제, 첨부파일을 볼 수 있습니다.
              </p>

              {panelRows.visible.length === 0 ? (
                <div role="status" className="rounded-3xl border border-dashed border-white/20 p-8 text-center text-sm">
                  {indicators.length === 0 ? (
                    <>
                      <p>등록된 지표가 없습니다. 위의 &quot;지표 추가&quot;나 &quot;엑셀 올리기&quot;로 지표를 입력해 주세요.</p>
                      <button
                        type="button"
                        onClick={handleLoadSamples}
                        disabled={!branchReady}
                        className={`${TOOL_BUTTON} mt-3`}
                      >
                        둘러보기용 샘플 지표 불러오기
                      </button>
                    </>
                  ) : panelRows.base.length === 0 ? (
                    <p>이 구분에 등록된 지표가 없습니다.</p>
                  ) : (
                    <p>
                      조건에 맞는 지표가 없습니다. 위의 필터를 바꾸거나 &quot;조건 초기화&quot;를 눌러 주세요.
                    </p>
                  )}
                </div>
              ) : (
                <IndicatorTable
                  rows={panelRows.visible}
                  onOpenDetail={setDetailIndex}
                  onEdit={(index) => setFormTarget({ mode: "edit", index })}
                  onDelete={handleDelete}
                />
              )}
            </section>
          )}

          {/* 지표가 하나도 없고 아무것도 펼치지 않았을 때의 안내 */}
          {indicators.length === 0 && selection === null && (
            <div role="status" className="mt-4 rounded-3xl border border-dashed border-white/20 p-6 text-center text-sm">
              <p>등록된 지표가 없습니다. 위의 &quot;지표 추가&quot;나 &quot;엑셀 올리기&quot;로 지표를 입력해 주세요.</p>
              <button type="button" onClick={handleLoadSamples} disabled={!branchReady} className={`${TOOL_BUTTON} mt-3`}>
                둘러보기용 샘플 지표 불러오기
              </button>
            </div>
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
          otherNames={formOtherNames}
          onSubmit={handleSubmit}
          onCancel={() => setFormTarget(null)}
        />
      )}

      {/* 지표 세부 화면: 역산·월별 추이·개선조치·추진과제·첨부파일 */}
      {detailRow && (
        <IndicatorDetail
          key={detailRow.index}
          indicator={detailRow.indicator}
          evaluation={detailRow.evaluation}
          referenceDate={referenceDate}
          totalAttachmentBytes={totalAttachmentBytes(indicators)}
          onClose={() => setDetailIndex(null)}
          onEdit={() => setFormTarget({ mode: "edit", index: detailRow.index })}
          onUpdate={(patch) => handleDetailUpdate(detailRow.index, patch)}
        />
      )}
    </>
  );
}
