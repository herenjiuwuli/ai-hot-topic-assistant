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
      // 2026-10-27 实测（补过程断言后）：语句 56.01 / 分支 45.43 / 函数 55.48 / 行 57.09（796 行）
      thresholds: {
        lines: 57,
        statements: 56,
        functions: 55,
        branches: 45,
      },
    },
    // 只跑 JS 单测；tests/ 里的 pytest(.py) 不受影响
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
})
