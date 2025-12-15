<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { SplatMesh } from '@sparkjsdev/spark'
import { Filesystem, Directory } from '@capacitor/filesystem'

// 场景相关变量
const isLoading = ref(true)
const error = ref(null)
const detailedError = ref('')
const containerRef = ref(null)
const canvasRef = ref(null) // 引用Vue管理的canvas元素
const splatUrl = ref(null)

// Three.js相关变量
let scene = null
let camera = null
let renderer = null
let controls = null
let splatMesh = null
let handleResize = null
let localUrl = null // 用于存储本地创建的Blob URL，以便后续释放

// 从localStorage获取当前PLY文件URL
const loadCurrentPlyUrl = () => {
  const plyUrl = localStorage.getItem('currentPlyUrl')
  const selectedVideoIndex = localStorage.getItem('selectedVideoIndex')
  console.log('loadCurrentPlyUrl - 从localStorage获取值:')
  console.log('  selectedVideoIndex:', selectedVideoIndex)
  console.log('  currentPlyUrl:', plyUrl)
  
  if (plyUrl && plyUrl !== '') {
    splatUrl.value = plyUrl
    console.log('  设置splatUrl.value为:', splatUrl.value)
  } else {
    // 如果没有选中的视频或PLY文件，使用空值
    splatUrl.value = null
    console.log('  没有找到有效的PLY文件URL')
  }
}

// 释放资源
const releaseResources = () => {
  // 释放本地创建的Blob URL
  if (localUrl && localUrl.startsWith('blob:')) {
    URL.revokeObjectURL(localUrl)
    console.log('释放本地URL对象:', localUrl)
    localUrl = null
  }
  
  // 移除并释放SplatMesh
  if (splatMesh) {
    try {
      if (scene) {
        scene.remove(splatMesh)
      }
      splatMesh.dispose()
      splatMesh = null
      console.log('已释放SplatMesh资源')
    } catch (err) {
      console.error('释放SplatMesh时出错:', err)
    }
  }
}

// 初始化时加载PLY URL
loadCurrentPlyUrl()
const isModelLoaded = ref(false)

// 加载模型
const loadModel = async (url) => {
  try {
    // 释放之前的资源
    releaseResources()
    
    // 设置加载状态
    isLoading.value = true
    error.value = null
    
    // 处理模型URL，如果是本地文件路径则从本地读取
    let modelUrl = url
    
    console.log('处理模型URL - 开始:')
    console.log('  原始modelUrl:', modelUrl)
    console.log('  modelUrl类型:', typeof modelUrl)
    console.log('  modelUrl是File对象:', modelUrl instanceof File)
    
    if (modelUrl instanceof File) {
      // 如果是File对象，创建Blob URL
      console.log('使用File对象:', modelUrl.name)
      localUrl = URL.createObjectURL(modelUrl)
      modelUrl = localUrl
      console.log('成功创建File对象的Blob URL:', modelUrl)
    } else if (modelUrl && typeof modelUrl === 'string' && !modelUrl.startsWith('http://') && !modelUrl.startsWith('https://') && !modelUrl.startsWith('/')) {
      // 本地文件路径字符串，从本地文件系统读取
      try {
        console.log('尝试从本地文件系统读取PLY文件:', modelUrl)
        const file = await Filesystem.readFile({
          path: modelUrl,
          directory: Directory.Data
        })
        
        // 将base64数据转换为Blob
        const binaryString = atob(file.data)
        const binaryArray = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          binaryArray[i] = binaryString.charCodeAt(i)
        }
        const blob = new Blob([binaryArray], { type: 'application/octet-stream' })
        
        // 创建本地URL用于加载
        localUrl = URL.createObjectURL(blob)
        modelUrl = localUrl
        
        console.log('成功从本地加载PLY文件:', modelUrl)
      } catch (localReadError) {
        console.error('从本地文件系统读取PLY文件失败:', localReadError)
        throw new Error('无法从本地文件系统读取PLY文件: ' + localReadError.message)
      }
    }
    
    console.log('处理模型URL - 结束:')
    console.log('  最终modelUrl:', modelUrl)
    
    // 创建SplatMesh并添加到场景
    splatMesh = new SplatMesh({ url: modelUrl })
    splatMesh.quaternion.set(1, 0, 0, 0)
    scene.add(splatMesh)
    
    // 设置加载完成状态
    isLoading.value = false
    isModelLoaded.value = true
    
    console.log('模型加载完成，应用初始化状态:', {
      isLoading: isLoading.value,
      isModelLoaded: isModelLoaded.value,
      error: error.value,
      splatMesh: splatMesh ? '存在' : '不存在'
    })
    
  } catch (err) {
    console.error('加载模型失败:', err)
    error.value = '加载模型失败: ' + err.message
    detailedError.value = err.stack || JSON.stringify(err, null, 2)
    isLoading.value = false
    isModelLoaded.value = false
  }
}

// 初始化Three.js应用
const initThreeJsApp = async (modelUrl = splatUrl.value) => {
  try {
    if (!containerRef.value) {
      throw new Error('未找到容器元素')
    }
    
    if (!canvasRef.value) {
      throw new Error('未找到canvas元素')
    }
    
    // 创建Three.js场景
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)
    
    // 创建相机
    camera = new THREE.PerspectiveCamera(75, 1, 0.01, 1000) // 初始宽高比为1，将在resize时更新
    camera.position.set(0, 0, 1)
    
    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.value,
      antialias: true,
      alpha: false
    })
    
    // 设置渲染器尺寸
    const width = containerRef.value.clientWidth
    const height = containerRef.value.clientHeight
    renderer.setSize(width, height, false)
    
    // 初始化OrbitControls（围绕场景中心旋转）
    controls = new OrbitControls(camera, canvasRef.value)
    controls.target.set(0, 0, 0) // 设置旋转中心为场景原点
    controls.enableDamping = true // 启用阻尼效果
    controls.dampingFactor = 0.05 // 阻尼系数
    controls.minDistance = 0.1 // 最小距离
    controls.maxDistance = 10 // 最大距离
    
    // 定义窗口大小变化处理函数
    handleResize = () => {
      const width = containerRef.value.clientWidth
      const height = containerRef.value.clientHeight

      // Only resize if necessary
      const canvas = renderer.domElement
      const needResize = canvas.width !== width || canvas.height !== height

      if (needResize) {
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        
        console.log('Three.js画布尺寸调整为:', width, 'x', height)
      }
    }
    
    // 添加事件监听器
    window.addEventListener('resize', () => {
      setTimeout(() => { handleResize(); }, 100);
    })
    handleResize()
    
    // 设置动画循环
    renderer.setAnimationLoop(function animate(time) {
      handleResize()
      controls.update() // OrbitControls的update方法不需要camera参数
      renderer.render(scene, camera)
    })
    
    // 加载模型
    await loadModel(modelUrl)
    
  } catch (err) {
    console.error('初始化Three.js应用失败:', err)
    error.value = '初始化3D查看器失败: ' + err.message
    detailedError.value = err.stack || JSON.stringify(err, null, 2)
    isLoading.value = false
  }
}

// 渲染循环已通过renderer.setAnimationLoop实现，无需单独的startRenderLoop函数

// 组件挂载时初始化
onMounted(async () => {
  // 等待DOM更新完成
  await nextTick()
  
  // 重新加载当前PLY文件URL，确保获取到最新的值
  loadCurrentPlyUrl()
  
  // 只有当有有效的PLY文件URL时，才初始化Three.js应用
  if (splatUrl.value) {
    await initThreeJsApp()
  } else {
    // 如果没有有效的PLY文件URL，保持加载状态或显示错误信息
    error.value = '请先在视频页面选择一个已重建完成的视频或加载默认PLY模型'
    isLoading.value = false
  }
})

// 组件卸载时清理
onUnmounted(() => {
  // 停止渲染循环
  if (renderer) {
    renderer.setAnimationLoop(null)
    console.log('组件卸载时已停止渲染循环')
  }
  
  // 移除窗口大小变化事件监听器
  if (handleResize) {
    window.removeEventListener('resize', handleResize)
    handleResize = null
  }
  
  // 释放资源
  releaseResources()
  
  // 销毁渲染器
  if (renderer) {
    try {
      renderer.dispose()
      renderer = null
      console.log('已释放Three.js渲染器')
    } catch (err) {
      console.error('销毁渲染器时出错:', err)
    }
  }
  
  // 清理控制器
  if (controls) {
    // 只有在dispose方法存在时才调用，避免SparkControls不存在该方法导致的错误
    if (typeof controls.dispose === 'function') {
      controls.dispose()
    }
    controls = null
  }
  
  // 清理引用
  scene = null
  camera = null
})
</script>

<template>
  <div class="supersplat-container">
  
    
    <!-- 3D渲染容器 -->
    <div ref="containerRef" class="render-container">
      <!-- 加载状态 -->
      <div v-if="isLoading" class="loading-container">
        <div class="loading-spinner"></div>
        <p>正在加载3D模型...</p>
      </div>

      <!-- 错误状态 -->
      <div v-if="error" class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <div class="error-content">
          <p>{{ error }}</p>
          <details class="error-details" v-if="detailedError">
            <summary>错误详情</summary>
            <pre>{{ detailedError }}</pre>
          </details>
        </div>
      </div>
      
      <!-- Canvas元素（由Vue管理） -->
      <canvas ref="canvasRef" class="supersplat-canvas" :style="{ display: isLoading || error ? 'none' : 'block' }"></canvas>
    </div>
  </div>
</template>

<style scoped>
/* 让容器占据整个主内容区域 */
.supersplat-container {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background-color: #000;
  color: #fff;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

/* 渲染容器样式 - 占据整个容器空间 */
.render-container {
  position: relative;
  width: 100%;
  height: 100%;
  flex: 1;
  background: #000;
  overflow: hidden;
  box-sizing: border-box;
}

/* Canvas样式 - 扩展到整个渲染容器 */
.supersplat-canvas {
  width: 100%;
  height: 100%;
  display: block;
  margin: 0;
  padding: 0;
  background-color: #000;
  box-sizing: border-box;
}

/* 加载状态样式 */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: 100;
}

.loading-spinner {
  border: 4px solid rgba(255, 255, 255, 0.1);
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border-left-color: #fff;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

.loading-container p {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  text-align: center;
}

/* 错误消息样式 */
.error-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(231, 76, 60, 0.9);
  padding: 30px;
  border-radius: 12px;
  z-index: 100;
  max-width: 80%;
  max-height: 80%;
  overflow: auto;
}

.error-message i {
  font-size: 48px;
  color: #fff;
  margin-bottom: 16px;
}

.error-message p {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  text-align: center;
  line-height: 1.6;
}

.error-content {
  font-size: 14px;
  color: #fff;
}

.error-details {
  margin-top: 15px;
  background-color: rgba(255, 255, 255, 0.9);
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 10px;
  width: 100%;
}

.error-details summary {
  cursor: pointer;
  font-weight: bold;
  color: #333;
  padding: 5px;
  border-radius: 3px;
}

.error-details summary:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.error-details pre {
  margin: 10px 0 0 0;
  padding: 12px;
  background-color: #f8f8f8;
  border: 1px solid #eee;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: #333;
  max-height: 300px;
  overflow-y: auto;
}

/* 动画效果 */
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* iframe样式调整 */
:deep(iframe) {
  width: 100%;
  height: 100%;
  border: none;
}
</style>