// Plan SC: 작업 19 — 첨부파일 표시 규칙 (크기 표기, 바로 열기 가능 여부, 종류 이름)

import { describe, expect, it } from "vitest";
import { canPreviewInBrowser, extensionOf, fileKindLabel, formatFileSize } from "./attachmentView";

describe("formatFileSize", () => {
  it("크기에 맞는 단위로 소수 첫째 자리까지 보여준다", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(2560)).toBe("2.5 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10.0 MB");
  });
  it("올바르지 않은 값은 '-'", () => {
    expect(formatFileSize(-1)).toBe("-");
    expect(formatFileSize(Number.NaN)).toBe("-");
  });
});

describe("extensionOf", () => {
  it("마지막 점 뒤를 소문자로 돌려준다", () => {
    expect(extensionOf("3분기_실적.PDF")).toBe("pdf");
    expect(extensionOf("보고서.final.xlsx")).toBe("xlsx");
  });
  it("확장자가 없거나 점으로 끝나면 빈 글자", () => {
    expect(extensionOf("README")).toBe("");
    expect(extensionOf("파일.")).toBe("");
  });
});

describe("canPreviewInBrowser", () => {
  it("PDF·이미지·글자 파일은 바로 열 수 있다 (형식 또는 확장자로 판단)", () => {
    expect(canPreviewInBrowser({ name: "a.pdf", type: "application/pdf" })).toBe(true);
    expect(canPreviewInBrowser({ name: "a.PDF", type: "" })).toBe(true);
    expect(canPreviewInBrowser({ name: "사진.jpg", type: "image/jpeg" })).toBe(true);
    expect(canPreviewInBrowser({ name: "메모.txt", type: "" })).toBe(true);
  });
  it("한글·엑셀·워드·파워포인트는 바로 열 수 없어 내려받아야 한다", () => {
    for (const name of ["보고서.hwp", "보고서.hwpx", "실적.xlsx", "실적.xls", "문서.docx", "발표.pptx"]) {
      expect(canPreviewInBrowser({ name, type: "" })).toBe(false);
    }
  });
});

describe("fileKindLabel", () => {
  it("한글·엑셀·PDF 등 종류 이름을 돌려준다", () => {
    expect(fileKindLabel({ name: "a.hwp" })).toBe("한글");
    expect(fileKindLabel({ name: "a.HWPX" })).toBe("한글");
    expect(fileKindLabel({ name: "a.xlsx" })).toBe("엑셀");
    expect(fileKindLabel({ name: "a.pdf" })).toBe("PDF");
    expect(fileKindLabel({ name: "a.docx" })).toBe("워드");
    expect(fileKindLabel({ name: "a.png" })).toBe("이미지");
    expect(fileKindLabel({ name: "a.zip" })).toBe("파일");
    expect(fileKindLabel({ name: "noext" })).toBe("파일");
  });
});
