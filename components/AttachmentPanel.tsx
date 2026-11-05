"use client";

// Design Ref: §16 첨부파일 — 지표별 추진과제·실적자료 파일을 이 컴퓨터의 브라우저에 저장하고, 다시 열거나 내려받는다.
// Plan SC: 작업 19 — 각 지표별 추진과제·실적자료 파일(한글·엑셀·PDF 등) 업로드. 나만 올리고 나만 열어본다.
//
// 파일 내용은 브라우저 저장소(IndexedDB)에만 있고 서버로는 가지 않는다. 다른 컴퓨터에서는 보이지 않는다.

import { useId, useRef, useState } from "react";
import { deleteFiles, isFileStorageAvailable, loadFile, saveFile } from "@/lib/attachmentStore";
import {
  canPreviewInBrowser,
  fileKindLabel,
  formatFileSize,
} from "@/lib/attachmentView";
import {
  MAX_ATTACHMENTS_PER_INDICATOR,
  checkAttachmentFile,
  newId,
} from "@/lib/records";
import {
  ATTACHMENT_KINDS,
  type AttachmentKind,
  type AttachmentMeta,
} from "@/types/indicator";

interface AttachmentPanelProps {
  /** 이 지표에 올려 둔 파일 정보 */
  attachments: AttachmentMeta[];
  /** 모든 지표의 파일 크기 합계(바이트). 전체 크기 제한을 확인하는 데 쓴다. */
  totalBytes: number;
  /** 파일 정보 목록이 바뀌었을 때 (올림·삭제) */
  onChange: (next: AttachmentMeta[]) => void;
}

/** 파일 선택창에서 보여줄 형식. 한글·엑셀·PDF·워드·파워포인트·이미지·글자 파일 */
const ACCEPT = ".hwp,.hwpx,.xls,.xlsx,.xlsm,.csv,.pdf,.doc,.docx,.ppt,.pptx,.txt,.png,.jpg,.jpeg";

const SMALL_BUTTON =
  "btn btn-sm";

/** 파일 내용을 브라우저가 내려받게 한다. */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // 내려받기가 시작될 시간을 준 뒤 임시 주소를 지운다.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 올린 시각(ISO 글자)을 "2026-10-01"로 줄인다. */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

export default function AttachmentPanel({ attachments, totalBytes, onChange }: AttachmentPanelProps) {
  const baseId = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const inputs = useRef<Partial<Record<AttachmentKind, HTMLInputElement | null>>>({});
  const available = isFileStorageAvailable();

  /** 고른 파일들을 하나씩 검사하고 저장한다. 하나가 실패해도 나머지는 계속한다. */
  const handleFiles = async (kind: AttachmentKind, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setMessage(null);

    let current = attachments;
    let bytes = totalBytes;
    const problems: string[] = [];
    let added = 0;

    for (const file of Array.from(fileList)) {
      const problem = checkAttachmentFile(file, { countInIndicator: current.length, totalBytes: bytes });
      if (problem) {
        problems.push(problem);
        continue;
      }
      const meta: AttachmentMeta = {
        id: newId(),
        kind,
        name: file.name.slice(0, 200),
        size: file.size,
        type: file.type,
        addedAt: new Date().toISOString(),
      };
      try {
        await saveFile(meta.id, file);
        current = [...current, meta];
        bytes += file.size;
        added += 1;
      } catch {
        problems.push(`"${file.name}"을(를) 저장하지 못했습니다. 브라우저의 저장 공간이 부족할 수 있습니다.`);
      }
    }

    if (added > 0) onChange(current);
    setBusy(false);
    if (problems.length > 0) {
      setMessage({ kind: "error", text: problems.join(" ") });
    } else if (added > 0) {
      setMessage({ kind: "success", text: `${added}개 파일을 저장했습니다.` });
    }
    // 같은 파일을 다시 올릴 수 있게 선택값을 비운다.
    const input = inputs.current[kind];
    if (input) input.value = "";
  };

  /** 바로 열 수 있는 파일은 새 탭에서 열고, 아니면 내려받는다. */
  const open = async (meta: AttachmentMeta) => {
    setMessage(null);
    try {
      const blob = await loadFile(meta.id);
      if (!blob) {
        setMessage({ kind: "error", text: `"${meta.name}" 파일을 찾지 못했습니다. 브라우저 저장 자료를 지웠을 수 있습니다.` });
        return;
      }
      if (canPreviewInBrowser(meta)) {
        // 형식을 알려 주어야 PDF·이미지가 새 탭에서 바로 보인다.
        const typed = blob.type ? blob : new Blob([blob], { type: meta.type });
        const url = URL.createObjectURL(typed);
        window.open(url, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        downloadBlob(blob, meta.name);
        setMessage({ kind: "success", text: `"${meta.name}"을(를) 내려받았습니다. 해당 프로그램(한글·엑셀 등)으로 열어 주세요.` });
      }
    } catch {
      setMessage({ kind: "error", text: "파일을 열지 못했습니다." });
    }
  };

  const download = async (meta: AttachmentMeta) => {
    setMessage(null);
    try {
      const blob = await loadFile(meta.id);
      if (!blob) {
        setMessage({ kind: "error", text: `"${meta.name}" 파일을 찾지 못했습니다.` });
        return;
      }
      downloadBlob(blob, meta.name);
    } catch {
      setMessage({ kind: "error", text: "파일을 내려받지 못했습니다." });
    }
  };

  const remove = async (meta: AttachmentMeta) => {
    if (!window.confirm(`"${meta.name}" 파일을 삭제할까요? (이 컴퓨터에서 지워지며 되돌릴 수 없습니다)`)) return;
    setMessage(null);
    try {
      await deleteFiles([meta.id]);
    } catch {
      // 저장소에서 못 지워도 목록에서는 뺀다. (남은 파일은 다음에 앱을 열 때 정리된다)
    }
    onChange(attachments.filter((item) => item.id !== meta.id));
  };

  if (!available) {
    return (
      <p role="alert" className="text-sm text-red-400">
        이 브라우저에서는 파일 저장소를 쓸 수 없어서 파일을 올릴 수 없습니다. (시크릿 창이거나 저장이 막혀 있을 수 있습니다)
      </p>
    );
  }

  return (
    <div data-testid="attachment-panel">
      <p className="mb-3 text-xs text-foreground/70">
        올린 파일은 <strong>이 컴퓨터의 브라우저에만 저장</strong>되고 서버로 보내지 않습니다. 다른 컴퓨터에서는 보이지 않으며,
        브라우저의 사이트 데이터를 지우면 함께 사라집니다. 파일 하나당 10MB, 전체 200MB, 한 지표에 {MAX_ATTACHMENTS_PER_INDICATOR}개까지입니다.
        엑셀 내보내기에는 파일 이름 목록만 들어가고 파일은 들어가지 않으니, 원본 파일은 따로 보관해 주세요.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {ATTACHMENT_KINDS.map((kind) => {
          const inputId = `${baseId}-${kind}`;
          const files = attachments.filter((item) => item.kind === kind);
          return (
            <section key={kind} aria-label={`${kind} 파일`} className="rounded-2xl border border-white/10 bg-white/[.03] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">
                  {kind === "추진과제" ? "추진과제 자료" : "실적자료"} ({files.length})
                </h4>
                <label
                  htmlFor={inputId}
                  className={`btn btn-primary btn-sm ${
                    busy ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  파일 올리기
                </label>
                <input
                  id={inputId}
                  ref={(element) => {
                    inputs.current[kind] = element;
                  }}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  disabled={busy}
                  onChange={(event) => void handleFiles(kind, event.target.files)}
                  className="sr-only"
                  data-testid={`file-input-${kind}`}
                />
              </div>

              {files.length === 0 ? (
                <p className="text-sm text-foreground/70">올린 파일이 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {files.map((meta) => (
                    <li key={meta.id} className="rounded-xl border border-white/10 bg-white/[.03] p-2 text-sm" data-testid="attachment-item">
                      <p className="break-all font-medium">{meta.name}</p>
                      <p className="mt-0.5 text-xs text-foreground/70">
                        {fileKindLabel(meta)} · {formatFileSize(meta.size)} · {dayOf(meta.addedAt)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" className={SMALL_BUTTON} onClick={() => void open(meta)}>
                          {canPreviewInBrowser(meta) ? "열어보기" : "내려받아 열기"}
                        </button>
                        {canPreviewInBrowser(meta) && (
                          <button type="button" className={SMALL_BUTTON} onClick={() => void download(meta)}>
                            내려받기
                          </button>
                        )}
                        <button type="button" className={SMALL_BUTTON} onClick={() => void remove(meta)}>
                          삭제
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          data-testid="attachment-message"
          className={`mt-3 text-sm ${message.kind === "error" ? "text-red-400" : "text-emerald-400"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
