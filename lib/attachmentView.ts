// Design Ref: §16 첨부파일 — 올린 파일을 화면에서 어떻게 보여주고 다시 열지 정하는 규칙.
// Plan SC: 작업 19 — 올린 자료를 뷰어(브라우저에서 바로 보기)나 내려받기로 다시 확인한다.

/** 파일 크기를 사람이 읽기 쉬운 글자로 바꾼다. (예: 512 B, 2.5 KB, 3.1 MB) */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 파일 이름의 확장자(소문자, 점 없이). 없으면 빈 글자 */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 || dot === name.length - 1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** 브라우저가 별도 프로그램 없이 바로 보여줄 수 있는 확장자 */
const PREVIEWABLE_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "gif", "webp", "txt", "csv"]);

/** 브라우저가 별도 프로그램 없이 바로 보여줄 수 있는 파일 형식(MIME) */
const PREVIEWABLE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
]);

/**
 * 새 탭에서 바로 열어 볼 수 있는 파일이면 true. (PDF·이미지·글자 파일)
 * 한글(.hwp)·엑셀·워드 같은 파일은 브라우저가 열 수 없어서 false이고, 내려받아 해당 프로그램으로 열어야 한다.
 */
export function canPreviewInBrowser(file: { name: string; type: string }): boolean {
  return PREVIEWABLE_TYPES.has(file.type) || PREVIEWABLE_EXTENSIONS.has(extensionOf(file.name));
}

/** 파일 종류를 한 글자 안내로 보여준다. (목록에서 어떤 파일인지 알아보기 쉽게) */
export function fileKindLabel(file: { name: string }): string {
  switch (extensionOf(file.name)) {
    case "hwp":
    case "hwpx":
      return "한글";
    case "xls":
    case "xlsx":
    case "xlsm":
    case "csv":
      return "엑셀";
    case "pdf":
      return "PDF";
    case "doc":
    case "docx":
      return "워드";
    case "ppt":
    case "pptx":
      return "파워포인트";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
      return "이미지";
    case "txt":
      return "글자";
    default:
      return "파일";
  }
}
