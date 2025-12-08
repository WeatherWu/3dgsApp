import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    // 增加块大小警告的限制（可选）
    chunkSizeWarningLimit: 600, // 默认是500KB
    // 代码分割配置
    rollupOptions: {
      output: {
        manualChunks: {
          // 将Three.js相关依赖单独打包
          'three': ['three'],
          // 将Capacitor相关依赖单独打包
          'capacitor': ['@capacitor/core']
        }
      }
    }
  }
})