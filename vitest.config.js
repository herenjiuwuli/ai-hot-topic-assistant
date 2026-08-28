import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 只跑 JS 单测；tests/ 里的 pytest(.py) 不受影响
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
})
