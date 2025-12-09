<template>
  <div class="video-page">
    <div class="page-header">
      <h1><i class="fas fa-video"></i> 视频管理</h1>
      <p class="page-description">查看和管理所有视频（录制和上传）</p>
    </div>

    <!-- 视频列表 -->
    <div v-if="videos.length > 0" class="video-list-section">
      <h2><i class="fas fa-list"></i> 所有视频</h2>
      <div class="video-grid">
        <div 
          v-for="(video, index) in videos" 
          :key="index" 
          class="video-item"
          :class="{ 'selected': selectedVideoIndex === index }"
          @click="selectVideo(index)"
        >
          <div class="video-thumbnail-container">
            <video 
              :src="video" 
              class="video-thumbnail"
              @loadeddata="generateThumbnail(video, index)"
              preload="metadata"
            ></video>
            <div v-if="videoThumbnails[index]" class="video-cover" @click.stop="playVideo(video)">
              <img :src="videoThumbnails[index]" alt="视频封面" class="cover-image" />
              <div class="play-overlay">
                <i class="fas fa-play"></i>
              </div>
            </div>
            <div v-else class="video-placeholder">
              <i class="fas fa-video"></i>
              <span>加载中...</span>
            </div>
          </div>
          <div class="video-info">
            <span class="video-title">视频 {{ index + 1 }}</span>
            
            <!-- 重建进度显示 -->
            <div class="reconstruct-status-section">
              <div class="status-indicator">
                <span 
                  class="status-dot" 
                  :style="{ backgroundColor: getReconstructStatusColor(reconstructStatuses[index]?.status || 'not_started') }"
                ></span>
                <span class="status-text">{{ getReconstructStatusText(reconstructStatuses[index]?.status || 'not_started') }}</span>
              </div>
              
              <div v-if="reconstructStatuses[index]?.status === 'processing'" class="progress-container">
                <div class="progress-bar">
                  <div 
                    class="progress-fill" 
                    :style="{ width: reconstructStatuses[index]?.progress + '%' }"
                  ></div>
                </div>
                <span class="progress-text">{{ reconstructStatuses[index]?.progress }}%</span>
              </div>
              
              <div v-if="reconstructStatuses[index]?.timestamp" class="status-timestamp">
                <i class="fas fa-clock"></i>
                {{ reconstructStatuses[index]?.timestamp }}
              </div>
            </div>
            
            <div class="video-actions">
              <button class="action-btn play-btn" @click.stop="playVideo(video)">
                <i class="fas fa-play"></i>
              </button>
              <button class="action-btn reconstruct-btn" @click.stop="startReconstruction(index)" :disabled="reconstructStatuses[index]?.status === 'processing'">
                <i class="fas fa-cube"></i>
              </button>
              <button class="action-btn reset-btn" @click.stop="resetReconstructStatus(index)" :disabled="reconstructStatuses[index]?.status === 'processing'">
                <i class="fas fa-redo"></i>
              </button>
              <button class="action-btn delete-btn" @click.stop="deleteVideo(index)">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state-content">
      <i class="fas fa-video-slash"></i>
      <h3>暂无视频</h3>
      <p>请前往主页录制或上传视频</p>
    </div>

    <!-- 视频播放器弹窗 -->
    <div v-if="showVideoPlayer" class="modal">
      <div class="modal-overlay" @click="closeVideoPlayer"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h3><i class="fas fa-play-circle"></i> 视频播放</h3>
          <button class="close-button" @click="closeVideoPlayer">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <video :src="currentVideo" class="fullscreen-video" controls autoplay></video>
        </div>
      </div>
    </div>

    <!-- 3D重建弹窗 -->
    <div v-if="show3DReconstruct" class="modal">
      <div class="modal-overlay" @click="close3DReconstruct"></div>
      <div class="modal-content reconstruct-modal">
        <div class="modal-header">
          <h3><i class="fas fa-cube"></i> 三维重建</h3>
          <button class="close-button" @click="close3DReconstruct">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <!-- 视频预览 -->
          <div class="video-preview-section">
            <h4>源视频</h4>
            <video :src="currentReconstructVideo" class="preview-video" controls></video>
          </div>
          
          <!-- 进度条 -->
          <div v-if="isProcessing" class="progress-section">
            <h4><i class="fas fa-sync-alt"></i> 三维重建进度</h4>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: progress + '%' }"></div>
            </div>
            <div class="progress-text">{{ progress }}% - 正在处理中...</div>
          </div>
          
          <!-- 3D模型显示区域 -->
          <div v-if="show3DModel" class="model-section">
            <h4><i class="fas fa-cube"></i> 三维模型预览</h4>
            <div id="model-container" class="model-container"></div>
            <p class="model-tip"><i class="fas fa-check-circle"></i> 模型已生成完成，可进行旋转、缩放等交互操作</p>
          </div>
          
          <!-- 重建按钮 -->
          <div v-if="!isProcessing && !show3DModel" class="reconstruct-actions">
            <button class="reconstruct-button" @click="start3DReconstruction">
              <i class="fas fa-cube"></i> 开始3D重建
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import * as THREE from 'three'

const router = useRouter()
const route = useRoute()
const videos = ref([])
const videoThumbnails = ref({})
const showVideoPlayer = ref(false)
const currentVideo = ref('')
const show3DReconstruct = ref(false)
const currentReconstructVideo = ref('')
const isProcessing = ref(false)
const progress = ref(0)
const show3DModel = ref(false)

// 重建状态管理
const reconstructStatuses = ref({})

// 选中的视频索引
const selectedVideoIndex = ref(null)

// 选择视频
const selectVideo = (index) => {
  selectedVideoIndex.value = index
  localStorage.setItem('selectedVideoIndex', index)
  
  // 检查该视频是否有对应的PLY文件
  const plyUrl = localStorage.getItem(`plyUrl_${index}`)
  localStorage.setItem('currentPlyUrl', plyUrl || '')
}

// Three.js相关变量
let scene, camera, renderer
let pointCloud
let mouseDown = false
let lastMouseX = 0
let lastMouseY = 0
let rotationX = 0
let rotationY = 0
let scale = 1

// 从本地存储加载视频
const loadVideos = () => {
  try {
    const savedVideos = localStorage.getItem('photoReconstructionVideos')
    if (savedVideos) {
      const parsedVideos = JSON.parse(savedVideos)
      // 确保是有效的数组并且不为空
      if (Array.isArray(parsedVideos)) {
        videos.value = parsedVideos.filter(video => video && typeof video === 'string')
      } else {
        videos.value = []
      }
      
      // 为每个视频生成缩略图
      videos.value.forEach((video, index) => {
        generateThumbnail(video, index)
      })
    } else {
      videos.value = []
    }
  } catch (error) {
    console.error('加载视频失败:', error)
    videos.value = []
  }
}

// 生成视频缩略图
const generateThumbnail = (videoUrl, index) => {
  const video = document.createElement('video')
  video.src = videoUrl
  video.currentTime = 1 // 获取第1秒的画面作为封面
  
  video.addEventListener('loadeddata', () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    // 设置canvas尺寸
    canvas.width = 320
    canvas.height = 180
    
    // 绘制视频帧到canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    // 将canvas转换为base64图片
    const thumbnailUrl = canvas.toDataURL('image/jpeg')
    
    // 更新缩略图
    videoThumbnails.value = {
      ...videoThumbnails.value,
      [index]: thumbnailUrl
    }
  })
  
  video.addEventListener('error', () => {
    // 如果生成缩略图失败，使用默认图标
    videoThumbnails.value = {
      ...videoThumbnails.value,
      [index]: null
    }
  })
}

// 播放视频
const playVideo = (videoUrl) => {
  currentVideo.value = videoUrl
  showVideoPlayer.value = true
}

// 关闭视频播放器
const closeVideoPlayer = () => {
  showVideoPlayer.value = false
  currentVideo.value = ''
}

// 三维重建视频
const reconstructVideo = (videoUrl) => {
  currentReconstructVideo.value = videoUrl
  show3DReconstruct.value = true
  isProcessing.value = false
  progress.value = 0
  show3DModel.value = false
  cleanupScene()
}

// 关闭3D重建弹窗
const close3DReconstruct = () => {
  show3DReconstruct.value = false
  currentReconstructVideo.value = ''
  isProcessing.value = false
  show3DModel.value = false
  cleanupScene()
}

// 通用的3D重建核心函数
const perform3DReconstruction = async (videoUrl, onProgressUpdate, onComplete) => {
  try {
    // 1. 从视频URL获取视频文件
    const videoBlob = await fetch(videoUrl).then(res => res.blob())
    const formData = new FormData()
    formData.append('video', videoBlob, 'reconstruction_video.mp4')
    
    // 2. 上传视频到后端
    const uploadResponse = await fetch('/api/reconstruct', {
      method: 'POST',
      body: formData
    })
    
    if (!uploadResponse.ok) {
      throw new Error('视频上传失败')
    }
    
    // 3. 获取任务ID
    const taskData = await uploadResponse.json()
    const taskId = taskData.taskId
    
    // 4. 轮询检查任务状态
    let taskStatus = 'processing'
    while (taskStatus === 'processing') {
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const statusResponse = await fetch(`/api/task/${taskId}`)
      const statusData = await statusResponse.json()
      
      taskStatus = statusData.status
      const progress = statusData.progress || 0
      
      // 调用进度更新回调
      if (onProgressUpdate) {
        onProgressUpdate(progress)
      }
      
      if (taskStatus === 'error') {
        throw new Error('3D重建失败: ' + (statusData.message || '未知错误'))
      }
    }
    
    // 5. 任务完成，获取PLY文件URL
    const plyUrl = taskData.resultUrl
    
    // 调用完成回调
    if (onComplete) {
      onComplete(plyUrl)
    }
    
    return plyUrl
    
  } catch (error) {
    console.error(`重建失败:`, error)
    throw error
  }
}

// 开始3D重建（弹窗内使用）
const start3DReconstruction = async () => {
  if (!currentReconstructVideo.value) return
  
  try {
    isProcessing.value = true
    progress.value = 0
    show3DModel.value = false
    
    await perform3DReconstruction(
      currentReconstructVideo.value,
      (newProgress) => {
        progress.value = newProgress
      },
      (plyUrl) => {
          progress.value = 100
          localStorage.setItem('latestPlyUrl', plyUrl)
          
          // 如果当前正在重建的视频是选中的视频，更新currentPlyUrl
          if (selectedVideoIndex.value !== null && videos.value[selectedVideoIndex.value] === currentReconstructVideo.value) {
            localStorage.setItem('currentPlyUrl', plyUrl)
          }
          
          setTimeout(() => {
            show3DModel.value = true
            isProcessing.value = false
          }, 500)
        }
    )
  } catch (err) {
    console.error('3D重建失败:', err)
    alert('3D重建失败: ' + err.message)
    isProcessing.value = false
  }
}

// 初始化3D场景
const init3DScene = () => {
  // 创建场景
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf0f0f0)
  
  // 创建相机
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
  camera.position.z = 5
  
  // 创建渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(400, 300)
  
  // 将渲染器添加到DOM
  const container = document.getElementById('model-container')
  if (container) {
    container.innerHTML = ''
    container.appendChild(renderer.domElement)
  }
  
  // 添加环境光
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambientLight)
  
  // 添加方向光
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
  directionalLight.position.set(1, 1, 1)
  scene.add(directionalLight)
  
  // 创建点云（模拟3DGS模型）
  createPointCloud()
  
  // 添加鼠标/触摸事件监听
  setupTouchControls()
  
  // 开始渲染循环
  const animate = () => {
    requestAnimationFrame(animate)
    
    // 更新模型旋转
    if (pointCloud) {
      pointCloud.rotation.y = rotationY
      pointCloud.rotation.x = rotationX
      pointCloud.scale.set(scale, scale, scale)
    }
    
    renderer.render(scene, camera)
  }
  animate()
}

// 创建点云
const createPointCloud = () => {
  const geometry = new THREE.BufferGeometry()
  const points = []
  const colors = []
  
  // 生成随机点云数据
  for (let i = 0; i < 1000; i++) {
    const x = (Math.random() - 0.5) * 4
    const y = (Math.random() - 0.5) * 4
    const z = (Math.random() - 0.5) * 4
    
    // 简单的形状模拟（球体）
    const distance = Math.sqrt(x * x + y * y + z * z)
    if (distance < 1.5 && distance > 0.8) {
      points.push(x, y, z)
      
      // 颜色渐变
      const intensity = 0.5 + 0.5 * Math.sin(z * 2)
      colors.push(intensity, intensity * 0.8, intensity * 0.6)
    }
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  
  const material = new THREE.PointsMaterial({
    size: 0.02,
    vertexColors: true,
    transparent: true,
    opacity: 0.8
  })
  
  pointCloud = new THREE.Points(geometry, material)
  scene.add(pointCloud)
}

// 设置触摸控制
const setupTouchControls = () => {
  const container = document.getElementById('model-container')
  if (!container) return
  
  // 鼠标事件
  container.addEventListener('mousedown', (e) => {
    mouseDown = true
    lastMouseX = e.clientX
    lastMouseY = e.clientY
  })
  
  window.addEventListener('mousemove', (e) => {
    if (!mouseDown) return
    
    const deltaX = e.clientX - lastMouseX
    const deltaY = e.clientY - lastMouseY
    
    rotationY += deltaX * 0.01
    rotationX += deltaY * 0.01
    
    lastMouseX = e.clientX
    lastMouseY = e.clientY
  })
  
  window.addEventListener('mouseup', () => {
    mouseDown = false
  })
}

// 清理3D场景
const cleanupScene = () => {
  if (renderer) {
    renderer.dispose()
    const container = document.getElementById('model-container')
    if (container) {
      container.innerHTML = ''
    }
    
    // 清理场景和相机
    if (scene) {
      scene.clear()
    }
    camera = null
    scene = null
    renderer = null
    pointCloud = null
  }
  
  // 重置控制变量
  rotationX = 0
  rotationY = 0
  scale = 1
}

// 更新重建状态
const updateReconstructStatus = (videoIndex, status, progress = 0) => {
  reconstructStatuses.value = {
    ...reconstructStatuses.value,
    [videoIndex]: {
      status, // 'not_started', 'processing', 'completed', 'error'
      progress, // 0-100
      timestamp: new Date().toLocaleString()
    }
  }
}

// 获取重建状态显示文本
const getReconstructStatusText = (status) => {
  const statusMap = {
    'not_started': '未开始重建',
    'processing': '重建中',
    'completed': '重建完成',
    'error': '重建失败'
  }
  return statusMap[status] || '未知状态'
}

// 获取重建状态颜色
const getReconstructStatusColor = (status) => {
  const colorMap = {
    'not_started': '#666',
    'processing': '#1890ff',
    'completed': '#52c41a',
    'error': '#ff4d4f'
  }
  return colorMap[status] || '#666'
}

// 开始重建（列表中直接使用）
const startReconstruction = async (videoIndex) => {
  if (!videos.value[videoIndex]) return
  
  try {
    const videoUrl = videos.value[videoIndex]
    updateReconstructStatus(videoIndex, 'processing', 0)
    
    await perform3DReconstruction(
      videoUrl,
      (newProgress) => {
        updateReconstructStatus(videoIndex, 'processing', newProgress)
      },
      (plyUrl) => {
        updateReconstructStatus(videoIndex, 'completed', 100)
        localStorage.setItem(`plyUrl_${videoIndex}`, plyUrl)
        
        // 如果该视频是当前选中的视频，更新currentPlyUrl
        if (selectedVideoIndex.value === videoIndex) {
          localStorage.setItem('currentPlyUrl', plyUrl)
        }
      }
    )
  } catch (error) {
    console.error(`重建失败:`, error)
    updateReconstructStatus(videoIndex, 'error', 0)
    alert(`视频 ${videoIndex + 1} 重建失败: ${error.message}`)
  }
}

// 重置重建状态
const resetReconstructStatus = (videoIndex) => {
  updateReconstructStatus(videoIndex, 'not_started', 0)
}

// 监听路由变化，检测是否需要自动重建
watch(() => route.query, (newQuery) => {
  if (newQuery.autoReconstruct === 'true' && videos.value.length > 0) {
    // 自动重建最新视频（最后一个视频）
    const latestVideoIndex = videos.value.length - 1
    startReconstruction(latestVideoIndex)
    
    // 清除查询参数，避免重复触发
    router.replace({ query: {} })
  }
}, { immediate: true })

// 组件挂载时初始化所有视频重建状态
onMounted(() => {
  loadVideos()
  // 初始化所有视频重建状态为未开始
  videos.value.forEach((_, index) => {
    updateReconstructStatus(index, 'not_started', 0)
  })
})

// 删除视频
const deleteVideo = (index) => {
  if (confirm('确定要删除这个视频吗？')) {
    videos.value.splice(index, 1)
    localStorage.setItem('photoReconstructionVideos', JSON.stringify(videos.value))
  }
}

// 返回主页
const goToHome = () => {
  router.push('/')
}

onUnmounted(() => {
  cleanupScene()
})
</script>

<style scoped>
@import './VideoPage.css';

/* 添加一些Vue组件特有的样式，覆盖CSS文件中的样式 */
.video-page {
  padding-bottom: 80px; /* 为底部导航栏留出空间 */
}
</style>