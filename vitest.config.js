import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 覆盖率：只统计后端（UI 由 E2E 与真机断言覆盖，不用单测数字充数）
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['server/**/*.js', 'api/**/*.js'],
      exclude: ['**/node_modules/**', 'tests/**', 'dist/**'],
      // 基线锁：当前实测值向下取整，改代码时不许把覆盖偷偷降下去
      // 2026-10-27 实测：语句 53.54 / 分支 41.87 / 函数 53.06 / 行 54.83（796 行）
      thresholds: {
        lines: 54,
        statements: 53,
        functions: 53,
        branches: 41,
      },
    },
    // 只跑 JS 单测；tests/ 里的 pytest(.py) 不受影响
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
})
