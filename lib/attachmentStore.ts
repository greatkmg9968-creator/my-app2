// Design Ref: §16 첨부파일 저장소 — 올린 파일을 이 컴퓨터의 브라우저(IndexedDB)에 보관한다.
// Plan SC: 작업 19 — 각 지표별 추진과제·실적자료 파일(한글·엑셀·PDF 등) 업로드. 서버로는 아무것도 보내지 않는다.
//
// 파일 내용만 여기에 두고, 이름·크기 같은 정보는 지표(Indicator.attachments)에 둔다.
// 브라우저에서만 쓸 수 있다. (서버나 테스트 환경에는 IndexedDB가 없다)

const DB_NAME = "performance-dashboard-files";
const STORE_NAME = "files";
const DB_VERSION = 1;

/** 이 브라우저가 파일 저장소(IndexedDB)를 쓸 수 있으면 true */
export function isFileStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/** 저장소를 연다. 처음이면 만든다. */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isFileStorageAvailable()) {
      reject(new Error("이 브라우저에서는 파일 저장소를 쓸 수 없습니다."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("파일 저장소를 열지 못했습니다."));
  });
}

/** 저장소에서 작업 하나를 하고 끝나면 저장소를 닫는다. */
async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = work(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request ? request.result : undefined);
      transaction.onerror = () => reject(transaction.error ?? new Error("파일 저장소 작업에 실패했습니다."));
      transaction.onabort = () => reject(transaction.error ?? new Error("파일 저장소 작업이 중단되었습니다."));
    });
  } finally {
    db.close();
  }
}

/** 파일 내용을 번호(id)로 저장한다. 저장 공간이 모자라면 오류를 던진다. */
export async function saveFile(id: string, file: Blob): Promise<void> {
  await withStore("readwrite", (store) => {
    store.put(file, id);
  });
}

/** 번호(id)로 파일 내용을 꺼낸다. 없으면 null */
export async function loadFile(id: string): Promise<Blob | null> {
  const result = await withStore<Blob | undefined>("readonly", (store) => store.get(id) as IDBRequest<Blob | undefined>);
  return result ?? null;
}

/** 번호(id)들의 파일을 지운다. 없는 번호는 무시한다. */
export async function deleteFiles(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await withStore("readwrite", (store) => {
    for (const id of ids) store.delete(id);
  });
}

/** 저장된 모든 파일을 지운다. */
export async function clearAllFiles(): Promise<void> {
  await withStore("readwrite", (store) => {
    store.clear();
  });
}

/** 저장된 모든 파일의 번호를 돌려준다. */
export async function listFileIds(): Promise<string[]> {
  const keys = await withStore<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
  return (keys ?? []).map(String);
}

/**
 * 지표에 연결되지 않은 파일(번호가 keepIds에 없는 파일)을 지운다.
 * 지표를 지우거나 엑셀로 바꿨을 때 남은 파일을 치워 저장 공간을 아끼려는 것이다.
 */
export async function pruneFiles(keepIds: ReadonlySet<string>): Promise<void> {
  const stored = await listFileIds();
  await deleteFiles(stored.filter((id) => !keepIds.has(id)));
}
