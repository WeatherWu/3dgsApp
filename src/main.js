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

// 创建应用并挂载
const app = createApp(App)
app.use(router)
app.mount('#app')