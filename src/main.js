import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import './style.css'
import App from './App.vue'

// 导入组件
import PhotoReconstruction from './components/PhotoReconstruction.vue'
import VideoPage from './components/VideoPage.vue'
import Supersplat from './components/Supersplat.vue'

// 路由配置
const routes = [
  { path: '/', redirect: '/photo-reconstruction' },
  { path: '/photo-reconstruction', component: PhotoReconstruction },
  { path: '/video', component: VideoPage },
  { path: '/supersplat', component: Supersplat }
]

// 创建路由实例
const router = createRouter({
  history: createWebHistory(),
  routes
})

// 添加全局路由守卫，保护/supersplat路由
router.beforeEach((to, from, next) => {
  if (to.path === '/supersplat') {
    // 检查是否可以访问3D模型页面
    const selectedVideoIndex = localStorage.getItem('selectedVideoIndex')
    const currentPlyUrl = localStorage.getItem('currentPlyUrl')
    
    // 只有当满足以下条件之一时才允许访问：
    // 1. selectedVideoIndex为具体索引值且有对应PLY文件
    // 2. 通过"加载默认PLY"按钮设置了正确的默认路径
    const canAccess = (selectedVideoIndex !== null && selectedVideoIndex !== 'default' && currentPlyUrl) || 
                     (selectedVideoIndex === 'default' && currentPlyUrl === '/supersplat-viewer/scene.compressed.ply')
    
    if (canAccess) {
      next()
    } else {
      // 不允许访问时，重定向到视频页面
      next('/video')
    }
  } else {
    // 其他路由直接放行
    next()
  }
})

// 创建应用并挂载
const app = createApp(App)
app.use(router)
app.mount('#app')