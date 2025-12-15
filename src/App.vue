<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// 定义导航项
const navItems = [
  { path: '/photo-reconstruction', label: '照片重建', icon: 'fa-camera' },
  { path: '/video', label: '视频', icon: 'fa-video' },
  { path: '/spark', label: '3D模型', icon: 'fa-cube' }
]

// 获取路由信息
const route = useRoute()
const router = useRouter()

// 计算当前激活的导航项
const activeNav = computed(() => route.path)

// 检查是否可以跳转到3D模型页面
const canNavigateToSpark = computed(() => {
  // 获取选中的视频索引和当前PLY文件URL
  const selectedVideoIndex = localStorage.getItem('selectedVideoIndex')
  const currentPlyUrl = localStorage.getItem('currentPlyUrl')
  
  // 默认允许访问第三个页面
  // 用户可以先跳转到3D模型页面，然后再加载模型
  return true;
})

// 导航到指定路径
const navigateTo = (path) => {
  // 移除导航限制，允许直接跳转到任何页面
  router.push(path)
}

// 组件挂载时
onMounted(() => {
  // 获取选中的视频索引和当前PLY文件URL
  const selectedVideoIndex = localStorage.getItem('selectedVideoIndex')
  const currentPlyUrl = localStorage.getItem('currentPlyUrl')
  
  // 检查是否是有效的默认状态（使用默认PLY文件）
  const isValidDefaultState = selectedVideoIndex === 'default' && currentPlyUrl
  
  // 检查是否是有效的视频索引状态（具体数字索引且有对应PLY文件）
  if (selectedVideoIndex !== null) {
    const plyUrl = localStorage.getItem(`plyUrl_${selectedVideoIndex}`)
    if (plyUrl) {
      localStorage.setItem('currentPlyUrl', plyUrl)
    }
  }
})
</script>

<template>
  <div class="app">
    <!-- 主内容区域 -->
    <div class="main-content" :class="{ 'full-height': route.path === '/spark' }">
      <router-view />
    </div>
    
    <!-- 底部导航栏 -->
    <nav class="bottom-nav">
      <div 
        v-for="item in navItems" 
        :key="item.path"
        class="nav-item"
        :class="{ 
          active: activeNav === item.path, 
          disabled: item.path === '/spark' && !canNavigateToSpark 
        }"
        @click="navigateTo(item.path)"
      >
        <i :class="['fas', item.icon]"></i>
        <span class="nav-label">{{ item.label }}</span>
      </div>
    </nav>
  </div>
</template>

<style>
.app {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background-color: #f8f8f8;
  color: #333;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  /* 为移动设备状态栏留出空间 */
  padding-top: env(safe-area-inset-top);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.main-content.full-height {
  height: 100%;
}

/* 修复移动端触摸滚动问题 */
.main-content {
  -webkit-overflow-scrolling: touch;
}

.main-content {
  width: 100%;
  height: calc(100vh - 80px - env(safe-area-inset-top));
  overflow: auto;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
}

.main-content.full-height {
  height: calc(100vh - env(safe-area-inset-top));
}

/* 3D模型页面专用样式 - 移除内边距让canvas完全平铺 */
.main-content.full-height {
  padding: 0;
  overflow: hidden;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 80px;
  background-color: #fff;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 1000;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 100%;
  color: #999;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
}

.nav-item.active {
  color: var(--color-primary);
}

.nav-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 3px;
  background: var(--color-primary);
  border-radius: 3px;
  animation: fadeIn 0.3s ease;
}

.nav-item .fas {
  font-size: 24px;
  margin-bottom: 6px;
  transition: transform 0.3s ease;
}

.nav-item:hover .fas {
  transform: translateY(-2px);
}

.nav-item.active .fas {
  transform: scale(1.1);
}

.nav-label {
  font-size: 12px;
  font-weight: 600;
  transition: transform 0.3s ease, color 0.3s ease;
  letter-spacing: 0.3px;
}

.nav-item:hover .nav-label {
  transform: translateY(-2px);
}

/* 禁用状态样式 */
.nav-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none; /* 真正阻止点击事件 */
}

.nav-item.disabled:hover {
  background-color: transparent;
  color: #666;
  pointer-events: none; /* 确保hover状态也不响应 */
}

.nav-item.active .nav-label {
  transform: scale(1.1);
  font-weight: 600;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px) translateX(-50%);
  }
  to {
    opacity: 1;
    transform: translateY(0) translateX(-50%);
  }
}

/* 移动端适配 */
@media (max-width: 768px) {
  body {
    padding-bottom: 70px;
  }
  
  .bottom-nav {
    height: 70px;
  }
  
  .main-content {
    min-height: calc(100vh - 70px);
  }
  
  .nav-item .fas {
    font-size: 18px;
  }
  
  .nav-label {
    font-size: 11px;
  }
}

/* 安全区域适配 */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .bottom-nav {
    padding-bottom: env(safe-area-inset-bottom);
    height: calc(80px + env(safe-area-inset-bottom));
  }
  
  body {
    padding-bottom: calc(80px + env(safe-area-inset-bottom));
  }
  
  @media (max-width: 768px) {
    .bottom-nav {
      height: calc(70px + env(safe-area-inset-bottom));
    }
    
    body {
      padding-bottom: calc(70px + env(safe-area-inset-bottom));
    }
  }
}

.nav-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 3px;
  background: var(--color-primary);
  border-radius: 3px;
  animation: fadeIn 0.3s ease;
}

.nav-item .fas {
  font-size: 24px;
  margin-bottom: 6px;
  transition: transform 0.3s ease;
}

.nav-item:hover .fas {
  transform: translateY(-2px);
}

.nav-item.active .fas {
  transform: scale(1.1);
}

.nav-label {
  font-size: 12px;
  font-weight: 600;
  transition: transform 0.3s ease, color 0.3s ease;
  letter-spacing: 0.3px;
}

.nav-item:hover .nav-label {
  transform: translateY(-2px);
}

.nav-item.active .nav-label {
  transform: scale(1.1);
  font-weight: 600;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px) translateX(-50%);
  }
  to {
    opacity: 1;
    transform: translateY(0) translateX(-50%);
  }
}

/* 移动端适配 */
@media (max-width: 768px) {
  body {
    padding-bottom: 70px;
  }
  
  .bottom-nav {
    height: 70px;
  }
  
  .main-content {
    min-height: calc(100vh - 70px);
  }
  
  .nav-item .fas {
    font-size: 18px;
  }
  
  .nav-label {
    font-size: 11px;
  }
}

/* 安全区域适配 */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .bottom-nav {
    padding-bottom: env(safe-area-inset-bottom);
    height: calc(80px + env(safe-area-inset-bottom));
  }
  
  body {
    padding-bottom: calc(80px + env(safe-area-inset-bottom));
  }
  
  @media (max-width: 768px) {
    .bottom-nav {
      height: calc(70px + env(safe-area-inset-bottom));
    }
    
    body {
      padding-bottom: calc(70px + env(safe-area-inset-bottom));
    }
  }
}
</style>