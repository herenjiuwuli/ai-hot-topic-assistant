import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // 关闭自动清空 dist：规避部分环境下 fs.rmSync 被安全删除拦截导致构建失败
  // 改用覆盖写入；如需彻底清理旧产物，手动删除 dist 目录即可
  build: {
    emptyOutDir: false,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})