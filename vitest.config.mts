/**
 * @file: vitest.config.mts
 * @description:
 *   Конфигурация Vitest для unit-тестов приложения водителя.
 *
 *   Покрываются ЧИСТЫЕ функции (`src/lib/utils.ts` и подобные) — те, что не
 *   импортируют react-native и потому исполняются в обычном node, без
 *   нативного окружения и без jest-preset'а Expo. Компоненты здесь не
 *   тестируются: их проверка — сборка APK и прогон на эмуляторе.
 *
 *   `pool: 'forks'` — как в админке: worker_threads в Vitest 4.x на Windows
 *   нестабильны, forks изолированы полностью, цена в скорости пренебрежима.
 *
 *   `globals: false` (в отличие от админки) — тесты импортируют describe/it/
 *   expect явно. Иначе пришлось бы дописывать `types: ["vitest/globals"]` в
 *   tsconfig.json, который здесь наследуется от `expo/tsconfig.base` и
 *   обслуживает сборку приложения; тестовая настройка не должна на неё
 *   влиять.
 *
 *   Расширение .mts — конфиг использует ESM-синтаксис, а package.json без
 *   "type": "module"; иначе Vite грузит его как CommonJS и предупреждает.
 * @dependencies: vitest
 * @created: 2026-08-28 (v1.5.13)
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    pool: 'forks',
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'android', 'ios', '.expo'],
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
