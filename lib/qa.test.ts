// 질의응답 규칙(lib/qa.ts)과 자료 검색(lib/docSearch.ts)을 샘플 지표로 확인한다.

import { describe, expect, it } from "vitest";
import { evaluateIndicator } from "@/lib/calc";
import { excerpt, looksLikeDocumentQuestion, queryTerms, searchChunks, splitIntoChunks, type DocChunk } from "@/lib/docSearch";
import type { IndicatorRow } from "@/lib/filterSort";
import { answerIndicatorQuestion, detectLimit, detectScope, matchesScope } from "@/lib/qa";
import { SAMPLE_INDICATORS } from "@/lib/fixtureData";

const REFERENCE = "2026-10-15";
const rows: IndicatorRow[] = SAMPLE_INDICATORS.map((indicator, index) => ({
  indicator,
  evaluation: evaluateIndicator(indicator, REFERENCE),
  index,
}));

describe("질문에서 조건 읽기", () => {
  it("계량과 비계량을 구분한다", () => {
    expect(detectScope("비계량 지표 알려줘")).toEqual({ scope: null, quant: "비계량" });
    expect(detectScope("부점 계량 중에서")).toEqual({ scope: "부점", quant: "계량" });
    expect(detectScope("공통 비 계량")).toEqual({ scope: "공통", quant: "비계량" });
    expect(detectScope("부진지표")).toEqual({ scope: null, quant: null });
  });

  it("지표 구분이 조건에 맞는지 본다", () => {
    expect(matchesScope("부점 비계량", { scope: null, quant: "비계량" })).toBe(true);
    expect(matchesScope("공통 비계량", { scope: "부점", quant: "비계량" })).toBe(false);
    expect(matchesScope("공통 계량", { scope: null, quant: "계량" })).toBe(true);
    expect(matchesScope("공통 비계량", { scope: null, quant: "계량" })).toBe(false);
  });

  it("개수 표현을 읽는다", () => {
    expect(detectLimit("낮은 것부터 5개 알려줘")).toBe(5);
    expect(detectLimit("상위 3")).toBe(3);
    expect(detectLimit("세 개만")).toBe(3);
    expect(detectLimit("부진지표 알려줘")).toBeNull();
  });
});

describe("지표 질문에 답하기", () => {
  it("부진지표를 진척률 낮은 순으로 5개 보여준다", () => {
    const result = answerIndicatorQuestion("부진지표 진척률 낮은 것부터 5개 알려줘", rows);
    expect(result?.rows).toHaveLength(5);
    const progress = result?.rows?.map((row) => row.progress) ?? [];
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(result?.rows?.every((row) => row.status === "delayed")).toBe(true);
  });

  it("부진지표 개수는 실제 부진 수와 같다", () => {
    const delayed = rows.filter((row) => row.evaluation.status === "delayed").length;
    const result = answerIndicatorQuestion("부진지표 몇 개야?", rows);
    expect(result?.lines?.[0]).toContain(`${delayed}개`);
  });

  it("구분과 상태를 함께 거른다", () => {
    const result = answerIndicatorQuestion("공통 계량 중 보완 필요한 지표", rows);
    expect(result?.rows?.length).toBeGreaterThan(0);
    expect(result?.rows?.every((row) => row.category === "공통 계량" && row.status === "delayed")).toBe(true);
  });

  it("진척률 높은 순도 읽는다", () => {
    const result = answerIndicatorQuestion("진척률 높은 지표 3개", rows);
    const progress = result?.rows?.map((row) => row.progress) ?? [];
    expect(progress).toHaveLength(3);
    expect(progress).toEqual([...progress].sort((a, b) => b - a));
  });

  it("지표 이름을 말하면 그 지표 현황을 알려준다", () => {
    const result = answerIndicatorQuestion("수신 잔액 증대 어떻게 되고 있어?", rows);
    expect(result?.title).toBe("수신 잔액 증대");
    expect(result?.rows).toHaveLength(1);
  });

  it("범위 밖 진척률은 0~200으로 잘라 보여주고 원래 값도 함께 둔다", () => {
    const result = answerIndicatorQuestion("순이자마진 개선 현황", rows);
    const row = result?.rows?.[0];
    expect(row).toBeDefined();
    expect(row!.displayProgress).toBeGreaterThanOrEqual(0);
    expect(row!.displayProgress).toBeLessThanOrEqual(200);
    if (row!.progress < 0) expect(row!.displayProgress).toBe(0);
  });

  it("전체 현황 요약을 낸다", () => {
    const result = answerIndicatorQuestion("전체 현황 요약해줘", rows);
    expect(result?.title).toBe("전체 현황 요약");
    expect(result?.lines?.[0]).toContain("전체 30개");
  });

  it("알아듣지 못하면 null", () => {
    expect(answerIndicatorQuestion("오늘 날씨 어때", rows)).toBeNull();
  });

  it("지표가 없으면 안내한다", () => {
    expect(answerIndicatorQuestion("부진지표 알려줘", [])?.title).toContain("등록된 지표가 없습니다");
  });
});

describe("자료 검색", () => {
  const chunks: DocChunk[] = [
    { source: "보고서.pdf", indicator: "정성 평가 지표", category: "부점 비계량", index: 0, text: "올해 고객 만족도 조사에서 전년 대비 12점 상승하는 성과를 거두었습니다." },
    { source: "보고서.pdf", indicator: "정성 평가 지표", category: "부점 비계량", index: 0, text: "다음 분기에는 교육 일정이 예정되어 있습니다." },
    { source: "실적.xlsx", indicator: "신규 서비스 도입 준비", category: "부점 비계량", index: 1, text: "신규 서비스 시범 운영을 완료하고 직원 교육을 마쳤습니다." },
  ];

  it("질문의 핵심 단어만 남긴다", () => {
    expect(queryTerms("비계량 지표 보고서 안에 어떤 성과가 있어?")).toContain("성과가");
  });

  it("조사가 달라도 관련 문장을 찾는다", () => {
    const hits = searchChunks("어떤 성과가 있어?", chunks);
    expect(hits[0].chunk.text).toContain("성과");
  });

  it("관련 없는 글은 걸러낸다", () => {
    const hits = searchChunks("고객 만족도", chunks);
    expect(hits[0].chunk.source).toBe("보고서.pdf");
    expect(hits.some((hit) => hit.chunk.text.includes("교육 일정"))).toBe(false);
  });

  it("긴 글을 조각으로 나눈다", () => {
    const long = Array.from({ length: 30 }, (_, i) => `문장 번호 ${i}입니다. 내용이 이어집니다.`).join("\n");
    const pieces = splitIntoChunks(long, 120);
    expect(pieces.length).toBeGreaterThan(3);
    expect(pieces.every((piece) => piece.length <= 240)).toBe(true);
  });

  it("발췌문에 질문 단어가 들어 있다", () => {
    const text = `${"앞 내용 ".repeat(60)}성과가 크게 나타났다.${" 뒤 내용".repeat(60)}`;
    const out = excerpt(text, "성과가 있어?");
    expect(out.text).toContain("성과가");
    expect(out.text.length).toBeLessThan(text.length);
  });

  it("자료 질문인지 알아본다", () => {
    expect(looksLikeDocumentQuestion("보고서 안에 어떤 성과가 있어?")).toBe(true);
    expect(looksLikeDocumentQuestion("부진지표 몇 개야?")).toBe(false);
  });
});
