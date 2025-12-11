<template>
    <!-- 加载默认PLY文件选项（顶部居中，适合手机操作） -->
    <div class="load-default-ply-section">
      <button class="load-default-btn" @click="loadDefaultPly">
        <i class="fas fa-download"></i>
        加载默认PLY模型
      </button>
    </div>
    
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
      
      // 等待DOM更新后执行后续操作
      setTimeout(() => {
        // 为每个视频生成缩略图
        videos.value.forEach((video, index) => {
          generateThumbnail(video, index)
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
              updateReconstructStatus(index, savedStatus.status, savedStatus.progress)
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
      }, 0)
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





// 更新重建状态并保存到本地存储
const updateReconstructStatus = (videoIndex, status, progress = 0) => {
  const newStatus = {
    status, // 'not_started', 'processing', 'completed', 'error'
    progress, // 0-100
    timestamp: new Date().toLocaleString()
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
const perform3DReconstruction = async (videoUrl, onProgressUpdate, onComplete) => {
  try {
    // 1. 从视频URL获取视频文件
    console.log('处理视频URL:', videoUrl)
    let videoBlob;
    
    if (videoUrl.startsWith('data:')) {
      // 处理Data URL（上传的视频）
      console.log('处理Data URL:', videoUrl)
      const base64Data = videoUrl.split(',')[1]
      const byteCharacters = atob(base64Data)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      videoBlob = new Blob([byteArray], { type: 'video/mp4' })
      console.log('Data URL读取成功，Blob大小:', videoBlob.size)
    } else if (videoUrl.startsWith('blob:')) {
      // 处理Blob URL
      console.log('处理Blob URL:', videoUrl)
      const response = await fetch(videoUrl)
      videoBlob = await response.blob()
      console.log('Blob URL读取成功，Blob大小:', videoBlob.size)
    } else {
      // 处理本地文件路径（录制的视频）
      console.log('处理本地文件路径:', videoUrl)
      const response = await fetch(videoUrl)
      videoBlob = await response.blob()
      console.log('本地文件读取成功，Blob大小:', videoBlob.size)
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
    
    // 4. 轮询重建进度
    const checkProgress = async () => {
      const statusResponse = await fetch(`${apiBaseUrl}/api/task/${taskId}`)
      const statusData = await statusResponse.json()
      
      let taskStatus = statusData.status
      const progress = statusData.progress || 0
      
      // 调用进度更新回调
      onProgressUpdate(progress)
      
      // 如果任务未完成，继续轮询
      if (taskStatus !== 'completed' && taskStatus !== 'failed') {
        setTimeout(checkProgress, 1000)
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
    }
    
    // 开始轮询
    checkProgress()
    
  } catch (error) {
    console.error('3D重建过程中发生错误:', error)
    throw error
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
      (newProgress) => {
        updateReconstructStatus(videoIndex, 'processing', newProgress)
      },
      async (plyUrl) => {
        updateReconstructStatus(videoIndex, 'completed', 100)
        
        // 下载PLY文件到本地
        try {
          const response = await fetch(plyUrl)
          const blob = await response.blob()
          const arrayBuffer = await blob.arrayBuffer()
          const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
          
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
onMounted(() => {
  loadVideos()
  
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
const deleteVideo = (index) => {
  if (confirm('确定要删除这个视频吗？')) {
    // 1. 检查被删除的视频是否是当前选中的视频
    const isCurrentSelected = selectedVideoIndex.value === index;
    
    // 2. 删除被删除视频的PLY文件URL
    localStorage.removeItem(`plyUrl_${index}`)
    
    // 3. 获取当前的重建状态
    const savedStatuses = localStorage.getItem('reconstructStatuses')
    let statusesObj = {};
    if (savedStatuses) {
      statusesObj = JSON.parse(savedStatuses);
    }
    
    // 4. 删除被删除视频的重建状态
    delete statusesObj[index];
    
    // 5. 更新后续视频的索引和对应的PLY文件URL
    const totalVideos = videos.value.length;
    for (let i = index + 1; i < totalVideos; i++) {
      // 更新PLY文件URL的键
      const plyUrl = localStorage.getItem(`plyUrl_${i}`);
      if (plyUrl) {
        localStorage.setItem(`plyUrl_${i - 1}`, plyUrl);
        localStorage.removeItem(`plyUrl_${i}`);
      }
      
      // 更新重建状态的键
      if (statusesObj[i]) {
        statusesObj[i - 1] = statusesObj[i];
        delete statusesObj[i];
      }
    }
    
    // 6. 保存更新后的重建状态
    localStorage.setItem('reconstructStatuses', JSON.stringify(statusesObj));
    
    // 7. 删除视频
    videos.value.splice(index, 1);
    
    // 8. 更新本地存储中的视频列表
    localStorage.setItem('photoReconstructionVideos', JSON.stringify(videos.value));
    
    // 9. 如果被删除的视频是当前选中的视频，需要更新selectedVideoIndex和currentPlyUrl
    if (isCurrentSelected) {
      // 如果还有其他视频，选择第一个视频
      if (videos.value.length > 0) {
        // 选择第一个视频
        selectedVideoIndex.value = 0;
        localStorage.setItem('selectedVideoIndex', 0);
        
        // 更新currentPlyUrl为第一个视频对应的PLY文件URL
        const plyUrl = localStorage.getItem(`plyUrl_0`);
        localStorage.setItem('currentPlyUrl', plyUrl || '');
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
      const plyUrl = localStorage.getItem(`plyUrl_${newSelectedIndex}`);
      localStorage.setItem('currentPlyUrl', plyUrl || '');
    }
    
    // 10. 重新生成缩略图和更新重建状态
    loadVideos();
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