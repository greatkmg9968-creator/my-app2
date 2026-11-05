"use client";

// Design Ref: §15 자동 저장 — 이 컴퓨터의 브라우저에 저장해 둔 자료를 읽어 대시보드를 시작한다.
// Plan SC: 작업 15 — 저장된 자료가 있으면 그것으로, 없으면(처음) 샘플 지표와 샘플 부점 이름으로 시작한다.
//
// 브라우저 저장소는 브라우저에서만 읽을 수 있다. 서버에서 처음 그릴 때는 "불러오는 중"만 보여주고,
// 브라우저에서 이어받으면 저장된 자료를 읽어서 대시보드를 그린다.

import { useMemo, useSyncExternalStore } from "react";
import IndicatorDashboard from "@/components/IndicatorDashboard";
import { ensureIds } from "@/lib/records";
import { SAMPLE_BRANCH, SAMPLE_INDICATORS } from "@/lib/sampleData";
import { deserializeState, STORAGE_KEY } from "@/lib/storage";

/** 저장소 글자를 읽는다. 읽을 수 없으면(저장이 막힌 브라우저 등) null — 처음 쓰는 것과 같게 본다. */
function readSaved(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// 서버에서는 아직 읽지 않았다는 뜻으로 undefined를 쓴다.
const subscribeNothing = () => () => {};
const readOnServer = (): string | null | undefined => undefined;

export default function DashboardLoader() {
  const raw = useSyncExternalStore<string | null | undefined>(subscribeNothing, readSaved, readOnServer);

  // 저장된 글자를 읽어 처음 상태를 정한다. (이후에는 대시보드가 스스로 저장하므로 이 값은 처음 한 번만 쓰인다)
  const start = useMemo(() => {
    if (raw === undefined) return null;
    const loaded = deserializeState(raw);
    if (loaded === null) {
      return {
        indicators: SAMPLE_INDICATORS,
        branch: SAMPLE_BRANCH,
        notice: null as string | null,
      };
    }
    return {
      indicators: ensureIds(loaded.state.indicators),
      branch: loaded.state.branch,
      notice:
        loaded.dropped > 0
          ? `저장된 자료 중 올바르지 않은 지표 ${loaded.dropped}건은 읽지 못해 제외했습니다.`
          : null,
    };
  }, [raw]);

  if (start === null) {
    return (
      <p role="status" className="rounded-lg border border-dashed border-black/20 p-8 text-center text-sm dark:border-white/25">
        저장된 자료를 불러오는 중입니다.
      </p>
    );
  }

  return (
    <IndicatorDashboard
      initialIndicators={start.indicators}
      initialBranch={start.branch}
      initialNotice={start.notice}
    />
  );
}
