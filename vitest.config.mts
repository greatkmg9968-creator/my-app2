// 테스트 도구(Vitest) 설정. "@/..." 별칭이 tsconfig.json과 같은 위치(프로젝트 루트)를 가리키게 한다.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
