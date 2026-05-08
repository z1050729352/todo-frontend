import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],

  // 构建优化
  build: {
    // 目标现代浏览器，减少 polyfill 体积
    target: 'es2020',
    // chunk 大小警告阈值（游戏资源较大，适当放宽）
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // 手动分包：把大依赖单独拆出来，利用浏览器缓存
        manualChunks(id) {
          if (id.includes('node_modules/vue')) return 'vendor-vue';
          if (id.includes('node_modules/socket.io-client') || id.includes('node_modules/engine.io-client')) return 'vendor-socket';
          if (id.includes('node_modules/crypto-js')) return 'vendor-crypto';
          if (id.includes('node_modules/axios')) return 'vendor-axios';
        },
        // 资源文件名加 hash，利于长期缓存
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      }
    },
    // 启用 CSS 代码分割
    cssCodeSplit: true,
    // 生产环境移除 console/debugger（oxc minifier）
    minify: true,
  },

  // 开发服务器
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:12580',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:12580',
        ws: true,
        changeOrigin: true,
      },
    },
  },

  // 预构建优化（加速冷启动）
  optimizeDeps: {
    include: ['vue', 'socket.io-client', 'axios', 'crypto-js'],
  },
})
