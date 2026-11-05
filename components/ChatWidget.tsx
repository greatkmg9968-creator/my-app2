"use client";

// Design Ref: §17 질의응답 챗봇 — 오른쪽 아래 떠 있는 창. 대시보드와 같은 어두운 글래스 테마를 쓴다.
// Plan SC: 작업 20 — 외부 AI 없이 브라우저 안에서만 답한다.
//   (1) 지표 질문: 질문에서 조건을 읽어 계산된 값으로 정확히 답한다.
//   (2) 자료 질문: 올려 둔 파일·보완사항·개선조치·추진과제에서 관련 문장을 찾아 원문 그대로 보여준다.

import { useEffect, useMemo, useRef, useState } from "react";
import { loadFile } from "@/lib/attachmentStore";
import {
  excerpt,
  looksLikeDocumentQuestion,
  searchChunks,
  splitIntoChunks,
  type DocChunk,
} from "@/lib/docSearch";
import type { IndicatorRow } from "@/lib/filterSort";
import {
  answerIndicatorQuestion,
  detectScope,
  findNamedIndicator,
  matchesScope,
  scopeLabel,
  type QaResult,
} from "@/lib/qa";
import { canExtractText, extractText, unreadableReason } from "@/lib/textExtract";

interface ChatWidgetProps {
  rows: IndicatorRow[];
  /** 지표를 눌렀을 때 세부 화면을 연다. 전체 목록에서의 위치(index)를 넘긴다. */
  onOpenDetail: (index: number) => void;
}

interface DocAnswer {
  scopeText: string;
  hits: { chunk: DocChunk; text: string; terms: string[] }[];
  notes: string[];
}

interface Message {
  id: number;
  role: "user" | "bot";
  text?: string;
  result?: QaResult;
  docs?: DocAnswer;
}

const SUGGESTIONS = [
  "부진지표 진척률 낮은 것부터 5개 알려줘",
  "공통 계량 지표 중 보완 필요한 것",
  "부진지표 몇 개야?",
  "비계량 지표 보고서에 어떤 성과가 있어?",
  "보완사항이 비어 있는 지표",
];

const HELP_TEXT =
  "이렇게 물어보세요. 예) \"부진지표 진척률 낮은 것부터 5개\", \"부점 계량 중 정상 지표\", \"배점 높은 부진지표\", \"신규 고객 유치 현황\", \"비계량 지표 자료에 어떤 성과가 있어?\"";

/** 질문 단어를 강조해서 보여준다. */
function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(pattern).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-sky-300/25 px-0.5 text-sky-100">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export default function ChatWidget({ rows, onOpenDetail }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // 파일에서 뽑은 글을 파일 번호별로 기억해 두 번째 질문부터 빠르게 답한다. (null = 읽을 수 없음)
  const textCache = useRef(new Map<string, string | null>());

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const rowsByIndex = useMemo(() => new Map(rows.map((row) => [row.index, row])), [rows]);

  const push = (message: Omit<Message, "id">) =>
    setMessages((current) => [...current, { ...message, id: nextId.current++ }]);

  /** 자료 질문: 범위에 든 지표의 기록과 첨부파일 글에서 관련 문장을 찾는다. */
  const answerDocuments = async (question: string): Promise<DocAnswer> => {
    const scope = detectScope(question);
    const named = findNamedIndicator(question, rows);
    const targets = named ? [named] : rows.filter((row) => matchesScope(row.indicator.category, scope));
    const notes: string[] = [];
    const chunks: DocChunk[] = [];

    for (const row of targets) {
      const { indicator, index } = row;
      const base = { indicator: indicator.name, category: indicator.category, index };
      if (indicator.note) chunks.push({ ...base, source: "보완사항", text: indicator.note });
      for (const action of indicator.actions ?? []) {
        chunks.push({
          ...base,
          source: "개선조치",
          text: `${action.date} ${action.content} (담당 ${action.owner}, ${action.status})${action.effect ? ` 효과: ${action.effect}` : ""}`,
        });
      }
      for (const task of indicator.tasks ?? []) {
        chunks.push({ ...base, source: "추진과제", text: `${task.title} (담당 ${task.owner}, ${task.status}${task.due ? `, 기한 ${task.due}` : ""})` });
      }
      for (const meta of indicator.attachments ?? []) {
        if (!canExtractText(meta.name)) {
          notes.push(`${indicator.name} · ${meta.name}: ${unreadableReason(meta.name)}`);
          continue;
        }
        let text = textCache.current.get(meta.id);
        if (text === undefined) {
          try {
            const blob = await loadFile(meta.id);
            text = blob ? await extractText(blob, meta.name) : null;
          } catch {
            text = null;
            notes.push(`${indicator.name} · ${meta.name}: 파일을 읽는 중 오류가 났습니다`);
          }
          textCache.current.set(meta.id, text);
        }
        if (text === null) continue;
        if (text.trim() === "") {
          notes.push(`${indicator.name} · ${meta.name}: 글자가 없습니다 (스캔한 이미지 PDF일 수 있습니다)`);
          continue;
        }
        for (const piece of splitIntoChunks(text)) chunks.push({ ...base, source: meta.name, text: piece });
      }
    }

    const hits = searchChunks(question, chunks, 5).map((hit) => {
      const { text, terms } = excerpt(hit.chunk.text, question);
      return { chunk: hit.chunk, text, terms };
    });
    const scopeText = named ? named.indicator.name : scopeLabel(scope);
    if (chunks.length === 0) notes.unshift(`${scopeText} 지표에는 검색할 자료(첨부파일·보완사항·개선조치·추진과제)가 없습니다.`);
    return { scopeText, hits, notes };
  };

  const ask = async (raw: string) => {
    const question = raw.trim();
    if (question === "" || busy) return;
    setInput("");
    push({ role: "user", text: question });
    setBusy(true);
    try {
      if (!looksLikeDocumentQuestion(question)) {
        const result = answerIndicatorQuestion(question, rows);
        if (result) {
          push({ role: "bot", result });
          return;
        }
      }
      const docs = await answerDocuments(question);
      if (docs.hits.length > 0 || looksLikeDocumentQuestion(question)) {
        push({ role: "bot", docs });
      } else {
        push({ role: "bot", text: `질문을 이해하지 못했습니다. ${HELP_TEXT}` });
      }
    } catch {
      push({ role: "bot", text: "답을 만드는 중 문제가 생겼습니다. 잠시 뒤 다시 물어봐 주세요." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="chat-panel"
        data-testid="chat-toggle"
        className="btn btn-primary fixed bottom-6 right-6 z-40 h-14 rounded-full px-6 text-base shadow-[0_0_40px_rgba(196,181,253,0.45)]"
      >
        {open ? "닫기" : "질문하기"}
      </button>

      {open && (
        <section
          id="chat-panel"
          aria-label="지표 질의응답"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          className="glass-dialog fixed bottom-24 right-6 z-40 flex h-[min(36rem,calc(100vh-8rem))] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden"
          data-testid="chat-panel"
        >
          <header className="border-b border-white/10 px-5 py-3">
            <h2 className="text-gradient text-base font-semibold">지표 질의응답</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              이 컴퓨터 안에서만 답합니다. 외부 AI로 보내지 않습니다.
            </p>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-300">
                  지표 현황이나 올려 둔 자료에 대해 물어보세요.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button key={suggestion} type="button" className="btn btn-sm text-left" onClick={() => void ask(suggestion)}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md border border-sky-300/40 bg-sky-300/10 px-3 py-2 text-sm text-sky-50">
                    {message.text}
                  </p>
                </div>
              ) : (
                <div
                  key={message.id}
                  className="max-w-[95%] space-y-2 rounded-2xl rounded-bl-md border border-white/10 bg-white/[.04] px-3 py-2 text-sm text-gray-200"
                  data-testid="chat-answer"
                >
                  {message.text && <p>{message.text}</p>}

                  {message.result && (
                    <>
                      <p className="font-medium text-white">{message.result.title}</p>
                      {message.result.lines && (
                        <ul className="space-y-0.5 text-gray-300">
                          {message.result.lines.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      )}
                      {message.result.rows && message.result.rows.length > 0 && (
                        <ol className="space-y-1.5">
                          {message.result.rows.map((row, i) => (
                            <li key={row.index}>
                              <button
                                type="button"
                                onClick={() => rowsByIndex.has(row.index) && onOpenDetail(row.index)}
                                className="w-full rounded-xl border border-white/10 bg-white/[.03] px-3 py-2 text-left transition hover:border-sky-300/60 hover:bg-white/[.07]"
                                aria-label={`${row.name} 세부 화면 열기`}
                              >
                                <span className="flex items-baseline justify-between gap-2">
                                  <span className="font-medium text-white">
                                    {message.result?.rows && message.result.rows.length > 1 ? `${i + 1}. ` : ""}
                                    {row.name}
                                  </span>
                                  <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                                      row.status === "delayed" ? "bg-red-400/15 text-red-300" : "bg-emerald-400/15 text-emerald-300"
                                    }`}
                                  >
                                    {row.status === "delayed" ? "부진" : "정상"}
                                  </span>
                                </span>
                                <span className="block text-xs text-gray-400">
                                  {row.category} · 진척률 {row.progress.toFixed(1)}%
                                  {row.status === "delayed" ? ` · 경과율보다 ${Math.abs(row.gap).toFixed(1)}%p 낮음` : ""} · 배점 {row.weight}
                                </span>
                                {row.note && <span className="mt-0.5 block text-xs text-gray-300">보완사항: {row.note}</span>}
                              </button>
                            </li>
                          ))}
                        </ol>
                      )}
                    </>
                  )}

                  {message.docs && (
                    <>
                      <p className="font-medium text-white">
                        {message.docs.hits.length > 0
                          ? `${message.docs.scopeText} 자료에서 관련 내용 ${message.docs.hits.length}건을 찾았습니다`
                          : `${message.docs.scopeText} 자료에서 관련 내용을 찾지 못했습니다`}
                      </p>
                      {message.docs.hits.length > 0 && (
                        <p className="text-xs text-gray-400">원문을 그대로 보여드립니다. (요약하지 않습니다)</p>
                      )}
                      <ul className="space-y-1.5">
                        {message.docs.hits.map((hit, i) => (
                          <li key={i} className="rounded-xl border border-white/10 bg-white/[.03] px-3 py-2">
                            <button
                              type="button"
                              onClick={() => rowsByIndex.has(hit.chunk.index) && onOpenDetail(hit.chunk.index)}
                              className="text-left text-xs text-sky-300 hover:underline"
                            >
                              {hit.chunk.indicator} · {hit.chunk.source}
                            </button>
                            <p className="mt-1 text-gray-200">
                              <Highlighted text={hit.text} terms={hit.terms} />
                            </p>
                          </li>
                        ))}
                      </ul>
                      {message.docs.notes.length > 0 && (
                        <ul className="space-y-0.5 text-xs text-amber-200/80">
                          {message.docs.notes.slice(0, 6).map((note) => (
                            <li key={note}>· {note}</li>
                          ))}
                          {message.docs.notes.length > 6 && <li>· 외 {message.docs.notes.length - 6}건</li>}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              ),
            )}

            {busy && (
              <p className="text-xs text-gray-400" role="status">
                자료를 읽는 중입니다…
              </p>
            )}
          </div>

          <form
            className="flex gap-2 border-t border-white/10 px-4 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(input);
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="궁금한 것을 물어보세요"
              maxLength={200}
              aria-label="질문 입력"
              className="field min-w-0 flex-1 text-sm"
              data-testid="chat-input"
            />
            <button type="submit" disabled={busy || input.trim() === ""} className="btn btn-primary shrink-0">
              보내기
            </button>
          </form>
        </section>
      )}
    </>
  );
}
