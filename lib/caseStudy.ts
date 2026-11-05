// Design Ref: §18 타기관 우수사례 추천 — 지표명·평가항목만 외부 AI(OpenAI 웹 검색)에 보내 우수사례를 받아 온다.
// Plan SC: 작업 21 — 모든 지표의 "개선, 추진사항" 칸에서 쓸 수 있고, 지표 값(숫자)은 어떤 경우에도 보내지 않는다.
//
// 이 파일은 서버 경로(app/api/case-study)와 화면이 함께 쓰는 순수 함수라 Vitest로 확인한다.

/** AI에게 보낼 수 있는 입력. 지표명·세부 평가항목·평가방법 글자뿐이다. (숫자 값은 보내지 않는다) */
export interface CaseRequest {
  name: string;
  item: string;
  method: string;
}

/** AI가 자기 지식으로 제안하는 개선·추진 아이디어. 출처 없는 참고용이라 사례와 따로 보여준다. */
export interface Suggestion {
  title: string;
  detail: string;
}

/** 추천 사례 한 건 */
export interface CaseItem {
  /** 기관 또는 기업 이름 */
  org: string;
  /** 공공 / 민간 */
  sector: "공공" | "민간";
  /** 사례 한 줄 요약 */
  summary: string;
  /** 우리 지표에 적용할 점 */
  apply: string;
  /** 근거 출처 주소 (웹 검색 결과에 실제로 나온 주소만 남긴다) */
  url: string;
  /** 우수하다고 본 근거: 수상 이력·보도자료·경영평가 결과 */
  basis: "수상" | "보도자료" | "경영평가";
  /** 근거가 된 원문 문구. 우수·최고·대상·양호 같은 키워드가 들어 있어야 한다. */
  evidence: string;
}

/** 우수사례로 인정하는 키워드. 근거 문구에 이 중 하나가 들어 있어야 사례로 남긴다. */
export const QUALITY_KEYWORDS = ["우수", "최고", "대상", "양호", "최우수", "1위"] as const;

/** "대상"이 상 이름(대상 수상)일 때만 인정한다. "…를 대상으로", "대상 기관"처럼 '목표 집단'을 뜻하는 말은 제외한다. */
const AWARD_DAESANG =
  /대상(?=\s*(?:수상|을\s*수상|을\s*받|상|입상|선정|[()（）\[\]”’"',.]|$))|(?:부문|종합|올해의|특별|최우수|국무총리|장관|대통령)\s*대상/;

/** 글에 우수사례 키워드(우수·최우수·최고·양호·1위, 상 이름으로서의 대상)가 들어 있으면 true */
export function hasQualityKeyword(text: string): boolean {
  if (/우수|최고|양호/.test(text)) return true; // 최우수는 우수에 포함된다
  if (/(?<![0-9])1위/.test(text)) return true; // 11위, 21위 같은 숫자는 제외
  return AWARD_DAESANG.test(text);
}

export const MAX_NAME_LENGTH = 100;
export const MAX_ITEM_LENGTH = 150;
export const MAX_METHOD_LENGTH = 150;
export const MAX_CASES = 5;
export const MAX_SUGGESTIONS = 3;

/** 글자만 남기고 다듬는다: 제어 문자 제거, 공백 정리, 길이 제한 */
export function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/** 요청 본문에서 지표명·평가항목을 꺼낸다. 지표명이 너무 짧거나 없으면 오류 문구를 돌려준다. */
export function parseCaseRequest(body: unknown): { ok: true; value: CaseRequest } | { ok: false; message: string } {
  if (typeof body !== "object" || body === null) return { ok: false, message: "요청 형식이 올바르지 않습니다." };
  const record = body as Record<string, unknown>;
  const name = sanitizeText(record.name, MAX_NAME_LENGTH);
  const item = sanitizeText(record.item, MAX_ITEM_LENGTH);
  const method = sanitizeText(record.method, MAX_METHOD_LENGTH);
  if (name.length < 2) return { ok: false, message: "지표명을 먼저 입력해 주세요." };
  return { ok: true, value: { name, item, method } };
}

/** 접속 코드 비교. 길이와 내용이 같아야 하며, 걸리는 시간으로 코드를 추측하지 못하게 끝까지 비교한다. */
export function isAccessCodeValid(given: unknown, expected: string | undefined): boolean {
  if (typeof expected !== "string" || expected === "") return false;
  if (typeof given !== "string") return false;
  let diff = given.length ^ expected.length;
  const length = Math.max(given.length, expected.length);
  for (let i = 0; i < length; i++) {
    diff |= (given.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** 하루 호출 횟수 제한. (서버 한 대 안에서 세는 방식이라 서버가 새로 뜨면 0부터 다시 센다) */
export function createDailyLimiter(limit: number, today: () => string) {
  let day = today();
  let count = 0;
  return {
    take(): { ok: boolean; remaining: number } {
      const now = today();
      if (now !== day) {
        day = now;
        count = 0;
      }
      if (count >= limit) return { ok: false, remaining: 0 };
      count += 1;
      return { ok: true, remaining: limit - count };
    },
  };
}

/** AI에게 줄 지시문과 질문. 숫자 값은 넣지 않는다. */
export function buildPrompt({ name, item, method }: CaseRequest): { instructions: string; input: string } {
  const instructions = [
    "너는 한국 공공기관 부점의 성과평가 담당자를 돕는 조사원이다.",
    "주어진 성과지표(지표명, 세부 평가항목, 평가방법)와 관련해 국내외 공공기관과 민간기업의 우수 추진사례를 웹에서 검색해 정리하고, 별도로 너 자신의 개선·추진 제안도 쓴다.",
    "검색은 지표명과 평가방법에 맞춰 한다. 예를 들어 평가방법이 '누적 건수 ÷ 목표'이면 실적을 늘린 사례를, '정성 평가'이면 평가 결과가 좋았던 운영 사례를 찾는다.",
    "검색할 때는 지표명·평가방법 키워드에 '우수사례', '최우수', '대상 수상', '경영평가 우수', '보도자료' 같은 표현을 함께 넣어 여러 번 검색한다.",
    "[A. 우수사례(cases)] '우수사례'의 기준: 수상 이력, 보도자료, 경영평가 결과(등급) 중 하나에서 '우수', '최우수', '최고', '대상', '양호', '1위' 같은 키워드가 원문에 실제로 적혀 있는 사례만 우수사례로 인정한다.",
    "A에서 반드시 지킬 것:",
    "1) 실제 웹 검색으로 확인한 사례만 쓴다. 확인하지 못한 사례, 추측, 기억에 의존한 내용은 쓰지 않는다.",
    "2) 사례마다 근거가 된 웹 페이지 주소(url)를 넣는다. 주소가 없으면 그 사례는 뺀다.",
    "3) 사례마다 우수하다고 본 근거를 basis(수상, 보도자료, 경영평가 중 하나)와 evidence(해당 원문에서 키워드가 들어 있는 문구를 그대로, 100자 이내)로 적는다. 원문에 키워드가 없으면 그 사례는 뺀다. evidence를 지어내지 않는다.",
    "4) 공공기관 사례와 민간기업 사례를 섞어 3~5건을 찾되, 기준을 만족하는 사례가 적으면 적게 써도 된다.",
    "5) 각 사례는 기관 이름, 공공/민간 구분, 한 줄 요약, 이 지표에 적용할 점을 한국어로 짧게 쓴다.",
    "[B. AI 자체 추천(suggestions)] 웹 사례와 별개로, 이 지표를 개선·추진하기 위해 네가 일반적인 지식으로 제안하는 실행 아이디어를 3건 이내로 쓴다. 제목(title)과 한두 문장의 설명(detail)만 쓰고, 특정 기관의 실적이나 수치를 사실처럼 말하지 않는다.",
    "공통: 지표의 목표·실적 같은 숫자는 주어지지 않는다. 숫자를 지어내지 않는다.",
    '출력은 다음 JSON 하나만 쓴다(설명 문장, 코드블록 표시 금지): {"cases":[{"org":"","sector":"공공 또는 민간","summary":"","apply":"","basis":"수상 또는 보도자료 또는 경영평가","evidence":"","url":""}],"suggestions":[{"title":"","detail":""}]}',
  ].join("\n");
  const input = `성과지표명: ${name}\n세부 평가항목: ${item || "(없음)"}\n평가방법: ${method || "(없음)"}\n\n이 지표를 개선·추진하는 데 참고할 타 기관(공공기관·민간기업)의 우수사례와, AI 자체 추천을 JSON으로 알려 주세요.`;
  return { instructions, input };
}

/** 글 속에서 JSON 덩어리를 찾아 읽는다. 읽지 못하면 null */
function readJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** 주소를 비교하기 쉽게 다듬는다: 끝의 슬래시와 #조각을 뺀다. 올바른 주소가 아니면 빈 글자 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

/**
 * 서버가 열어 봐도 안전한 공개 주소인지 본다. (AI가 준 주소를 서버가 열어 확인하므로, 내부망 주소로 유도되는 것을 막는다)
 * https만, 도메인 이름만 허용한다. 숫자로 된 주소(IP), localhost, 내부용 이름은 막는다.
 */
export function isSafePublicUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username !== "" || parsed.password !== "") return false;
  if (parsed.port !== "" && parsed.port !== "443") return false;
  const host = parsed.hostname.toLowerCase();
  if (!host.includes(".")) return false; // localhost, 내부 서버 이름
  if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return false; // IPv4·IPv6 주소
  if (/\.(local|localhost|internal|lan|home|corp|intranet)$/.test(host)) return false;
  return true;
}

/**
 * AI가 쓴 글에서 사례 후보를 꺼낸다.
 * - 안전한 https 공개 주소가 있는 사례만, 중복 없이, 글자 수를 제한해서 최대 5건까지 남긴다.
 * - 이 주소가 실제로 있는 페이지인지는 서버(route)가 따로 확인한다.
 */
export function extractCases(outputText: string): CaseItem[] {
  const parsed = readJson(outputText);
  if (typeof parsed !== "object" || parsed === null) return [];
  const list = (parsed as { cases?: unknown }).cases;
  if (!Array.isArray(list)) return [];

  const result: CaseItem[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const org = sanitizeText(r.org, 60);
    const summary = sanitizeText(r.summary, 300);
    const apply = sanitizeText(r.apply, 300);
    const url = typeof r.url === "string" ? r.url.trim() : "";
    const normalized = normalizeUrl(url);
    const evidence = sanitizeText(r.evidence, 160);
    if (org === "" || summary === "" || normalized === "") continue;
    if (!isSafePublicUrl(normalized)) continue;
    // 우수사례 기준: 근거 문구에 우수·최고·대상·양호 같은 키워드가 있어야 한다.
    if (evidence === "" || !hasQualityKeyword(evidence)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const basis = r.basis === "수상" || r.basis === "경영평가" ? r.basis : "보도자료";
    result.push({ org, sector: r.sector === "민간" ? "민간" : "공공", summary, apply, url: normalized, basis, evidence });
    if (result.length >= MAX_CASES) break;
  }
  return result;
}
/** AI 자체 추천을 꺼낸다. 출처가 없는 참고용이라 제목·설명 글자만 정리하고 최대 3건까지 남긴다. */
export function extractSuggestions(outputText: string): Suggestion[] {
  const parsed = readJson(outputText);
  if (typeof parsed !== "object" || parsed === null) return [];
  const list = (parsed as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(list)) return [];
  const result: Suggestion[] = [];
  for (const raw of list) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const title = sanitizeText(r.title, 60);
    const detail = sanitizeText(r.detail, 300);
    if (title === "" || detail === "") continue;
    result.push({ title, detail });
    if (result.length >= MAX_SUGGESTIONS) break;
  }
  return result;
}

/** AI 자체 추천을 "개선, 추진사항" 칸에 덧붙일 한 줄 글로 만든다. */
export function suggestionToNote(item: Suggestion): string {
  return `[AI 추천] ${item.title}: ${item.detail}`;
}

/** 사례를 "개선, 추진사항" 칸에 덧붙일 한 줄 글로 만든다. */
export function caseToNote(item: CaseItem): string {
  const point = item.apply !== "" ? item.apply : item.summary;
  return `[참고 사례: ${item.org}] ${point}`;
}
