<template>
    <!-- 加载默认PLY文件选项（顶部居中，适合手机操作） -->
    <div class="load-default-ply-section">
      <button class="load-default-btn" @click="loadDefaultPly">
        <i class="fas fa-download"></i>
        加载默认PLY模型
      </button>
    </div>
    
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
import { Filesystem, Directory } from '@capacitor/filesystem'
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import * as THREE from 'three'

const router = useRouter()
const route = useRoute()
const videos = ref([])
const videoThumbnails = ref({})
const showVideoPlayer = ref(false)
const currentVideo = ref('')

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
          
          // 为每个视频生成缩略图
          videos.value.forEach((video, index) => {
            generateThumbnail(typeof video === 'object' ? video.blobUrl : video, index)
          })
          
          // 从本地存储加载重建状态
          const savedStatuses = localStorage.getItem('reconstructStatuses')
          let statusesObj = {}
          if (savedStatuses) {
            statusesObj = JSON.parse(savedStatuses)
          }
          
          // 为每个视频加载或初始化重建状态
          videos.value.forEach((_, index) => {
            // 检查是否存在PLY文件URL，如果存在则标记为已完成
            const plyUrl = localStorage.getItem(`plyUrl_${index}`)
            if (plyUrl) {
              updateReconstructStatus(index, 'completed', 100)
            } else {
              // 使用本地存储的状态或默认为未开始
              const savedStatus = statusesObj[index]
              if (savedStatus) {
                updateReconstructStatus(index, savedStatus.status, savedStatus.progress, savedStatus.taskId)
                
                // 检查是否有正在处理的任务，如果有，恢复轮询
                if (savedStatus.status === 'processing' && savedStatus.taskId) {
                  console.log(`发现正在处理的任务，视频索引: ${index}，任务ID: ${savedStatus.taskId}，当前进度: ${savedStatus.progress}%`)
                  
                  // 恢复轮询
                  checkProgress(
                    savedStatus.taskId,
                    index,
                    (newProgress, taskId) => {
                      updateReconstructStatus(index, 'processing', newProgress, taskId)
                    },
                    async (plyUrl) => {
                      updateReconstructStatus(index, 'completed', 100, savedStatus.taskId)
                      
                      // 下载PLY文件到本地
                      try {
                        const response = await fetch(plyUrl)
                        const blob = await response.blob()
                        const arrayBuffer = await blob.arrayBuffer()
                        
                        // 高效的ArrayBuffer转换为base64字符串的方法，避免大型文件导致的栈溢出
                        const uint8Array = new Uint8Array(arrayBuffer)
                        let binaryString = ''
                        for (let i = 0; i < uint8Array.length; i++) {
                          binaryString += String.fromCharCode(uint8Array[i])
                        }
                        const base64Data = btoa(binaryString)
                        
                        // 保存到本地文件系统
                        const fileName = `ply_${index}_${Date.now()}.ply`
                        await Filesystem.writeFile({
                          path: fileName,
                          data: base64Data,
                          directory: Directory.Data,
                          recursive: true
                        })
                        
                        // 保存本地文件路径到localStorage
                        localStorage.setItem(`plyUrl_${index}`, fileName)
                        localStorage.setItem('currentPlyUrl', fileName)
                        
                        // 同时更新选中的视频索引
                        localStorage.setItem('selectedVideoIndex', index)
                        selectedVideoIndex.value = index
                        
                        console.log('PLY文件已下载并保存到本地:', fileName)
                      } catch (downloadError) {
                        console.error('下载PLY文件失败:', downloadError)
                        // 只使用本地文件，下载失败时不保存远程URL
                        alert('3D重建完成，但下载PLY文件失败，请重新尝试重建')
                        // 重置重建状态
                        resetReconstructStatus(index)
                      }
                    }
                  )
                }
              } else {
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

// 在组件卸载时释放所有Blob URL资源
onUnmounted(() => {
  videos.value.forEach(videoItem => {
    // 提取实际的视频URL，处理对象和字符串两种情况
    const actualUrl = typeof videoItem === 'object' ? videoItem.blobUrl : videoItem;
    if (actualUrl && typeof actualUrl === 'string' && actualUrl.startsWith('blob:')) {
      URL.revokeObjectURL(actualUrl)
      console.log('已释放Blob URL资源:', actualUrl)
    }
  })
})

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

// 使用环境变量定义后端API地址
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

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
      const response = await fetch(actualVideoUrl)
      videoBlob = await response.blob()
      console.log('本地文件读取成功，Blob大小:', videoBlob.size)
      
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
    const response = await fetch(`${apiBaseUrl}/api/reconstruct`, {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      throw new Error('视频上传失败')
    }
    
    const result = await response.json()
    const taskId = result.task_id
    
    // 更新重建状态，保存taskId
    onProgressUpdate(0, taskId)
    
    // 4. 开始轮询重建进度
    checkProgress(taskId, videoIndex, onProgressUpdate, onComplete)
  } catch (error) {
    console.error('3D重建过程中发生错误:', error)
    throw error
  }
}

// 独立的轮询进度检查函数，支持页面重启后恢复轮询
const checkProgress = async (taskId, videoIndex, onProgressUpdate, onComplete) => {
  try {
    const statusResponse = await fetch(`${apiBaseUrl}/api/task/${taskId}`)
    const statusData = await statusResponse.json()
    
    let taskStatus = statusData.status
    const progress = statusData.progress || 0
    
    // 调用进度更新回调，同时保存taskId
    onProgressUpdate(progress, taskId)
    
    // 如果任务未完成，继续轮询
    if (taskStatus !== 'completed' && taskStatus !== 'failed') {
      setTimeout(() => checkProgress(taskId, videoIndex, onProgressUpdate, onComplete), 1000)
    } else if (taskStatus === 'completed') {
      // 任务完成，获取PLY文件URL
      let plyUrl = statusData.ply_url
      // 确保PLY文件URL是完整的绝对URL
      if (plyUrl && !plyUrl.startsWith('http://') && !plyUrl.startsWith('https://')) {
        // 如果是相对路径，与apiBaseUrl结合
        if (plyUrl.startsWith('/')) {
          // 如果是根相对路径，直接拼接
          plyUrl = apiBaseUrl + plyUrl
        } else {
          // 如果是相对路径，添加斜杠后拼接
          plyUrl = apiBaseUrl + '/' + plyUrl
        }
      }
      onComplete(plyUrl)
    } else {
      throw new Error('3D重建失败')
    }
  } catch (error) {
    console.error('轮询进度时发生错误:', error)
    // 更新状态为错误
    updateReconstructStatus(videoIndex, 'error', 0, taskId)
  }
}

// 开始重建（列表中直接使用）
const startReconstruction = async (videoIndex) => {
  if (!videos.value[videoIndex]) return
  
  try {
    const videoUrl = videos.value[videoIndex]
    updateReconstructStatus(videoIndex, 'processing', 0)
    
    await perform3DReconstruction(
      videoUrl,
      videoIndex,
      (newProgress, taskId) => {
        updateReconstructStatus(videoIndex, 'processing', newProgress, taskId)
      },
      async (plyUrl) => {
        updateReconstructStatus(videoIndex, 'completed', 100)
        
        // 下载PLY文件到本地
        try {
          const response = await fetch(plyUrl)
          const blob = await response.blob()
          const arrayBuffer = await blob.arrayBuffer()
          
          // 高效的ArrayBuffer转换为base64字符串的方法，避免大型文件导致的栈溢出
          const uint8Array = new Uint8Array(arrayBuffer)
          let binaryString = ''
          for (let i = 0; i < uint8Array.length; i++) {
            binaryString += String.fromCharCode(uint8Array[i])
          }
          const base64Data = btoa(binaryString)
          
          // 保存到本地文件系统
          const fileName = `ply_${videoIndex}_${Date.now()}.ply`
          await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Data,
            recursive: true
          })
          
          // 保存本地文件路径到localStorage
          localStorage.setItem(`plyUrl_${videoIndex}`, fileName)
          localStorage.setItem('currentPlyUrl', fileName)
          
          // 同时更新选中的视频索引
          localStorage.setItem('selectedVideoIndex', videoIndex)
          selectedVideoIndex.value = videoIndex
          
          console.log('PLY文件已下载并保存到本地:', fileName)
        } catch (downloadError) {
          console.error('下载PLY文件失败:', downloadError)
          // 只使用本地文件，下载失败时不保存远程URL
          alert('3D重建完成，但下载PLY文件失败，请重新尝试重建')
          // 重置重建状态
          resetReconstructStatus(videoIndex)
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
  // 更新状态为未开始
  updateReconstructStatus(videoIndex, 'not_started', 0)
  
  // 删除对应的PLY文件URL
  localStorage.removeItem(`plyUrl_${videoIndex}`)
  
  // 如果该视频是当前选中的视频，也删除currentPlyUrl
  if (selectedVideoIndex.value === videoIndex) {
    localStorage.removeItem('currentPlyUrl')
  }
}

// 加载默认PLY文件
const loadDefaultPly = () => {
  // 设置默认PLY文件的URL
  const defaultPlyUrl = '/supersplat-viewer/scene.compressed.ply'
  localStorage.setItem('currentPlyUrl', defaultPlyUrl)
  
  // 设置默认的selectedVideoIndex，确保底栏可用
  localStorage.setItem('selectedVideoIndex', 'default')
  
  // 同时更新本地响应式变量，确保状态同步
  selectedVideoIndex.value = 'default'
  
  // 直接跳转，不再需要复杂的延迟和检查
  // 模型将在Supersplat.vue页面中加载
  router.push('/supersplat')
}

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
      if (plyUrl && plyUrl !== '' && !plyUrl.startsWith('http://') && !plyUrl.startsWith('https://')) {
        if (plyUrl.startsWith('/')) {
          // 如果是根相对路径，直接拼接
          plyUrl = apiBaseUrl + plyUrl
          // 更新localStorage中的URL
          localStorage.setItem(`plyUrl_${index}`, plyUrl)
        }
        // 本地文件路径（不以/开头）不做处理，保持原样
      }
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

onUnmounted(() => {
  // 组件卸载时的清理工作
})
</script>

<style scoped>
@import './VideoPage.css';

/* 视频页面容器样式 - 实现滚动功能 */
.video-page-container {
  max-height: calc(100vh - 120px);
  overflow-y: auto;
  padding: 20px 0;
  scroll-behavior: smooth;
  min-height: 0;
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