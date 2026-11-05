// Design Ref: §17 질의응답 — 올려 둔 파일에서 글자를 뽑는다. 파일은 브라우저 밖으로 나가지 않는다.
// Plan SC: 작업 20 — 엑셀·텍스트·CSV·PDF·워드의 글자를 읽는다. 한글(HWP)·이미지·스캔 PDF는 읽지 못한다.
//
// 큰 라이브러리(PDF·워드)는 필요할 때만 불러온다. 브라우저에서만 쓸 수 있다.

/** 글자를 읽을 수 있는 파일 형식 */
const READABLE = new Set(["txt", "csv", "md", "xlsx", "xlsm", "pdf", "docx"]);

/** 파일 이름에서 확장자(소문자)를 꺼낸다. 없으면 빈 문자열 */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** 이 파일 형식의 글자를 읽을 수 있으면 true */
export function canExtractText(name: string): boolean {
  return READABLE.has(fileExtension(name));
}

/** 읽을 수 없는 형식일 때 보여줄 이유 */
export function unreadableReason(name: string): string {
  const ext = fileExtension(name);
  if (ext === "hwp" || ext === "hwpx") return "한글(HWP) 파일은 글자를 읽을 수 없습니다";
  if (["png", "jpg", "jpeg"].includes(ext)) return "이미지는 글자를 읽을 수 없습니다";
  if (["doc", "ppt", "pptx", "xls"].includes(ext)) return "이 형식은 글자를 읽을 수 없습니다 (xlsx·docx·pdf로 저장해 올려 주세요)";
  return "이 형식은 글자를 읽을 수 없습니다";
}

/** 엑셀 통합 문서의 모든 시트에서 글자를 뽑는다. 한 줄이 한 문장이 되도록 셀을 " | "로 잇는다. */
async function extractExcel(buffer: ArrayBuffer): Promise<string> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const lines: string[] = [];
  workbook.eachSheet((sheet) => {
    lines.push(`[${sheet.name}]`);
    sheet.eachRow((row) => {
      const cells: string[] = [];
      row.eachCell((cell) => {
        const text = cell.text?.toString().trim();
        if (text) cells.push(text);
      });
      if (cells.length > 0) lines.push(cells.join(" | "));
    });
  });
  return lines.join("\n");
}

/** PDF의 모든 쪽에서 글자를 뽑는다. 글자가 없는 스캔 PDF는 빈 글이 된다. */
async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      let line = "";
      const lines: string[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = "";
        } else if (item.str !== "") {
          line += " ";
        }
      }
      if (line.trim() !== "") lines.push(line);
      pages.push(lines.join("\n"));
    }
  } finally {
    await doc.destroy();
  }
  return pages.join("\n");
}

/** 워드(.docx)에서 글자를 뽑는다. */
async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

/** 파일에서 글자를 뽑는다. 읽을 수 없는 형식이면 null, 읽는 중 오류가 나면 던진다. */
export async function extractText(file: Blob, name: string): Promise<string | null> {
  const ext = fileExtension(name);
  if (!READABLE.has(ext)) return null;
  if (ext === "txt" || ext === "csv" || ext === "md") return await file.text();
  const buffer = await file.arrayBuffer();
  if (ext === "xlsx" || ext === "xlsm") return await extractExcel(buffer);
  if (ext === "pdf") return await extractPdf(buffer);
  return await extractDocx(buffer);
}
