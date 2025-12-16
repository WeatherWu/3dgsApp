<template>
    
    <div class="video-page-container">
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
                :src="typeof video === 'object' ? (video.blobUrl || video.filePath) : video" 
                class="video-thumbnail"
                @loadeddata="generateThumbnail(typeof video === 'object' ? (video.blobUrl || video.filePath) : video, index)"
                preload="metadata"
              ></video>
              <div v-if="videoThumbnails[index]" class="video-cover" @click.stop="playVideo(typeof video === 'object' ? (video.blobUrl || video.filePath) : video)">
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
                
                <div v-if="reconstructStatuses[index]?.status === 'processing' || reconstructStatuses[index]?.status === 'downloading_ply'" class="progress-container">
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
                <button class="action-btn play-btn" @click.stop="playVideo(typeof video === 'object' ? video.blobUrl : video)">
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
    </div>
</template>

<script setup>
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { ref, onMounted, onUnmounted, onActivated, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import * as THREE from 'three'

const router = useRouter()
const route = useRoute()
const videos = ref([])
const videoThumbnails = ref({})
const showVideoPlayer = ref(false)
const currentVideo = ref('')

// 重建状态管理
const reconstructStatuses = ref({})

// 轮询状态跟踪，防止重复启动轮询
const pollingTimers = ref({})

// 选中的视频索引
const selectedVideoIndex = ref(null)

// 选择视频
const selectVideo = (index) => {
  selectedVideoIndex.value = index
  localStorage.setItem('selectedVideoIndex', index)
  
  // 检查该视频是否有对应的PLY文件
  const plyUrl = localStorage.getItem(`plyUrl_${index}`)
  localStorage.setItem('currentPlyUrl', plyUrl || '')
  
  // 调试信息
  console.log('selectVideo - 更新选择状态:')
  console.log('  selectedVideoIndex.value:', selectedVideoIndex.value)
  console.log('  localStorage.selectedVideoIndex:', localStorage.getItem('selectedVideoIndex'))
  console.log('  plyUrl:', plyUrl)
  console.log('  localStorage.currentPlyUrl:', localStorage.getItem('currentPlyUrl'))
}



// 从本地存储加载视频
const loadVideos = async () => {
  try {
    const savedVideos = localStorage.getItem('photoReconstructionVideos')
    if (savedVideos) {
      const parsedVideos = JSON.parse(savedVideos)
      // 确保是有效的数组并且不为空
      if (Array.isArray(parsedVideos)) {
        videos.value = []
        
        // 批量处理视频URL，确保URL的有效性
        const processVideoUrl = async (videoItem, originalIndex) => {
          try {
            // 如果是视频元数据对象（新的存储格式）
            if (typeof videoItem === 'object' && videoItem !== null) {
              // 如果包含base64数据，重新创建Blob URL
              if (videoItem.base64Data) {
                try {
                  const parts = videoItem.base64Data.split(';base64,')
                  const contentType = parts[0].split(':')[1]
                  const raw = window.atob(parts[1])
                  const rawLength = raw.length
                  const uInt8Array = new Uint8Array(rawLength)
                  
                  for (let i = 0; i < rawLength; ++i) {
                    uInt8Array[i] = raw.charCodeAt(i)
                  }
                  
                  const videoBlob = new Blob([uInt8Array], { type: contentType })
                  const newBlobUrl = URL.createObjectURL(videoBlob)
                  console.log('已从Base64数据重新创建Blob URL:', newBlobUrl)
                  // 返回更新后的对象，包含新的Blob URL
                  return {
                    ...videoItem,
                    blobUrl: newBlobUrl
                  }
                } catch (base64Error) {
                  console.error(`处理Base64数据失败 (索引${originalIndex}):`, base64Error)
                  return null
                }
              } else if (videoItem.filePath) {
                // 处理本地文件路径
                try {
                  const response = await fetch(videoItem.filePath)
                  const videoBlob = await response.blob()
                  const newBlobUrl = URL.createObjectURL(videoBlob)
                  console.log('已从本地文件路径创建Blob URL:', newBlobUrl)
                  return {
                    ...videoItem,
                    blobUrl: newBlobUrl
                  }
                } catch (fileError) {
                  console.error(`处理本地文件失败 (索引${originalIndex}):`, fileError)
                  return null
                }
              } else {
                return videoItem
              }
            }
            // 如果是旧格式的URL字符串
            else if (typeof videoItem === 'string') {
              // 检查是否是Base64数据URL
              if (videoItem.startsWith('data:video/')) {
                // 如果是Base64数据URL，创建新的Blob URL用于播放
                console.log('检测到Base64数据URL，创建Blob URL:', videoItem)
                try {
                  // 从数据URL创建Blob对象
                  const parts = videoItem.split(';base64,')
                  const contentType = parts[0].split(':')[1]
                  const raw = window.atob(parts[1])
                  const rawLength = raw.length
                  const uInt8Array = new Uint8Array(rawLength)
                  
                  for (let i = 0; i < rawLength; ++i) {
                    uInt8Array[i] = raw.charCodeAt(i)
                  }
                  
                  const videoBlob = new Blob([uInt8Array], { type: contentType })
                  const newBlobUrl = URL.createObjectURL(videoBlob)
                  console.log('已将Base64数据URL转换为Blob URL:', newBlobUrl)
                  // 返回视频对象，包含原始base64数据和新的Blob URL
                  return {
                    base64Data: videoItem,
                    blobUrl: newBlobUrl
                  }
                } catch (dataUrlError) {
                  console.error(`处理Base64数据URL失败 (索引${originalIndex}):`, dataUrlError)
                  return null
                }
              } else if (videoItem.startsWith('blob:')) {
                // 检测到旧的Blob URL，已经失效，跳过
                console.warn(`检测到已失效的Blob URL，将从列表中移除 (索引${originalIndex}):`, videoItem)
                return null
              } else {
                // 处理本地文件路径
                try {
                  const response = await fetch(videoItem)
                  const videoBlob = await response.blob()
                  const newBlobUrl = URL.createObjectURL(videoBlob)
                  console.log('已从本地文件路径创建Blob URL:', newBlobUrl)
                  // 返回视频对象，包含文件路径和新的Blob URL
                  return {
                    filePath: videoItem,
                    blobUrl: newBlobUrl
                  }
                } catch (fileError) {
                  console.error(`处理本地文件失败 (索引${originalIndex}):`, fileError)
                  return null
                }
              }
            }
            // 无效的视频格式
            else {
              console.warn(`检测到无效的视频格式，将从列表中移除 (索引${originalIndex}):`, videoItem)
              return null
            }
          } catch (error) {
            console.error(`处理视频URL失败 (索引${originalIndex}):`, error)
            // 如果处理失败，返回null表示这个URL无效
            return null
          }
        }
        
        // 并发处理所有视频URL
        const processAllVideos = async () => {
          const processedVideos = await Promise.all(
            parsedVideos.map((video, index) => processVideoUrl(video, index))
          )
          
          // 过滤掉处理失败的视频
          const validVideos = processedVideos.filter(video => video !== null)
          
          // 更新videos数组
          videos.value = validVideos
          
          // 更新localStorage，确保存储的是持久化数据而不是临时Blob URL
          const videosToStore = validVideos.map(video => {
            if (typeof video === 'object' && video !== null) {
              // 只存储base64数据或文件路径，不存储临时的Blob URL
              return {
                base64Data: video.base64Data,
                filePath: video.filePath
              }
            }
            return video
          })
          
          localStorage.setItem('photoReconstructionVideos', JSON.stringify(videosToStore))
          
          // 从本地存储加载重建状态
          const savedStatuses = localStorage.getItem('reconstructStatuses')
          let statusesObj = {}
          if (savedStatuses) {
            statusesObj = JSON.parse(savedStatuses)
          }
  
  // 为每个视频加载或初始化重建状态
  videos.value.forEach((_, index) => {
    // 优先使用本地存储的重建状态
    const savedStatus = statusesObj[index]
    if (savedStatus) {
      updateReconstructStatus(index, savedStatus.status, savedStatus.progress, savedStatus.taskId)
      
      // 检查是否有正在处理的任务，如果有，恢复轮询
      if (savedStatus.status === 'processing' && savedStatus.taskId) {
        console.log(`发现正在处理的任务，视频索引: ${index}，任务ID: ${savedStatus.taskId}，当前进度: ${savedStatus.progress}%`)
        
        // 恢复轮询，确保不会重复启动
        if (!pollingTimers.value[index]) {
          console.log(`启动轮询，视频索引: ${index}，任务ID: ${savedStatus.taskId}`)
          checkProgress(
            savedStatus.taskId,
            index,
            (newProgress, taskId) => {
              updateReconstructStatus(index, 'processing', newProgress, taskId)
            },
            async (plyUrl) => {
              // 调用统一下载函数，避免重复下载
              await downloadPlyFile(plyUrl, index)
              // 轮询完成后清除定时器标记
              delete pollingTimers.value[index]
            }
          )
          // 标记该视频已经启动了轮询
          pollingTimers.value[index] = true
        } else {
          console.log(`视频索引: ${index} 已经有轮询在运行，跳过重复启动`)
        }
      }
    } else {
      // 如果没有保存的状态，再检查PLY文件URL作为辅助判断
      const plyUrl = localStorage.getItem(`plyUrl_${index}`)
      if (plyUrl) {
        updateReconstructStatus(index, 'completed', 100)
      } else {
        // 默认状态为未开始
        updateReconstructStatus(index, 'not_started', 0)
      }
    }
  })
          
          // 检查是否需要处理路由参数（自动重建）
          if (route.query.autoReconstruct === 'true') {
            const videoIndex = parseInt(route.query.videoIndex) || videos.value.length - 1
            if (videoIndex >= 0 && videoIndex < videos.value.length) {
              startReconstruction(videoIndex)
              // 清除查询参数，避免重复触发
              router.replace({ query: {} })
            }
          }
          
          // 更新选中的视频索引和对应的PLY文件URL
          const currentSelectedIndex = localStorage.getItem('selectedVideoIndex')
          if (currentSelectedIndex === 'default') {
            selectedVideoIndex.value = 'default'
            localStorage.setItem('currentPlyUrl', '/supersplat-viewer/scene.compressed.ply')
          } else if (currentSelectedIndex !== null) {
            const index = parseInt(currentSelectedIndex)
            if (!isNaN(index) && index >= 0 && index < videos.value.length) {
              selectedVideoIndex.value = index
              const plyUrl = localStorage.getItem(`plyUrl_${index}`)
              localStorage.setItem('currentPlyUrl', plyUrl || '')
            }
          }
          
          // 初始化懒加载观察器
          initLazyLoading()
        }
        
        // 启动视频处理并等待完成
        await processAllVideos()
      } else {
        videos.value = []
      }
    } else {
      videos.value = []
    }
  } catch (error) {
    console.error('加载视频失败:', error)
    videos.value = []
  }
}

// 懒加载观察器
let observer = null

// 初始化懒加载功能
const initLazyLoading = () => {
  // 如果浏览器不支持IntersectionObserver API，直接为所有视频生成缩略图
  if (!('IntersectionObserver' in window)) {
    videos.value.forEach((video, index) => {
      generateThumbnail(typeof video === 'object' ? video.blobUrl : video, index)
    })
    return
  }
  
  // 配置观察器选项
  const options = {
    root: null, // 使用视口作为根元素
    rootMargin: '0px', // 没有边距
    threshold: 0.1 // 当视频的10%进入视口时触发
  }
  
  // 创建观察器
  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // 获取视频索引
        const index = parseInt(entry.target.dataset.videoIndex)
        if (!isNaN(index) && index >= 0 && index < videos.value.length) {
          // 生成缩略图
          const video = videos.value[index]
          generateThumbnail(typeof video === 'object' ? video.blobUrl : video, index)
          // 停止观察这个视频
          observer.unobserve(entry.target)
        }
      }
    })
  }, options)
  
  // 延迟观察视频元素，确保DOM已经渲染完成
  setTimeout(() => {
    // 观察所有视频元素
    const videoItems = document.querySelectorAll('.video-item')
    videoItems.forEach((item, index) => {
      // 设置数据属性存储索引
      item.dataset.videoIndex = index
      // 开始观察
      observer.observe(item)
    })
  }, 100)
}

// 组件卸载时清理观察器
onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
  
  // 释放所有Blob URL资源
  videos.value.forEach(videoItem => {
    // 提取实际的视频URL，处理对象和字符串两种情况
    const actualUrl = typeof videoItem === 'object' ? videoItem.blobUrl : videoItem;
    if (actualUrl && typeof actualUrl === 'string' && actualUrl.startsWith('blob:')) {
      URL.revokeObjectURL(actualUrl)
      console.log('已释放Blob URL资源:', actualUrl)
    }
  })
})

// 生成视频缩略图 - 优化版本
const generateThumbnail = (videoUrl, index) => {
  // 使用requestAnimationFrame确保在浏览器空闲时执行，避免阻塞主线程
  requestAnimationFrame(() => {
    const video = document.createElement('video')
    // 设置视频加载优先级为低，避免影响主内容加载
    video.loading = 'lazy'
    video.src = videoUrl
    // 使用更安全的方式获取视频帧，避免视频过短导致的错误
    video.currentTime = Math.min(1, video.duration || 1)
    
    video.addEventListener('loadeddata', () => {
      // 使用setTimeout将canvas绘制放在下一个事件循环，进一步避免阻塞
      setTimeout(() => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          
          // 适当降低缩略图分辨率，减少绘制时间和内存占用
          canvas.width = 240
          canvas.height = 135
          
          // 绘制视频帧到canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          
          // 使用更低的质量参数，减少数据量
          const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7)
          
          // 批量更新缩略图，减少Vue响应式系统的触发次数
          if (!videoThumbnails.value) videoThumbnails.value = {}
          videoThumbnails.value[index] = thumbnailUrl
          
          // 释放资源
          video.remove()
        } catch (error) {
          console.error('生成缩略图失败:', error)
          // 如果生成缩略图失败，使用默认图标
          if (!videoThumbnails.value) videoThumbnails.value = {}
          videoThumbnails.value[index] = null
        }
      }, 0)
    })
    
    video.addEventListener('error', () => {
      console.error('视频加载失败:', video.error)
      // 如果生成缩略图失败，使用默认图标
      if (!videoThumbnails.value) videoThumbnails.value = {}
      videoThumbnails.value[index] = null
    })
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

// 移除重复的onUnmounted钩子，保留第一个完整的清理逻辑

// 在组件挂载时加载视频
onMounted(() => {
  console.log('VideoPage组件挂载，开始加载视频...')
  loadVideos()
})


// 更新重建状态并保存到本地存储
const updateReconstructStatus = (videoIndex, status, progress = 0, taskId = null) => {
  const newStatus = {
    status, // 'not_started', 'processing', 'completed', 'error'
    progress, // 0-100
    timestamp: new Date().toLocaleString(),
    taskId // 保存任务ID，用于页面重启后恢复轮询
  }
  
  reconstructStatuses.value = {
    ...reconstructStatuses.value,
    [videoIndex]: newStatus
  }
  
  // 保存到本地存储
  const savedStatuses = localStorage.getItem('reconstructStatuses')
  let statusesObj = {}
  if (savedStatuses) {
    statusesObj = JSON.parse(savedStatuses)
  }
  statusesObj[videoIndex] = newStatus
  localStorage.setItem('reconstructStatuses', JSON.stringify(statusesObj))
}

// 获取重建状态显示文本
const getReconstructStatusText = (status) => {
  const statusMap = {
    'not_started': '未开始重建',
    'processing': '重建中',
    'downloading_ply': '下载PLY文件中',
    'completed': '重建完成',
    'error': '重建失败',
    'timeout_error': '连接超时失败'
  }
  return statusMap[status] || '未知状态'
}

// 获取重建状态颜色
const getReconstructStatusColor = (status) => {
  const colorMap = {
    'not_started': '#666',
    'processing': '#1890ff',
    'downloading_ply': '#1890ff', // 与重建中使用相同的蓝色
    'completed': '#52c41a',
    'error': '#ff4d4f',
    'timeout_error': '#ff4d4f' // 与错误状态使用相同的红色
  }
  return colorMap[status] || '#666'
}

// 使用环境变量定义后端API地址
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://202.38.79.182:8000'

// 检查是否在Capacitor应用中运行
const isCapacitorApp = Capacitor.isNativePlatform()

// 始终返回完整的API URL，避免代理问题
const getApiUrl = (endpoint) => {
  return `${apiBaseUrl}${endpoint}`
}

// 通用的3D重建核心函数
const perform3DReconstruction = async (videoUrl, videoIndex, onProgressUpdate, onComplete) => {
  try {
    
    // 1. 从视频URL获取视频文件
    console.log('处理视频URL:', videoUrl)
    let videoBlob;
    let actualVideoUrl = videoUrl;
    
    // 如果是视频元数据对象，获取实际的视频URL
    if (typeof videoUrl === 'object' && videoUrl !== null) {
      if (videoUrl.blobUrl) {
        actualVideoUrl = videoUrl.blobUrl;
      } else if (videoUrl.filePath) {
        actualVideoUrl = videoUrl.filePath;
      }
    }
    
    if (actualVideoUrl.startsWith('data:')) {
      // 处理Data URL（上传的视频）
      console.log('处理Data URL:', actualVideoUrl)
      const base64Data = actualVideoUrl.split(',')[1]
      const byteCharacters = atob(base64Data)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      videoBlob = new Blob([byteArray], { type: 'video/mp4' })
      console.log('Data URL读取成功，Blob大小:', videoBlob.size)
      
      // 创建一个新的Blob URL用于播放
      const newBlobUrl = URL.createObjectURL(videoBlob)
      
      // 更新videos数组中的视频对象
      if (typeof videos.value[videoIndex] === 'object') {
        videos.value[videoIndex].blobUrl = newBlobUrl;
      } else {
        // 如果是旧格式，转换为新的对象格式
        videos.value[videoIndex] = {
          base64Data: actualVideoUrl,
          blobUrl: newBlobUrl
        };
      }
      
      console.log('已将Data URL转换为新的Blob URL用于播放:', newBlobUrl)
    } else if (actualVideoUrl.startsWith('blob:')) {
      // 处理Blob URL
      console.log('处理Blob URL:', actualVideoUrl)
      const response = await fetch(actualVideoUrl)
      videoBlob = await response.blob()
      console.log('Blob URL读取成功，Blob大小:', videoBlob.size)
      
      // 创建一个新的Blob URL
      const newBlobUrl = URL.createObjectURL(videoBlob)
      
      // 更新videos数组中的视频对象
      if (typeof videos.value[videoIndex] === 'object') {
        videos.value[videoIndex].blobUrl = newBlobUrl;
      } else {
        // 如果是旧格式，转换为新的对象格式
        videos.value[videoIndex] = {
          blobUrl: newBlobUrl
        };
      }
      
      console.log('已更新blob URL为新的引用:', newBlobUrl)
    } else {
      // 处理本地文件路径（录制的视频）
      console.log('处理本地文件路径:', actualVideoUrl)
      
      // 检查是否是手机端的Capacitor文件路径
      if (Capacitor.isNativePlatform() && actualVideoUrl.startsWith('capacitor://')) {
        console.log('处理手机端Capacitor文件路径')
        
        // 提取实际的文件路径（去掉capacitor://localhost/_capacitor_file_/前缀）
        let filePath = actualVideoUrl.replace('capacitor://localhost/_capacitor_file_/', '')
        console.log('提取的实际文件路径:', filePath)
        
        // 使用Filesystem API读取视频文件
        try {
          const fileResult = await Filesystem.readFile({
            path: filePath
          })
          
          // 将base64内容转换为Blob
          const base64Data = fileResult.data
          const byteCharacters = atob(base64Data)
          const byteNumbers = new Array(byteCharacters.length)
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i)
          }
          const byteArray = new Uint8Array(byteNumbers)
          videoBlob = new Blob([byteArray], { type: 'video/mp4' })
          console.log('Filesystem读取成功，Blob大小:', videoBlob.size)
        } catch (fsError) {
          console.error('使用Filesystem API读取视频失败:', fsError)
          // 如果Filesystem API读取失败，尝试使用fetch作为备选方案
          console.log('尝试使用fetch作为备选方案')
          const response = await fetch(actualVideoUrl)
          videoBlob = await response.blob()
          console.log('fetch备选方案成功，Blob大小:', videoBlob.size)
        }
      } else {
        // Web平台的本地文件路径或其他格式
        const response = await fetch(actualVideoUrl)
        videoBlob = await response.blob()
        console.log('本地文件读取成功，Blob大小:', videoBlob.size)
      }
      
      // 创建一个新的Blob URL
      const newBlobUrl = URL.createObjectURL(videoBlob)
      
      // 更新videos数组中的视频对象
      if (typeof videos.value[videoIndex] === 'object') {
        videos.value[videoIndex].blobUrl = newBlobUrl;
      } else {
        // 如果是旧格式，转换为新的对象格式
        videos.value[videoIndex] = {
          filePath: actualVideoUrl,
          blobUrl: newBlobUrl
        };
      }
      
      console.log('已将本地文件路径转换为Blob URL:', newBlobUrl)
    }
    
    // 2. 创建FormData
    const formData = new FormData()
    formData.append('video', videoBlob, 'video.mp4')
    
    // 3. 发送视频到后端进行3D重建
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('视频上传请求超时')), 30000); // 30秒超时
    });
    
    const response = await Promise.race([
      fetch(`${getApiUrl('/api/reconstruct')}`, {
        method: 'POST',
        body: formData
      }),
      timeoutPromise
    ])
    
    if (!response.ok) {
      throw new Error(`视频上传失败: ${response.status} ${response.statusText}`)
    }
    
    const result = await response.json()
    const taskId = result.task_id
    
    // 更新重建状态，保存taskId
    onProgressUpdate(0, taskId)
    
    // 4. 开始轮询重建进度，确保不会重复启动
    if (!pollingTimers.value[videoIndex]) {
      console.log(`开始新的轮询任务，视频索引: ${videoIndex}，任务ID: ${taskId}`)
      checkProgress(taskId, videoIndex, onProgressUpdate, (plyUrl) => {
        onComplete(plyUrl)
        // 轮询完成后清除定时器标记
        delete pollingTimers.value[videoIndex]
      })
      // 标记该视频已经启动了轮询
      pollingTimers.value[videoIndex] = true
    } else {
      console.log(`视频索引: ${videoIndex} 已经有轮询在运行，跳过重复启动`)
    }
  } catch (error) {
    console.error('3D重建过程中发生错误:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      // 检查是否是网络错误
      isNetworkError: error instanceof TypeError && (error.message.includes('failed to fetch') || error.message.includes('NetworkError')),
      // 检查是否是CORS错误
      isCORSError: error.message.includes('CORS'),
      // 检查是否是超时错误
      isTimeoutError: error.name === 'TimeoutError'
    })
    throw error
  }
}

// 独立的轮询进度检查函数，支持页面重启后恢复轮询
const checkProgress = async (taskId, videoIndex, onProgressUpdate, onComplete, retryCount = 0) => {
  try {
    // 添加请求超时处理
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('请求超时')), 15000); // 15秒超时，后台运行时延长
    });
    
    const statusResponse = await Promise.race([
      fetch(getApiUrl(`/api/task/${taskId}`)),
      timeoutPromise
    ])
    const statusData = await statusResponse.json()
    
    let taskStatus = statusData.status
    const progress = statusData.progress || 0
    
    // 如果任务未完成，更新进度并继续轮询
      if (taskStatus !== 'completed' && taskStatus !== 'failed') {
        // 调用进度更新回调，同时保存taskId
        onProgressUpdate(progress, taskId)
        
        // 固定轮询间隔为5秒
        const pollingInterval = 5000; // 5秒轮询一次
        
        // 使用setTimeout而不是setInterval，更安全
        setTimeout(() => checkProgress(taskId, videoIndex, onProgressUpdate, onComplete), pollingInterval)
    } else if (taskStatus === 'completed') {
      // 任务完成，获取PLY文件URL
      let plyUrl = statusData.ply_url
      
      console.log('任务完成，获取到PLY文件URL:', plyUrl)
      
      // 确保PLY文件URL是完整的绝对URL
      if (plyUrl && !plyUrl.startsWith('http://') && !plyUrl.startsWith('https://')) {
        // 如果是相对路径，使用getApiUrl函数确保HTTPS连接
        if (plyUrl.startsWith('/')) {
          // 如果是根相对路径，直接使用getApiUrl
          plyUrl = getApiUrl(plyUrl)
        } else {
          // 如果是相对路径，添加斜杠后使用getApiUrl
          plyUrl = getApiUrl('/' + plyUrl)
        }
        console.log('转换后的完整PLY文件URL:', plyUrl)
      }
      
      // 检查PLY文件URL是否有效
      if (!plyUrl) {
        console.error('任务完成但未获取到有效的PLY文件URL')
        // 调用onComplete传递null，由调用者处理
        onComplete(null)
        return
      }
      
      onComplete(plyUrl)
    } else {
      throw new Error('3D重建失败')
    }
  } catch (error) {
    const isNetworkError = error instanceof TypeError && (error.message.includes('failed to fetch') || error.message.includes('NetworkError'));
    const isTimeoutError = error.name === 'TimeoutError';
    
    console.error('轮询进度时发生错误:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      // 检查是否是网络错误
      isNetworkError: isNetworkError,
      // 检查是否是CORS错误
      isCORSError: error.message.includes('CORS'),
      // 检查是否是超时错误
      isTimeoutError: isTimeoutError,
      retryCount: retryCount,
      taskId: taskId
    })
    
    // 网络错误或超时错误时，进行无限制重试
    if (isNetworkError || isTimeoutError) {
      // 重试间隔逐渐增加，但达到一定值后保持稳定
      const retryInterval = Math.min(5000 * (retryCount + 1), 30000); // 最多30秒重试一次
      console.log(`网络请求失败，${retryInterval}毫秒后重试 (第${retryCount + 1}次重试)`, taskId);
      
      // 重试
      setTimeout(() => checkProgress(taskId, videoIndex, onProgressUpdate, onComplete, retryCount + 1), retryInterval);
    } else {
      // 其他错误，更新状态
      console.error('轮询失败', taskId);
      // 设置错误状态
      updateReconstructStatus(videoIndex, 'error', 0, taskId);
    }
  }
}

// 开始重建（列表中直接使用）
const startReconstruction = async (videoIndex) => {
  if (!videos.value[videoIndex]) return
  
  try {
    // 第二次按下重建按钮时，删除原有的PLY文件和路径数据
    const oldPlyUrl = localStorage.getItem(`plyUrl_${videoIndex}`)
    if (oldPlyUrl) {
      // 删除本地存储的PLY文件路径
      localStorage.removeItem(`plyUrl_${videoIndex}`)
      
      // 如果该视频是当前选中的视频，也删除currentPlyUrl
      if (selectedVideoIndex.value === videoIndex) {
        localStorage.removeItem('currentPlyUrl')
      }
      
      // 尝试删除实际的PLY文件
      try {
        await Filesystem.deleteFile({
          path: oldPlyUrl,
          directory: Directory.Data
        })
        console.log('原有PLY文件已删除:', oldPlyUrl)
      } catch (deleteError) {
        console.error('删除原有PLY文件失败:', deleteError)
        // 即使删除文件失败，仍继续进行新的重建
      }
    }
    
    const videoUrl = videos.value[videoIndex]
    updateReconstructStatus(videoIndex, 'processing', 0)
    
    await perform3DReconstruction(
      videoUrl,
      videoIndex,
      (newProgress, taskId) => {
        updateReconstructStatus(videoIndex, 'processing', newProgress, taskId)
      },
      async (plyUrl) => {
        // 调用统一的下载函数（已整合重试逻辑）
        await downloadPlyFile(plyUrl, videoIndex)
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
  // 更新状态为未开始
  updateReconstructStatus(videoIndex, 'not_started', 0)
  
  // 删除对应的PLY文件URL
  localStorage.removeItem(`plyUrl_${videoIndex}`)
  
  // 如果该视频是当前选中的视频，也删除currentPlyUrl
  if (selectedVideoIndex.value === videoIndex) {
    localStorage.removeItem('currentPlyUrl')
  }
}

// 统一下载PLY文件函数
const downloadPlyFile = async (plyUrl, videoIndex, progress = 90) => {
  // 检查PLY URL是否有效
  if (!plyUrl) {
    console.error('下载PLY文件失败: PLY URL无效')
    // 下载失败时，不重置状态，保持completed状态，让用户可以重新尝试下载
    updateReconstructStatus(videoIndex, 'error', 100)
    return
  }
  
  // 检查是否已经有对应的PLY文件，避免重复下载
  // 注意：即使存在，也允许用户重新下载
  const existingPlyUrl = localStorage.getItem(`plyUrl_${videoIndex}`)
  if (existingPlyUrl) {
    console.log('该视频已存在PLY文件，将重新下载:', existingPlyUrl)
    // 不直接返回，继续下载以覆盖现有文件
  }
  
  // 检查plyUrl是否有效
  if (!plyUrl) {
    console.error('下载PLY文件失败：无效的URL')
    updateReconstructStatus(videoIndex, 'error', progress)
    throw new Error('无效的PLY文件URL')
  }
  
  let attempt = 0;
  const maxAttempts = 5; // 增加尝试次数
  
  while (attempt < maxAttempts) {
    try {
      attempt++;
      
      // 更新下载状态
      updateReconstructStatus(videoIndex, 'downloading_ply', progress)
      
      console.log(`第${attempt}次尝试下载PLY文件:`, plyUrl)
      
      // 添加请求超时处理
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('下载超时')), 30000); // 30秒超时
      });
      
      // 下载PLY文件
      const response = await Promise.race([
        fetch(plyUrl),
        timeoutPromise
      ])
      
      // 检查响应状态
      if (!response.ok) {
        throw new Error(`下载失败，HTTP状态码: ${response.status}`)
      }
      
      const blob = await response.blob()
      const arrayBuffer = await blob.arrayBuffer()
      
      // 转换为base64
      const uint8Array = new Uint8Array(arrayBuffer)
      let binaryString = ''
      for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i])
      }
      const base64Data = btoa(binaryString)
      
      // 保存到本地文件系统 - 使用固定文件名实现文件覆盖，避免重复下载
      const fileName = `ply_${videoIndex}.ply`
      await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Data,
        recursive: true
      })
      
      // 下载完成后更新状态
      updateReconstructStatus(videoIndex, 'completed', 100)
      
      // 保存本地文件路径到localStorage
      localStorage.setItem(`plyUrl_${videoIndex}`, fileName)
      localStorage.setItem('currentPlyUrl', fileName)
      
      // 更新选中的视频索引
      localStorage.setItem('selectedVideoIndex', videoIndex)
      selectedVideoIndex.value = videoIndex
      
      console.log('PLY文件下载成功:', fileName)
      return; // 下载成功，退出函数
      
    } catch (error) {
      console.error(`第${attempt}次下载PLY文件失败:`, error)
      
      // 如果是最后一次尝试，更新状态为错误
      if (attempt === maxAttempts) {
        console.error('PLY文件下载失败，已达到最大尝试次数')
        updateReconstructStatus(videoIndex, 'error', progress)
        throw error; // 抛出错误给调用者处理
      }
      
      // 等待一段时间后重试，固定间隔为5秒
      const retryDelay = 5000; // 5秒重试一次
      console.log(`下载失败，${retryDelay}毫秒后进行第${attempt + 1}次尝试`)
      await new Promise(resolve => setTimeout(resolve, retryDelay))
      
      // 增加进度值表示重试
      progress = Math.min(90 + attempt * 2, 98); // 92%, 94%, 96%, 98%
    }
  }
}





// 组件激活时恢复轮询（页面切换回来时）
onActivated(() => {
  console.log('VideoPage组件被激活，检查并恢复轮询任务...')
  
  // 从本地存储加载最新的重建状态
  const savedStatuses = localStorage.getItem('reconstructStatuses')
  if (savedStatuses) {
    const statusesObj = JSON.parse(savedStatuses)
    
    // 检查每个视频的重建状态
    Object.keys(statusesObj).forEach((videoIndexStr) => {
      const videoIndex = parseInt(videoIndexStr)
      const status = statusesObj[videoIndex]
      
      // 如果有正在处理的任务，恢复轮询
      if (status && status.status === 'processing' && status.taskId) {
        console.log(`恢复轮询任务，视频索引: ${videoIndex}，任务ID: ${status.taskId}，当前进度: ${status.progress}%`)
        
        // 恢复轮询，确保不会重复启动
        if (!pollingTimers.value[videoIndex]) {
          console.log(`启动轮询，视频索引: ${videoIndex}，任务ID: ${status.taskId}`)
          checkProgress(
            status.taskId,
            videoIndex,
            (newProgress, taskId) => {
              updateReconstructStatus(videoIndex, 'processing', newProgress, taskId)
            },
            async (plyUrl) => {
              updateReconstructStatus(videoIndex, 'completed', 100, status.taskId)
              
              // 下载PLY文件到本地
              try {
                await downloadPlyFile(plyUrl, videoIndex)
              } catch (downloadError) {
                console.error('下载PLY文件失败:', downloadError)
                // 下载失败时不重置状态，保持completed状态，让用户可以重新尝试下载
                alert('3D重建完成，但下载PLY文件失败，请重新尝试下载')
                // 只更新状态为error，但保留taskId
                updateReconstructStatus(videoIndex, 'error', 100, status.taskId)
              }
              // 轮询完成后清除定时器标记
              delete pollingTimers.value[videoIndex]
            }
          )
          // 标记该视频已经启动了轮询
          pollingTimers.value[videoIndex] = true
        } else {
          console.log(`视频索引: ${videoIndex} 已经有轮询在运行，跳过重复启动`)
        }
      }
    })
  }
})

// 组件挂载时初始化所有视频重建状态
onMounted(async () => {
  await loadVideos()
  
  // 加载之前保存的选择状态
  const currentSelectedIndex = localStorage.getItem('selectedVideoIndex')
  if (currentSelectedIndex === 'default') {
    selectedVideoIndex.value = 'default'
    // 确保currentPlyUrl也设置为默认值
    localStorage.setItem('currentPlyUrl', '/supersplat-viewer/scene.compressed.ply')
  } else if (currentSelectedIndex !== null) {
    // 确保索引有效且在视频数组范围内
    const index = parseInt(currentSelectedIndex)
    if (!isNaN(index) && index >= 0 && index < videos.value.length) {
      selectedVideoIndex.value = index
      // 更新currentPlyUrl为选中视频的PLY文件URL
      let plyUrl = localStorage.getItem(`plyUrl_${index}`)
      // 确保PLY文件URL是完整的绝对URL，只处理根相对路径
      // 本地文件路径（不以/开头）不做处理，保持原样
      localStorage.setItem('currentPlyUrl', plyUrl || '')
    } else {
      // 索引无效时重置
      selectedVideoIndex.value = null
      localStorage.removeItem('selectedVideoIndex')
      localStorage.removeItem('currentPlyUrl')
    }
  } else {
    selectedVideoIndex.value = null
  }
})

// 删除视频
const deleteVideo = async (index) => {
  if (confirm('确定要删除这个视频吗？')) {
    // 1. 检查是否正在重建该视频，如果是，则发送终止请求
    const status = reconstructStatuses.value[index];
    if (status && status.status === 'processing' && status.taskId) {
      try {
        await fetch(`${apiBaseUrl}/api/task/${status.taskId}/terminate`, {
          method: 'POST'
        });
        console.log('已发送重建终止请求，任务ID:', status.taskId);
      } catch (terminateError) {
        console.error('终止重建请求失败:', terminateError);
        // 即使终止请求失败，也继续删除视频
      }
    }
    
    // 2. 检查被删除的视频是否是当前选中的视频
    const isCurrentSelected = selectedVideoIndex.value === index;
    
    // 3. 获取要删除的视频URL
    const videoToDelete = videos.value[index];
    
    // 4. 删除实际的视频文件（如果是本地文件）
    if (videoToDelete && typeof videoToDelete === 'string') {
      // 检查是否是本地文件路径（不是data URL或远程URL）
      if (!videoToDelete.startsWith('data:') && !videoToDelete.startsWith('http://') && !videoToDelete.startsWith('https://')) {
        try {
          // 提取文件名（根据不同平台的路径格式处理）
          let fileName;
          if (videoToDelete.includes('/')) {
            fileName = videoToDelete.split('/').pop();
          } else if (videoToDelete.includes('\\')) {
            fileName = videoToDelete.split('\\').pop();
          } else {
            fileName = videoToDelete;
          }
          
          // 使用Filesystem删除文件
          await Filesystem.deleteFile({
            path: fileName,
            directory: Directory.Data
          });
          console.log('已删除本地视频文件:', fileName);
        } catch (videoDeleteError) {
          console.error('删除本地视频文件失败:', videoDeleteError);
          // 即使文件删除失败，也继续删除其他数据
        }
      }
      // 对于Base64格式或远程URL，不需要删除实际文件
    }
    
    // 5. 获取被删除视频的PLY文件路径并删除本地文件
    const plyUrl = localStorage.getItem(`plyUrl_${index}`);
    if (plyUrl) {
      // 只删除本地文件系统中的PLY文件，不删除远程URL
      if (!plyUrl.startsWith('http://') && !plyUrl.startsWith('https://')) {
        try {
          // 从文件名中提取路径
          const fileName = plyUrl.split('/').pop();
          // 使用Filesystem删除文件
          await Filesystem.deleteFile({
            path: fileName,
            directory: Directory.Data
          });
          console.log('已删除本地PLY文件:', fileName);
        } catch (deleteError) {
          console.error('删除本地PLY文件失败:', deleteError);
          // 即使文件删除失败，也继续删除其他数据
        }
      }
      // 删除PLY文件URL引用
      localStorage.removeItem(`plyUrl_${index}`);
    }
    
    // 6. 获取当前的重建状态
    const savedStatuses = localStorage.getItem('reconstructStatuses');
    let statusesObj = {};
    if (savedStatuses) {
      statusesObj = JSON.parse(savedStatuses);
    }
    
    // 7. 删除被删除视频的重建状态
    delete statusesObj[index];
    
    // 8. 更新后续视频的索引和对应的PLY文件URL
    const totalVideos = videos.value.length;
    for (let i = index + 1; i < totalVideos; i++) {
      // 更新PLY文件URL的键
      const currentPlyUrl = localStorage.getItem(`plyUrl_${i}`);
      if (currentPlyUrl) {
        localStorage.setItem(`plyUrl_${i - 1}`, currentPlyUrl);
        localStorage.removeItem(`plyUrl_${i}`);
      }
      
      // 更新重建状态的键
      if (statusesObj[i]) {
        statusesObj[i - 1] = statusesObj[i];
        delete statusesObj[i];
      }
    }
    
    // 9. 保存更新后的重建状态
    localStorage.setItem('reconstructStatuses', JSON.stringify(statusesObj));
    
    // 10. 删除视频
    videos.value.splice(index, 1);
    
    // 11. 更新本地存储中的视频列表
    localStorage.setItem('photoReconstructionVideos', JSON.stringify(videos.value));
    
    // 12. 如果被删除的视频是当前选中的视频，需要更新selectedVideoIndex和currentPlyUrl
    if (isCurrentSelected) {
      // 如果还有其他视频，选择第一个视频
      if (videos.value.length > 0) {
        // 选择第一个视频
        selectedVideoIndex.value = 0;
        localStorage.setItem('selectedVideoIndex', 0);
        
        // 更新currentPlyUrl为第一个视频对应的PLY文件URL
        const newPlyUrl = localStorage.getItem(`plyUrl_0`);
        localStorage.setItem('currentPlyUrl', newPlyUrl || '');
      } else {
        // 如果没有其他视频，重置selectedVideoIndex和currentPlyUrl
        selectedVideoIndex.value = null;
        localStorage.removeItem('selectedVideoIndex');
        localStorage.removeItem('currentPlyUrl');
      }
    } else if (selectedVideoIndex.value !== null && selectedVideoIndex.value !== 'default' && selectedVideoIndex.value > index) {
      // 如果当前选中的视频索引大于被删除的视频索引，需要更新selectedVideoIndex和currentPlyUrl
      const newSelectedIndex = selectedVideoIndex.value - 1;
      selectedVideoIndex.value = newSelectedIndex;
      localStorage.setItem('selectedVideoIndex', newSelectedIndex);
      
      // 更新currentPlyUrl为新选中视频对应的PLY文件URL
      const newPlyUrl = localStorage.getItem(`plyUrl_${newSelectedIndex}`);
      localStorage.setItem('currentPlyUrl', newPlyUrl || '');
    }
    
    // 13. 重新生成缩略图和更新重建状态
    await loadVideos();
  }
}

// 返回主页
const goToHome = () => {
  router.push('/')
}

// 移除重复的空onUnmounted钩子
</script>

<style scoped>
@import './VideoPage.css';

/* 视频页面容器样式 - 实现滚动功能 */
.video-page-container {
  height: 100%;
  overflow-y: auto;
  padding: 20px 0;
  scroll-behavior: smooth;
  min-height: 0;
  /* 启用GPU加速，优化滚动性能 */
  will-change: scroll-position;
  transform: translateZ(0);
  /* 减少滚动时的重绘 */
  contain: layout paint;
}

/* 自定义滚动条样式 */
.video-page-container::-webkit-scrollbar {
  width: 8px;
}

.video-page-container::-webkit-scrollbar-track {
  background: var(--color-border);
  border-radius: 4px;
}

.video-page-container::-webkit-scrollbar-thumb {
  background: var(--color-tertiary);
  border-radius: 4px;
}

.video-page-container::-webkit-scrollbar-thumb:hover {
  background: var(--color-primary);
}

/* 添加一些Vue组件特有的样式，覆盖CSS文件中的样式 */

/* 加载默认PLY文件按钮样式 - 右上角黑白风格 */
.load-default-ply-section {
  position: fixed;
  top: calc(20px + env(safe-area-inset-top));
  right: calc(20px + env(safe-area-inset-right));
  z-index: 1000;
}

.load-default-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background-color: #ffffff;
  color: #333333;
  border: 2px solid #333333;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  white-space: nowrap;
}

.load-default-btn:hover {
  background-color: #333333;
  color: #ffffff;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.load-default-btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.load-default-btn i {
  font-size: 16px;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .load-default-ply-section {
    top: calc(15px + env(safe-area-inset-top));
    right: calc(15px + env(safe-area-inset-right));
  }
  
  .load-default-btn {
    padding: 8px 14px;
    font-size: 12px;
    gap: 6px;
  }
  
  .load-default-btn i {
    font-size: 14px;
  }
}
</style>