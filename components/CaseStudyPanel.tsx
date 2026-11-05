"use client";

// Design Ref: §18 타기관 우수사례 추천 — "개선, 추진사항" 칸 아래에 붙는 추천 창.
// Plan SC: 작업 21 — 지표명·평가항목만 서버를 거쳐 외부 AI로 보내고, 출처가 확인된 사례만 보여준다. 마음에 드는 사례는 칸에 덧붙일 수 있다.

import { useState } from "react";
import { caseToNote, type CaseItem } from "@/lib/caseStudy";

interface CaseStudyPanelProps {
  /** 지금 입력 창에 적힌 지표명과 세부 평가항목 */
  name: string;
  item: string;
  /** "참고해 적기"를 눌렀을 때 칸에 덧붙일 글을 넘긴다. */
  onInsert: (text: string) => void;
}

const CODE_KEY = "case-study-code";

/** 접속 코드는 이 탭이 열려 있는 동안만 브라우저에 기억한다. (읽기·쓰기가 막혀 있어도 동작해야 한다) */
function readStoredCode(): string {
  try {
    return window.sessionStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}
function storeCode(code: string): void {
  try {
    window.sessionStorage.setItem(CODE_KEY, code);
  } catch {
    // 저장이 막힌 브라우저에서는 그냥 넘어간다.
  }
}

export default function CaseStudyPanel({ name, item, onInsert }: CaseStudyPanelProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(readStoredCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseItem[] | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const canAsk = name.trim().length >= 2 && code.trim() !== "" && !busy;

  const ask = async () => {
    setBusy(true);
    setError(null);
    setCases(null);
    try {
      const response = await fetch("/api/case-study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 보내는 것은 접속 코드와 지표명·평가항목 글자뿐이다. (숫자 값, 개선·추진사항 본문은 보내지 않는다)
        body: JSON.stringify({ code: code.trim(), name: name.trim(), item: item.trim() }),
      });
      const data: { cases?: CaseItem[]; remaining?: number; error?: string } = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "사례를 가져오지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
        return;
      }
      storeCode(code.trim());
      setCases(data.cases ?? []);
      setRemaining(typeof data.remaining === "number" ? data.remaining : null);
    } catch {
      setError("서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2" data-testid="case-study">
      {!open ? (
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)} data-testid="case-open">
          타기관 우수사례 추천 받기
        </button>
      ) : (
        <div className="rounded-2xl border border-sky-300/30 bg-sky-300/[.04] p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-sky-100">타기관 우수사례 추천 (AI)</p>
            <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
              접기
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            누르면 <strong className="text-gray-200">지표명과 세부 평가항목 글자만</strong> 외부 AI(OpenAI)로 보내 공공·민간
            우수사례를 웹에서 찾습니다. 지표 값(숫자)과 개선·추진사항 내용은 보내지 않습니다.
          </p>

          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-gray-400">
              접속 코드
              <input
                type="password"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="off"
                className="field w-44 text-sm"
                data-testid="case-code"
              />
            </label>
            <button type="button" className="btn btn-primary" disabled={!canAsk} onClick={() => void ask()} data-testid="case-ask">
              {busy ? "찾는 중…" : "사례 찾기"}
            </button>
          </div>
          {name.trim().length < 2 && <p className="mt-1 text-xs text-amber-200/80">지표명을 먼저 입력해 주세요.</p>}

          {busy && (
            <p role="status" className="mt-2 text-xs text-gray-400">
              웹에서 사례를 검색하고 있습니다. 10~30초 걸릴 수 있습니다.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs text-red-400" data-testid="case-error">
              {error}
            </p>
          )}

          {cases && (
            <div className="mt-3 space-y-2" data-testid="case-results">
              {cases.length === 0 ? (
                <p className="text-xs text-gray-400">
                  출처가 확인되는 사례를 찾지 못했습니다. 지표명을 더 구체적으로 적거나 잠시 뒤 다시 시도해 보세요.
                </p>
              ) : (
                <ul className="space-y-2">
                  {cases.map((c) => (
                    <li key={c.url} className="rounded-xl border border-white/10 bg-white/[.03] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] ${
                            c.sector === "공공" ? "bg-sky-300/15 text-sky-200" : "bg-violet-300/15 text-violet-200"
                          }`}
                        >
                          {c.sector}
                        </span>
                        <span className="font-medium text-white">{c.org}</span>
                      </div>
                      <p className="mt-1 text-gray-200">{c.summary}</p>
                      {c.apply && <p className="mt-1 text-gray-300">적용할 점: {c.apply}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-sky-300 underline underline-offset-2 hover:text-white"
                        >
                          출처 열기
                        </a>
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={added.has(c.url)}
                          onClick={() => {
                            onInsert(caseToNote(c));
                            setAdded((current) => new Set(current).add(c.url));
                          }}
                        >
                          {added.has(c.url) ? "추가함" : "개선, 추진사항에 참고해 적기"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] leading-relaxed text-gray-500">
                AI가 웹 검색 결과를 바탕으로 만든 참고 의견입니다. 틀린 내용이 있을 수 있으니 반드시 출처 원문을 확인한 뒤
                사용하세요.
                {remaining !== null && ` (오늘 남은 횟수 ${remaining}회)`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
