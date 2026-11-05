// 타기관 우수사례 추천(lib/caseStudy.ts)의 안전 장치를 확인한다: 입력 정리, 접속 코드, 하루 호출 제한, 출처 확인.

import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  caseToNote,
  createDailyLimiter,
  isAccessCodeValid,
  extractCases,
  extractSuggestions,
  hasQualityKeyword,
  isSafePublicUrl,
  MAX_CASES,
  normalizeUrl,
  parseCaseRequest,
  sanitizeText,
  suggestionToNote,
} from "./caseStudy";

describe("입력 정리", () => {
  it("제어 문자와 겹친 공백을 정리하고 길이를 자른다", () => {
    expect(sanitizeText("  AI\n\t역량   강화  ", 50)).toBe("AI 역량 강화");
    expect(sanitizeText("가".repeat(300), 100)).toHaveLength(100);
    expect(sanitizeText(123, 10)).toBe("");
  });

  it("지표명이 2글자 미만이면 거부하고, 평가항목은 없어도 된다", () => {
    expect(parseCaseRequest({ name: "가" }).ok).toBe(false);
    expect(parseCaseRequest(null).ok).toBe(false);
    const ok = parseCaseRequest({ name: "연수시설의 합리적 운영", item: "" });
    expect(ok).toEqual({ ok: true, value: { name: "연수시설의 합리적 운영", item: "", method: "" } });
  });

  it("지표명·평가항목·평가방법 외의 값(숫자, 개선·추진사항)은 요청에서 버린다", () => {
    const parsed = parseCaseRequest({ name: "민원 건수 감축", item: "민원 건수", method: "기초 건수에서 목표까지 감축", actual: 30, target: 20, note: "비공개 내용", code: "x" });
    expect(parsed.ok && Object.keys(parsed.value).sort()).toEqual(["item", "method", "name"]);
    expect(parsed.ok && parsed.value.method).toBe("기초 건수에서 목표까지 감축");
  });
});

describe("프롬프트", () => {
  it("지표명·평가항목·평가방법만 들어가고 출처·JSON 규칙이 있다", () => {
    const { instructions, input } = buildPrompt({ name: "AI 역량 강화", item: "교육 이수", method: "연간 누적 이수 인원 ÷ 목표" });
    expect(input).toContain("AI 역량 강화");
    expect(input).toContain("교육 이수");
    expect(input).toContain("연간 누적 이수 인원 ÷ 목표");
    // AI 자체 추천(suggestions) 섹션을 요청한다
    expect(instructions).toContain("suggestions");
    expect(instructions).toContain("url");
    expect(instructions).toContain("JSON");
    // 우수사례 기준(수상 이력·보도자료·경영평가, 키워드)이 지시문에 들어 있다
    for (const word of ["수상", "보도자료", "경영평가", "우수", "최고", "대상", "양호"]) expect(instructions).toContain(word);
  });
});

describe("AI 자체 추천 꺼내기", () => {
  it("제목·설명이 있는 항목만 최대 3건 남기고, 출처 검사는 하지 않는다", () => {
    const list = [
      { title: "월별 가동률 점검 회의", detail: "월 1회 가동률을 점검하고 비수기 대책을 정한다." },
      { title: "", detail: "제목 없음" },
      { title: "설명 없음", detail: "" },
      { title: "외부 위탁 교육 유치", detail: "비수기 시설을 외부 교육에 개방한다." },
      { title: "예약 시스템 개선", detail: "예약 현황을 한눈에 보게 한다." },
      { title: "네 번째", detail: "넘치는 항목" },
    ];
    const result = extractSuggestions(`앞 설명 ${JSON.stringify({ cases: [], suggestions: list })} 뒤 설명`);
    expect(result.map((s) => s.title)).toEqual(["월별 가동률 점검 회의", "외부 위탁 교육 유치", "예약 시스템 개선"]);
  });

  it("추천이 없거나 읽을 수 없으면 빈 목록이다", () => {
    expect(extractSuggestions('{"cases":[]}')).toEqual([]);
    expect(extractSuggestions("JSON 아님")).toEqual([]);
    expect(extractSuggestions('{"suggestions":"x"}')).toEqual([]);
  });

  it("개선, 추진사항 칸에 덧붙일 한 줄을 만든다", () => {
    expect(suggestionToNote({ title: "월별 점검", detail: "매달 확인한다." })).toBe("[AI 추천] 월별 점검: 매달 확인한다.");
  });
});

describe("접속 코드", () => {
  it("같은 코드만 통과한다", () => {
    expect(isAccessCodeValid("abc123", "abc123")).toBe(true);
    expect(isAccessCodeValid("abc124", "abc123")).toBe(false);
    expect(isAccessCodeValid("abc12", "abc123")).toBe(false);
    expect(isAccessCodeValid(undefined, "abc123")).toBe(false);
  });

  it("서버에 코드가 설정되지 않았으면 무엇을 넣어도 막힌다", () => {
    expect(isAccessCodeValid("", "")).toBe(false);
    expect(isAccessCodeValid("anything", undefined)).toBe(false);
  });
});

describe("하루 호출 제한", () => {
  it("한도까지만 허용하고, 날짜가 바뀌면 다시 센다", () => {
    let day = "2026-11-05";
    const limiter = createDailyLimiter(2, () => day);
    expect(limiter.take()).toEqual({ ok: true, remaining: 1 });
    expect(limiter.take()).toEqual({ ok: true, remaining: 0 });
    expect(limiter.take().ok).toBe(false);
    day = "2026-11-06";
    expect(limiter.take().ok).toBe(true);
  });
});

describe("서버가 열어 봐도 안전한 주소인가", () => {
  it("https 공개 도메인만 허용한다", () => {
    expect(isSafePublicUrl("https://www.alio.go.kr/a/b?c=1")).toBe(true);
    expect(isSafePublicUrl("http://www.alio.go.kr/")).toBe(false);
    expect(isSafePublicUrl("javascript:alert(1)")).toBe(false);
    expect(isSafePublicUrl("not a url")).toBe(false);
  });

  it("내부망으로 이어질 수 있는 주소는 막는다", () => {
    for (const bad of [
      "https://localhost/a",
      "https://127.0.0.1/a",
      "https://169.254.169.254/latest/meta-data",
      "https://10.0.0.5/",
      "https://[::1]/",
      "https://intranet/a",
      "https://printer.local/a",
      "https://user:pw@example.com/",
      "https://example.com:8443/",
    ]) {
      expect(isSafePublicUrl(bad), bad).toBe(false);
    }
  });
});

describe("AI 응답에서 사례 후보 꺼내기", () => {
  const good = {
    org: "한국전력",
    sector: "공공",
    summary: "사내 AI 교육과정을 운영했다",
    apply: "직급별 과정을 만든다",
    basis: "경영평가",
    evidence: "2024년 경영평가에서 교육 부문 우수 등급을 받았다",
    url: "https://example.com/a",
  };
  const text = (cases: unknown[]) => `설명입니다 ${JSON.stringify({ cases })} 끝`;

  it("앞뒤에 설명 글이 붙어 있어도 JSON을 찾아 읽는다", () => {
    const result = extractCases(text([good]));
    expect(result).toHaveLength(1);
    expect(result[0].org).toBe("한국전력");
  });

  it("안전하지 않은 주소(http, 내부망), 필수 칸이 빈 사례, 중복 주소는 버린다", () => {
    const http = { ...good, url: "http://example.com/a" };
    const internal = { ...good, url: "https://10.0.0.1/a" };
    const empty = { ...good, org: "" };
    const dup = { ...good };
    const result = extractCases(text([http, internal, empty, good, dup]));
    expect(result).toHaveLength(1);
  });

  it("근거 문구에 우수·최고·대상·양호 같은 키워드가 없으면 우수사례로 보지 않고 버린다", () => {
    const noKeyword = { ...good, url: "https://example.com/n1", evidence: "교육과정을 새로 운영했다고 소개했다" };
    const noEvidence = { ...good, url: "https://example.com/n2", evidence: "" };
    const missing = { ...good, url: "https://example.com/n3", evidence: undefined };
    const top = { ...good, url: "https://example.com/k1", basis: "수상", evidence: "행정안전부 장관상 대상 수상" };
    const fine = { ...good, url: "https://example.com/k2", basis: "보도자료", evidence: "교육 만족도 양호 평가" };
    const result = extractCases(text([noKeyword, noEvidence, missing, top, fine]));
    expect(result.map((c) => c.url)).toEqual(["https://example.com/k1", "https://example.com/k2"]);
    expect(result.map((c) => c.basis)).toEqual(["수상", "보도자료"]);
  });

  it("키워드 판정: 우수·최우수·최고·양호·1위, 상 이름으로서의 대상", () => {
    for (const text of [
      "경영평가 우수 등급",
      "최우수 기관 선정",
      "최고 등급 획득",
      "만족도 양호",
      "전국 1위 달성",
      "행안부 장관상 대상 수상",
      "올해의 대상을 수상했다",
      "혁신 부문 대상",
      "공모전 대상(大賞)",
    ]) {
      expect(hasQualityKeyword(text), text).toBe(true);
    }
  });

  it("'대상으로', '대상 기관'처럼 목표 집단을 뜻하는 대상이나 11위 같은 숫자는 키워드로 보지 않는다", () => {
    for (const text of [
      "초·중 약 1,500명 대상으로 총 60회 운영",
      "전 직원을 대상으로 교육",
      "교육 대상 기관 확대",
      "순위는 11위였다",
      "보통 수준의 운영",
    ]) {
      expect(hasQualityKeyword(text), text).toBe(false);
    }
  });

  it("근거 구분이 이상하면 보도자료로 읽는다", () => {
    const weird = { ...good, url: "https://example.com/w", basis: "소문" };
    expect(extractCases(text([weird]))[0].basis).toBe("보도자료");
  });

  it("주소 끝의 슬래시와 #조각을 정리한다", () => {
    expect(extractCases(text([{ ...good, url: "https://example.com/a/#top" }]))[0].url).toBe("https://example.com/a");
    expect(normalizeUrl("https://example.com/x/#y")).toBe("https://example.com/x");
    expect(normalizeUrl("???")).toBe("");
  });

  it("공공/민간 구분이 없거나 이상하면 공공으로, 민간은 민간으로 읽는다", () => {
    const priv = { ...good, sector: "민간", url: "https://example.com/b" };
    const weird = { ...good, sector: "기타", url: "https://example.com/c" };
    expect(extractCases(text([priv, weird])).map((c) => c.sector)).toEqual(["민간", "공공"]);
  });

  it("최대 5건까지만 남기고, 읽을 수 없는 글이면 빈 목록이다", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...good, url: `https://example.com/${i}` }));
    expect(extractCases(text(many))).toHaveLength(MAX_CASES);
    expect(extractCases("JSON이 아닙니다")).toEqual([]);
    expect(extractCases('{"cases":"x"}')).toEqual([]);
  });

  it("개선, 추진사항 칸에 덧붙일 한 줄을 만든다", () => {
    const [item] = extractCases(text([good]));
    expect(caseToNote(item)).toBe("[참고 사례: 한국전력] 직급별 과정을 만든다");
  });
});