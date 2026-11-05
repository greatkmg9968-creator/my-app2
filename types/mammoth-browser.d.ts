// mammoth의 브라우저용 파일에는 타입 선언이 없어서, 쓰는 함수(글자만 뽑기)만 선언해 둔다.
declare module "mammoth/mammoth.browser" {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
}
