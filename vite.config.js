import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    // 配置代理，将API请求转发到后端服务器
    proxy: {
      '/api': {
        target: 'http://localhost:8000', // 这里填写后端服务器的IP地址和端口
        changeOrigin: true, // 允许跨域
        // rewrite: (path) => path.replace(/^\/api/, '') // 如果后端API没有/api前缀，可以使用这个配置去掉
      }
    }
  },
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