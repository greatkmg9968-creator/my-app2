// Plan SC: 작업 18(개선조치·추진과제), 작업 19(첨부파일) — 지표에 붙는 기록의 입력 검사와 보조 규칙

import { describe, expect, it } from "vitest";
import type { Indicator } from "@/types/indicator";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_INDICATOR,
  MAX_TOTAL_ATTACHMENT_BYTES,
  carryOverAttachments,
  checkAttachmentFile,
  emptyActionValues,
  emptyTaskValues,
  ensureIds,
  findDuplicateNames,
  newId,
  orphanedAttachmentIds,
  sanitizeActions,
  sanitizeAttachments,
  sanitizeTasks,
  totalAttachmentBytes,
  validateAction,
  validateTask,
} from "./records";

function makeIndicator(name: string, overrides: Partial<Indicator> = {}): Indicator {
  return {
    branch: "테스트부점",
    category: "공통 비계량",
    name,
    item: "항목",
    method: "방법",
    weight: 3,
    progress: 80,
    expected: 90,
    evalDate: "2026-10-15",
    ...overrides,
  };
}

const file = (id: string, size = 1000) => ({
  id,
  kind: "실적자료" as const,
  name: `${id}.pdf`,
  size,
  type: "application/pdf",
  addedAt: "2026-10-01T00:00:00.000Z",
});

describe("validateAction (개선조치)", () => {
  const valid = { date: "2026-09-10", content: " 법인 상담 ", owner: " 김부장 ", status: "완료", effect: " 12억 유치 " };

  it("올바른 입력은 앞뒤 공백을 지운 개선조치가 된다", () => {
    const { errors, action } = validateAction(valid);
    expect(errors).toEqual({});
    expect(action).toEqual({ date: "2026-09-10", content: "법인 상담", owner: "김부장", status: "완료", effect: "12억 유치" });
  });
  it("효과 메모는 비워도 되고, 비우면 저장하지 않는다", () => {
    expect(validateAction({ ...valid, effect: "  " }).action?.effect).toBeUndefined();
  });
  it("날짜·내용·담당자·상태가 올바르지 않으면 칸별로 오류를 알려준다", () => {
    const { errors, action } = validateAction({ date: "2026-02-30", content: " ", owner: "", status: "끝남", effect: "" });
    expect(action).toBeNull();
    expect(errors.date).toBeDefined();
    expect(errors.content).toBeDefined();
    expect(errors.owner).toBeDefined();
    expect(errors.status).toBeDefined();
  });
  it("너무 긴 글은 거부한다", () => {
    expect(validateAction({ ...valid, content: "가".repeat(501) }).errors.content).toContain("500자");
    expect(validateAction({ ...valid, owner: "가".repeat(51) }).errors.owner).toContain("50자");
  });
  it("진행 상태는 예정·진행·완료 세 가지만 받는다", () => {
    for (const status of ["예정", "진행", "완료"]) expect(validateAction({ ...valid, status }).action).not.toBeNull();
    expect(validateAction({ ...valid, status: "" }).action).toBeNull();
  });
  it("빈 폼의 기본 상태는 예정이다", () => {
    expect(emptyActionValues("2026-10-15")).toMatchObject({ date: "2026-10-15", status: "예정" });
  });
});

describe("validateTask (추진과제)", () => {
  const valid = { title: " 법인 캠페인 ", due: "2026-12-15", owner: " 영업팀 ", status: "진행" };

  it("올바른 입력은 추진과제가 된다", () => {
    const { errors, task } = validateTask(valid);
    expect(errors).toEqual({});
    expect(task).toEqual({ title: "법인 캠페인", due: "2026-12-15", owner: "영업팀", status: "진행" });
  });
  it("기한은 비워도 된다. 적었다면 올바른 날짜여야 한다", () => {
    expect(validateTask({ ...valid, due: "" }).task?.due).toBeUndefined();
    expect(validateTask({ ...valid, due: "2026-13-01" }).errors.due).toBeDefined();
  });
  it("과제명·담당자·상태가 올바르지 않으면 거부한다", () => {
    const { errors, task } = validateTask({ title: "", due: "", owner: " ", status: "?" });
    expect(task).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(["owner", "status", "title"]);
  });
  it("빈 폼의 기본 상태는 예정이다", () => {
    expect(emptyTaskValues().status).toBe("예정");
  });
});

describe("sanitize* (저장소·엑셀에서 읽은 값을 걸러낸다)", () => {
  it("개선조치: 올바른 것만 남기고, 배열이 아니면 빈 목록", () => {
    const result = sanitizeActions([
      { date: "2026-09-10", content: "조치", owner: "김", status: "완료" },
      { date: "잘못된", content: "조치", owner: "김", status: "완료" },
      null,
      "문자열",
      { content: 5 },
    ]);
    expect(result).toHaveLength(1);
    expect(sanitizeActions("x")).toEqual([]);
    expect(sanitizeActions(undefined)).toEqual([]);
  });
  it("추진과제: 올바른 것만 남긴다", () => {
    expect(sanitizeTasks([{ title: "과제", owner: "팀", status: "예정" }, { title: "", owner: "팀", status: "예정" }])).toHaveLength(1);
  });
  it("첨부파일 정보: 번호·이름·구분·크기가 올바른 것만 남기고 크기 제한을 넘는 것은 버린다", () => {
    const result = sanitizeAttachments([
      file("a"),
      { ...file("b"), kind: "기타" },
      { ...file("c"), size: MAX_ATTACHMENT_BYTES + 1 },
      { ...file("d"), size: -1 },
      { ...file("e"), id: "" },
      { id: "f", name: "x", kind: "추진과제", size: "큼" },
    ]);
    expect(result.map((f) => f.id)).toEqual(["a"]);
  });
  it("개수 제한을 넘는 기록은 앞에서부터 제한 수만큼만 남긴다", () => {
    const many = Array.from({ length: MAX_ATTACHMENTS_PER_INDICATOR + 5 }, (_, i) => file(`f${i}`));
    expect(sanitizeAttachments(many)).toHaveLength(MAX_ATTACHMENTS_PER_INDICATOR);
  });
});

describe("checkAttachmentFile (첨부파일 제한)", () => {
  const empty = { countInIndicator: 0, totalBytes: 0 };
  it("제한 안이면 통과(null)한다", () => {
    expect(checkAttachmentFile({ name: "a.pdf", size: 1024 }, empty)).toBeNull();
    expect(checkAttachmentFile({ name: "a.pdf", size: MAX_ATTACHMENT_BYTES }, empty)).toBeNull();
  });
  it("빈 파일, 파일 하나 10MB 초과를 거부한다", () => {
    expect(checkAttachmentFile({ name: "a.pdf", size: 0 }, empty)).toContain("빈 파일");
    expect(checkAttachmentFile({ name: "a.pdf", size: MAX_ATTACHMENT_BYTES + 1 }, empty)).toContain("10MB");
  });
  it("한 지표에 20개를 넘게 올릴 수 없다", () => {
    expect(checkAttachmentFile({ name: "a.pdf", size: 10 }, { countInIndicator: MAX_ATTACHMENTS_PER_INDICATOR, totalBytes: 0 })).toContain("20개");
  });
  it("전체 크기가 200MB를 넘게 되면 거부한다", () => {
    expect(
      checkAttachmentFile({ name: "a.pdf", size: 1024 }, { countInIndicator: 0, totalBytes: MAX_TOTAL_ATTACHMENT_BYTES }),
    ).toContain("200MB");
    expect(
      checkAttachmentFile({ name: "a.pdf", size: 1024 }, { countInIndicator: 0, totalBytes: MAX_TOTAL_ATTACHMENT_BYTES - 1024 }),
    ).toBeNull();
  });
  it("모든 지표의 첨부파일 크기를 합한다", () => {
    expect(
      totalAttachmentBytes([makeIndicator("a", { attachments: [file("1", 100), file("2", 50)] }), makeIndicator("b"), makeIndicator("c", { attachments: [file("3", 25)] })]),
    ).toBe(175);
  });
});

describe("지표 번호와 이름", () => {
  it("findDuplicateNames: 앞뒤 공백·대소문자만 다른 이름도 같은 이름으로 본다", () => {
    expect(findDuplicateNames(["가", "나", "다"])).toEqual([]);
    expect(findDuplicateNames(["가", " 가 ", "나", "Na", "na"])).toEqual(["가", "Na"]);
  });
  it("newId: 매번 다른 번호를 만든다", () => {
    expect(newId()).not.toBe(newId());
    expect(newId()).not.toBe("");
  });
  it("ensureIds: 번호가 없는 지표에만 번호를 붙이고, 이미 있는 번호는 그대로 둔다", () => {
    let n = 0;
    const result = ensureIds([makeIndicator("a", { id: "keep" }), makeIndicator("b")], () => `new-${++n}`);
    expect(result.map((i) => i.id)).toEqual(["keep", "new-1"]);
  });
  it("ensureIds: 번호가 겹치면 뒤쪽 지표에 새 번호를 준다", () => {
    let n = 0;
    const result = ensureIds([makeIndicator("a", { id: "same" }), makeIndicator("b", { id: "same" })], () => `new-${++n}`);
    expect(result.map((i) => i.id)).toEqual(["same", "new-1"]);
  });
  it("ensureIds: 원래 지표 객체는 바꾸지 않는다", () => {
    const original = makeIndicator("a");
    ensureIds([original], () => "x");
    expect(original.id).toBeUndefined();
  });
});

describe("carryOverAttachments (엑셀로 바꿔도 첨부파일을 이어 준다)", () => {
  const previous = [
    makeIndicator("수신", { id: "id-1", attachments: [file("f1")] }),
    makeIndicator("여신", { id: "id-2", attachments: [file("f2"), file("f3")] }),
    makeIndicator("카드", { id: "id-3" }),
  ];

  it("같은 번호의 이전 지표가 있으면 첨부파일 정보를 옮긴다", () => {
    const result = carryOverAttachments([makeIndicator("이름 바뀜", { id: "id-1" })], previous);
    expect(result[0].attachments?.map((f) => f.id)).toEqual(["f1"]);
    expect(result[0].id).toBe("id-1");
  });
  it("번호가 없으면 같은 이름으로 찾아서 번호와 첨부파일을 함께 옮긴다", () => {
    const result = carryOverAttachments([makeIndicator(" 여신 ")], previous);
    expect(result[0].id).toBe("id-2");
    expect(result[0].attachments).toHaveLength(2);
  });
  it("이전에 없던 지표는 그대로 둔다", () => {
    const fresh = makeIndicator("새 지표");
    expect(carryOverAttachments([fresh], previous)[0]).toEqual(fresh);
  });
  it("이전 지표에 첨부파일이 없으면 첨부파일 칸을 만들지 않는다", () => {
    expect(carryOverAttachments([makeIndicator("카드")], previous)[0].attachments).toBeUndefined();
  });
});

describe("orphanedAttachmentIds (지표에서 떨어져 나간 파일)", () => {
  it("이전 목록에는 있고 새 목록에는 없는 첨부파일 번호만 돌려준다", () => {
    const before = [makeIndicator("a", { attachments: [file("f1"), file("f2")] }), makeIndicator("b", { attachments: [file("f3")] })];
    const after = [makeIndicator("a", { attachments: [file("f2")] })];
    expect(orphanedAttachmentIds(before, after).sort()).toEqual(["f1", "f3"]);
  });
  it("아무것도 사라지지 않았으면 빈 목록", () => {
    const list = [makeIndicator("a", { attachments: [file("f1")] })];
    expect(orphanedAttachmentIds(list, list)).toEqual([]);
  });
});
