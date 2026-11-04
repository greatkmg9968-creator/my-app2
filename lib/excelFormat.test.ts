// Plan SC: 작업 11 — 올릴 파일의 형식·크기 제한(.xlsx, 5MB 이하)과 머리글 비교 규칙

import { describe, expect, it } from "vitest";
import {
  checkUploadFile,
  EXCEL_COLUMNS,
  FIELD_LABELS,
  MAX_UPLOAD_BYTES,
  normalizeHeader,
  REQUIRED_HEADERS,
} from "./excelFormat";

describe("checkUploadFile", () => {
  it(".xlsx이고 5MB 이하면 통과(null)한다", () => {
    expect(checkUploadFile({ name: "지표.xlsx", size: 1024 })).toBeNull();
    expect(checkUploadFile({ name: "지표.XLSX", size: MAX_UPLOAD_BYTES })).toBeNull();
  });
  it("5MB를 넘으면 거부한다", () => {
    expect(checkUploadFile({ name: "지표.xlsx", size: MAX_UPLOAD_BYTES + 1 })).toContain("5MB");
  });
  it(".xlsx가 아니면 거부한다 (.xls, .csv, .hwp 포함)", () => {
    for (const name of ["지표.xls", "지표.csv", "지표.hwp", "지표.xlsx.exe", "지표"]) {
      expect(checkUploadFile({ name, size: 1024 })).toContain(".xlsx");
    }
  });
  it("빈 파일은 거부한다", () => {
    expect(checkUploadFile({ name: "지표.xlsx", size: 0 })).toContain("빈 파일");
  });
});

describe("열 정의", () => {
  it("열이 13개이고 머리글이 겹치지 않는다", () => {
    expect(EXCEL_COLUMNS).toHaveLength(13);
    expect(new Set(REQUIRED_HEADERS).size).toBe(13);
  });
  it("모든 열에 오류 문구용 이름이 있다", () => {
    for (const column of EXCEL_COLUMNS) {
      expect(FIELD_LABELS[column.key]).toBe(column.header);
    }
  });
  it("머리글 비교는 공백을 무시한다", () => {
    expect(normalizeHeader(" 지표 구분 ")).toBe("지표구분");
    expect(normalizeHeader("세부 평가\t항목")).toBe("세부평가항목");
  });
});
