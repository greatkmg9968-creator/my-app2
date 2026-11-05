// Design Ref: §18 타기관 우수사례 추천 — 서버 경로. 앱에서 유일하게 외부 서비스(OpenAI)를 부르는 곳이다.
// Plan SC: 작업 21 — 접속 코드 확인 → 하루 호출 제한 → 지표명·평가항목만 OpenAI 웹 검색 모델에 전달 → 출처가 확인된 사례만 돌려준다.
//
// 비밀 값(OPENAI_API_KEY, CASE_ACCESS_CODE)은 환경 변수로만 읽고, 응답이나 로그에 절대 내보내지 않는다.

import {
  buildPrompt,
  createDailyLimiter,
  extractCases,
  extractSuggestions,
  isAccessCodeValid,
  normalizeUrl,
  parseCaseRequest,
} from "@/lib/caseStudy";

const DEFAULT_MODEL = "gpt-4.1";
const DEFAULT_DAILY_LIMIT = 30;
const UPSTREAM_TIMEOUT_MS = 55_000;
const LINK_CHECK_TIMEOUT_MS = 6_000;

/** 오늘 날짜(한국 시간) 글자. 하루가 바뀌면 호출 횟수를 0부터 다시 센다. */
const koreaToday = () =>
  new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const dailyLimit = Number(process.env.CASE_DAILY_LIMIT) > 0 ? Number(process.env.CASE_DAILY_LIMIT) : DEFAULT_DAILY_LIMIT;
const limiter = createDailyLimiter(dailyLimit, koreaToday);

function reply(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * AI가 준 출처 주소가 실제로 있는 페이지인지 서버가 확인한다. (지어낸 주소를 걸러내는 장치)
 * 없는 페이지(404·410)와 서버 오류, 연결 실패는 버린다. 보안 때문에 봇을 막는 사이트(401·403·429)와 이동 안내(3xx)는 "있는 페이지"로 본다.
 * 이동 안내는 따라가지 않는다. (안전하지 않은 주소로 유도되는 것을 막는다)
 */
async function pageExists(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINK_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; case-study-link-check)", Accept: "text/html,application/pdf,*/*" },
    });
    void res.body?.cancel();
    const s = res.status;
    return (s >= 200 && s < 400) || s === 401 || s === 403 || s === 429;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** OpenAI 응답에서 본문 글과, 웹 검색으로 실제 인용된 주소들을 모은다. */
function readOutput(data: unknown): { text: string; urls: string[] } {
  let text = "";
  const urls: string[] = [];
  const output = (data as { output?: unknown }).output;
  if (!Array.isArray(output)) return { text, urls };
  for (const item of output) {
    const content = (item as { type?: string; content?: unknown }).content;
    if ((item as { type?: string }).type !== "message" || !Array.isArray(content)) continue;
    for (const part of content) {
      const p = part as { type?: string; text?: unknown; annotations?: unknown };
      if (p.type !== "output_text" || typeof p.text !== "string") continue;
      text += p.text;
      if (Array.isArray(p.annotations)) {
        for (const a of p.annotations) {
          const ann = a as { type?: string; url?: unknown };
          if (ann.type === "url_citation" && typeof ann.url === "string") urls.push(ann.url);
        }
      }
    }
  }
  return { text, urls };
}

export async function POST(request: Request): Promise<Response> {
  // 환경 변수를 넣을 때 끝에 줄바꿈이 딸려 들어가기 쉬우므로 앞뒤 공백은 지운다.
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const accessCode = process.env.CASE_ACCESS_CODE?.trim();
  // 설정이 빠져 있으면 문을 닫아 둔다. (코드 없이 열려 요금이 나가는 일을 막는다)
  if (!apiKey || !accessCode) {
    return reply(503, { error: "우수사례 추천은 아직 설정되지 않아 사용할 수 없습니다." });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: "요청 형식이 올바르지 않습니다." });
  }

  const code = typeof body === "object" && body !== null ? (body as Record<string, unknown>).code : undefined;
  if (!isAccessCodeValid(code, accessCode)) {
    return reply(401, { error: "접속 코드가 올바르지 않습니다." });
  }

  const parsed = parseCaseRequest(body);
  if (!parsed.ok) return reply(400, { error: parsed.message });

  const turn = limiter.take();
  if (!turn.ok) {
    return reply(429, { error: "오늘 사용할 수 있는 횟수를 모두 썼습니다. 내일 다시 시도해 주세요." });
  }

  const { instructions, input } = buildPrompt(parsed.value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        tools: [{ type: "web_search" }],
        instructions,
        input,
        max_output_tokens: 3000,
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      // 외부 서비스의 오류 내용(키·계정 정보가 섞일 수 있음)은 그대로 전달하지 않는다.
      return reply(502, { error: "사례 검색 서비스에서 오류가 났습니다. 잠시 뒤 다시 시도해 주세요." });
    }
    const data: unknown = await upstream.json();
    const { text, urls } = readOutput(data);
    // 웹 검색이 직접 인용한 주소는 그대로 믿고, 나머지는 실제로 열리는 페이지인지 확인한다.
    const cited = new Set(urls.map(normalizeUrl));
    const candidates = extractCases(text);
    const checked = await Promise.all(
      candidates.map(async (c) => ((cited.has(c.url) || (await pageExists(c.url))) ? c : null)),
    );
    const cases = checked.filter((c) => c !== null);
    // AI 자체 추천은 출처가 없는 참고용이라 사례와 따로 돌려준다.
    const suggestions = extractSuggestions(text);
    return reply(200, { cases, suggestions, remaining: turn.remaining });
  } catch {
    return reply(504, { error: "사례 검색이 너무 오래 걸려 중단했습니다. 잠시 뒤 다시 시도해 주세요." });
  } finally {
    clearTimeout(timer);
  }
}
