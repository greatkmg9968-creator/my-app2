// Design Ref: §17 질의응답 — 올려 둔 자료(와 지표의 보완사항·개선조치·추진과제) 안에서 질문과 관련 있는 문장을 찾는다.
// Plan SC: 작업 20 — "비계량 지표 보고서 안에 어떤 성과가 있어?" 같은 질문에 원문을 근거로 보여준다. 요약문을 지어내지 않는다.
//
// 외부 AI 없이 글자 겹침으로 점수를 매긴다. 한국어는 조사가 붙어 단어가 달라 보이므로
// 두 글자씩 끊은 조각(바이그램)이 얼마나 겹치는지로 비교한다.

/** 찾을 글 조각 하나 */
export interface DocChunk {
  /** 출처 이름: 파일 이름, 또는 "보완사항" 같은 기록 이름 */
  source: string;
  /** 이 글이 속한 지표 이름 */
  indicator: string;
  /** 지표 구분 */
  category: string;
  /** 지표의 위치(세부 화면을 열 때 쓴다) */
  index: number;
  text: string;
}

/** 검색 결과 하나 */
export interface DocHit {
  chunk: DocChunk;
  score: number;
}

/** 질문에서 뜻 없는 말: 찾을 때 점수를 흐리지 않게 뺀다. */
const FILLER = [
  "알려줘", "알려", "보여줘", "보여", "말해줘", "무엇", "무슨", "어떤", "어떻게", "뭐야", "뭐가", "있어", "있나", "있는지",
  "안에", "속에", "내용", "관련", "대해", "대한", "에서", "으로", "이야", "인가", "인지", "해줘", "주세요", "찾아줘",
  "보고서", "자료", "파일", "문서", "지표", "비계량", "계량", "부점", "공통",
];

/** 글자와 숫자만 남기고 소문자로 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** 질문의 핵심 단어들. 뜻 없는 말을 빼고 한 글자 단어도 뺀다. */
export function queryTerms(question: string): string[] {
  let q = normalize(question);
  for (const word of FILLER) q = q.split(word).join(" ");
  return q.split(/\s+/).filter((term) => term.length >= 2);
}

/** 두 글자 조각들 */
function bigrams(text: string): Set<string> {
  const compactText = normalize(text).replace(/\s+/g, "");
  const set = new Set<string>();
  for (let i = 0; i < compactText.length - 1; i++) set.add(compactText.slice(i, i + 2));
  return set;
}

/** 글을 문단 → 문장 순으로 잘라 한 조각이 대략 maxLength자가 되게 묶는다. */
export function splitIntoChunks(text: string, maxLength = 320): string[] {
  const paragraphs = text
    .split(/\r?\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
  const chunks: string[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer.trim().length > 0) chunks.push(buffer.trim());
    buffer = "";
  };
  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[.!?。])\s+|(?<=다\.)\s*/).filter((s) => s.length > 0);
    for (const sentence of sentences.length > 0 ? sentences : [paragraph]) {
      if (buffer.length + sentence.length + 1 > maxLength) flush();
      buffer += (buffer ? " " : "") + sentence;
    }
    if (buffer.length >= maxLength * 0.6) flush();
  }
  flush();
  return chunks;
}

/**
 * 질문과 관련 있는 글 조각을 점수 순으로 돌려준다.
 * 질문 단어가 그대로 들어 있으면 크게, 두 글자 조각이 겹치면 조금 점수를 준다.
 * 핵심 단어가 하나도 없으면(예: "성과 알려줘" 같은 넓은 질문) 빈 질문으로 보고 앞쪽 조각을 보여준다.
 */
export function searchChunks(question: string, chunks: DocChunk[], limit = 5): DocHit[] {
  const terms = queryTerms(question);
  const queryGrams = bigrams(terms.join(""));

  const hits: DocHit[] = [];
  for (const chunk of chunks) {
    const text = normalize(chunk.text);
    let score = 0;
    for (const term of terms) {
      if (text.includes(term)) score += 3 + Math.min(term.length, 6) * 0.2;
    }
    if (queryGrams.size > 0) {
      const chunkGrams = bigrams(chunk.text);
      let overlap = 0;
      for (const gram of queryGrams) if (chunkGrams.has(gram)) overlap += 1;
      score += (overlap / queryGrams.size) * 2;
    }
    if (terms.length === 0) score = 1; // 넓은 질문: 모든 조각을 같은 점수로 두고 순서대로
    if (score > 0.8) hits.push({ chunk, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

/** 조각 안에서 질문 단어 앞뒤를 잘라 보여줄 짧은 발췌문과, 강조할 단어를 돌려준다. */
export function excerpt(text: string, question: string, radius = 110): { text: string; terms: string[] } {
  const terms = queryTerms(question).filter((term) => normalize(text).includes(term));
  if (text.length <= radius * 2) return { text, terms };
  const lower = text.toLowerCase();
  const first = terms.map((term) => lower.indexOf(term)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  const center = first ?? 0;
  const start = Math.max(0, center - radius);
  const end = Math.min(text.length, center + radius);
  return {
    text: `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`,
    terms,
  };
}

/** 자료 질문으로 보이는 말이 들어 있으면 true: 보고서·자료·파일·성과·내용 등 */
export function looksLikeDocumentQuestion(question: string): boolean {
  return /보고서|자료|파일|문서|첨부|내용|성과|실적자료|언급|기록|개선조치|추진과제|과제|조치/.test(question);
}
