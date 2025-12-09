<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { Application, Entity } from 'playcanvas'
import { main as initViewer } from '../modules/supersplat-viewer/src/index'
import '../modules/supersplat-viewer/public/index.css'

// 场景相关变量
const isLoading = ref(true)
const error = ref(null)
const detailedError = ref('')
const containerRef = ref(null)
const canvasRef = ref(null) // 引用Vue管理的canvas元素
const splatUrl = ref(null)

// 从localStorage获取当前PLY文件URL
const loadCurrentPlyUrl = () => {
  const plyUrl = localStorage.getItem('currentPlyUrl')
  if (plyUrl && plyUrl !== '') {
    splatUrl.value = plyUrl
  } else {
    // 如果没有选中的视频或PLY文件，不设置默认路径
    // 此时isLoading会保持为true，直到有有效的PLY文件被选择
    splatUrl.value = null
  }
}

// 初始化时加载PLY URL
loadCurrentPlyUrl()
const isModelLoaded = ref(false)
let appInstance = null
let viewer = null
let camera = null
let handleResize = null // 保存resize事件处理函数，以便在组件卸载时移除



// 加载模型
const loadModel = (url) => {
  try {
    if (!viewer) {
      throw new Error('查看器未初始化')
    }
    
    // 重新初始化查看器并加载新模型
    if (appInstance && typeof appInstance.destroy === 'function') {
      appInstance.destroy()
    }
    initPlayCanvasApp(url)
    isModelLoaded.value = true
  } catch (err) {
    console.error('加载模型失败:', err)
    error.value = '加载模型失败: ' + err.message
    isModelLoaded.value = false
  }
}



// 初始化PlayCanvas应用
const initPlayCanvasApp = async (modelUrl = splatUrl.value) => {
  try {
    if (!containerRef.value) {
      throw new Error('未找到容器元素')
    }

    // 确保appInstance变量被正确初始化
    appInstance = null

    // 检查canvas元素是否存在
    if (!canvasRef.value) {
      throw new Error('未找到canvas元素')
    }

    // 创建PlayCanvas应用实例，使用Vue管理的canvas元素
    appInstance = new Application(canvasRef.value)
    // 手动配置我们需要的选项（确保这些是对象且包含所需方法）
    // 获取或创建输入对象
    appInstance.elementInput = appInstance.elementInput || {}
    appInstance.mouse = appInstance.mouse || {}
    appInstance.touch = appInstance.touch || {}
    appInstance.keyboard = appInstance.keyboard || {}
    
    // 确保所有输入对象都有update方法
    const inputObjects = ['elementInput', 'mouse', 'touch', 'keyboard']
    const requiredMethods = ['update', 'off', 'detach']
    
    for (const objName of inputObjects) {
      const obj = appInstance[objName]
      
      for (const method of requiredMethods) {
        if (typeof obj[method] !== 'function') {
          obj[method] = () => {}
        }
      }
    }
    
    // 添加调试信息
    console.log('PlayCanvas应用实例创建完成:', appInstance)
    console.log('Canvas元素:', canvasRef.value)
    console.log('容器元素:', containerRef.value)
    console.log('是否有start方法:', typeof appInstance.start === 'function')
    console.log('是否有update方法:', typeof appInstance.update === 'function')
    console.log('是否有render方法:', typeof appInstance.render === 'function')
    
    // 尝试启动PlayCanvas应用（根据PlayCanvas文档，这是启动渲染循环的方法）
    if (typeof appInstance.start === 'function') {
      try {
        appInstance.start()
        console.log('PlayCanvas应用已启动')
      } catch (err) {
        console.warn('启动PlayCanvas应用时出错:', err)
      }
    }

    // 创建相机实体
    camera = new Entity('camera')
    appInstance.root.addChild(camera)
    console.log('相机实体创建完成:', camera)
    console.log('相机位置:', camera.getLocalPosition())
    console.log('相机旋转:', camera.getLocalRotation())
    console.log('相机缩放:', camera.getLocalScale())

    // 加载设置
    const settingsResponse = await fetch('/supersplat-viewer/settings.json')
    const settingsJson = await settingsResponse.json()

    // 配置参数，设置noui: true禁用UI（避免DOM元素不存在错误）
    const config = {
      contentUrl: modelUrl,
      contents: null,
      unified: false,
      aa: false,
      poster: false,
      noui: true,
      noanim: false,
      ministats: false
    }

    // 调试：在调用initViewer之前检查appInstance变量
    console.log('调用initViewer之前的appInstance:', appInstance, typeof appInstance);
    
    // 创建appInstance的副本，以防止initViewer函数修改appInstance变量
    const appCopy = appInstance;
    
    // 初始化supersplat查看器
    viewer = initViewer(appCopy, camera, settingsJson, config);
    
    // 调试：在调用initViewer之后检查appInstance变量
    console.log('调用initViewer之后的appInstance:', appInstance, typeof appInstance);
    console.log('调用initViewer之后的appCopy:', appCopy, typeof appCopy);
    console.log('initViewer返回值:', viewer, typeof viewer);
    console.log('相机组件:', camera.camera ? '已添加' : '未添加');
    
    // 尝试手动启动渲染循环（如果app.start()方法不可用）
    if (typeof appInstance.update === 'function' && typeof appInstance.render === 'function') {
      console.log('尝试手动启动渲染循环');
      let lastTime = performance.now();
      
      const renderLoop = (time) => {
        const deltaTime = (time - lastTime) / 1000;
        lastTime = time;
        
        try {
          appInstance.update(deltaTime);
          appInstance.render();
        } catch (err) {
          console.warn('渲染循环出错:', err);
        }
        
        requestAnimationFrame(renderLoop);
      };
      
      requestAnimationFrame(renderLoop);
      console.log('手动渲染循环已启动');
    }

    // 设置加载完成状态
    isLoading.value = false
    isModelLoaded.value = true
    
    // 添加调试信息
    console.log('模型加载完成，应用初始化状态:', {
      isLoading: isLoading.value,
      isModelLoaded: isModelLoaded.value,
      error: error.value,
      appInstance: appInstance ? '存在' : '不存在',
      viewer: viewer ? '存在' : '不存在',
      camera: camera ? '存在' : '不存在'
    })

    // 定义窗口大小变化处理函数
    handleResize = () => {
      if (appInstance && containerRef.value) {
        // 获取容器的实际尺寸
        const rect = containerRef.value.getBoundingClientRect()
        const width = rect.width
        const height = rect.height
        
        // 获取设备像素比，确保在高分辨率屏幕上显示清晰
        const dpr = window.devicePixelRatio || 1
        
        // 调整canvas的CSS尺寸（显示尺寸）
        if (canvasRef.value) {
          // 设置CSS尺寸为容器的实际尺寸
          canvasRef.value.style.width = `${width}px`
          canvasRef.value.style.height = `${height}px`
          
          // 设置canvas的实际像素尺寸（考虑设备像素比）
          canvasRef.value.width = Math.floor(width * dpr)
          canvasRef.value.height = Math.floor(height * dpr)
          console.log('Canvas CSS尺寸:', width, 'x', height)
          console.log('Canvas像素尺寸:', canvasRef.value.width, 'x', canvasRef.value.height)
          console.log('设备像素比:', dpr)
        }
        
        // 调整PlayCanvas应用的画布大小
        appInstance.resizeCanvas(width, height)
        console.log('PlayCanvas画布尺寸调整为:', width, 'x', height)
      }
    }

    // 添加事件监听器
    window.addEventListener('resize', handleResize)
    handleResize()

    // 清理函数
    return () => {
      window.removeEventListener('resize', handleResize)
    }

  } catch (err) {
    console.error('初始化PlayCanvas应用失败:', err)
    error.value = '初始化3D查看器失败: ' + err.message
    detailedError.value = err.stack || JSON.stringify(err, null, 2)
    isLoading.value = false
  }
}

// 组件挂载时初始化
onMounted(async () => {
  // 等待DOM更新完成
  await nextTick()
  
  // 只有当有有效的PLY文件URL时，才初始化PlayCanvas应用
  if (splatUrl.value) {
    await initPlayCanvasApp()
  } else {
    // 如果没有有效的PLY文件URL，保持加载状态或显示错误信息
    error.value = '请先在视频页面选择一个已重建完成的视频或加载默认PLY模型'
    isLoading.value = false
  }
})

// 组件卸载时清理
onUnmounted(() => {
  // 移除窗口大小变化事件监听器
  if (handleResize) {
    window.removeEventListener('resize', handleResize)
    handleResize = null
  }
  
  // 销毁PlayCanvas应用实例
  if (appInstance) {
    try {
      // 强制为mouse、keyboard、touch和elementInput对象添加所需方法，确保它们存在（更全面的修复）
      const inputObjects = ['mouse', 'keyboard', 'touch', 'elementInput']
      const requiredMethods = ['update', 'off', 'detach']
      
      for (const objName of inputObjects) {
        // 如果对象不存在，创建一个空对象
        if (!appInstance[objName]) {
          appInstance[objName] = {}
        }
        
        // 如果不是对象，将其转换为对象
        if (typeof appInstance[objName] !== 'object' || appInstance[objName] === null) {
          appInstance[objName] = { original: appInstance[objName] }
        }
        
        // 确保对象有所有所需的方法
        for (const method of requiredMethods) {
          if (typeof appInstance[objName][method] !== 'function') {
            appInstance[objName][method] = () => {}
          }
        }
      }
      
      // 调用destroy方法
      if (typeof appInstance.destroy === 'function') {
        appInstance.destroy()
      }
    } catch (err) {
      console.error('销毁PlayCanvas应用实例时出错:', err)
    } finally {
      appInstance = null
    }
  }
  
  // 清理引用
  viewer = null
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
  background-color: #fff;
  color: #000;
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
  background: #fff;
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
  background-color: #fff;
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