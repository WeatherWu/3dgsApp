<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { MediaCapture } from '@ionic-native/media-capture';
import { Capacitor } from '@capacitor/core';

const router = useRouter();

// 状态管理
const videos = ref([]);
const isRecording = ref(false);
const error = ref('');
const fileInputRef = ref(null); // 添加缺失的fileInputRef定义
const recordedVideo = ref(null); // 添加视频元素的ref定义
const showInstructions = ref(false); // 控制使用说明弹窗显示
const dontShowAgain = ref(false); // 用户选择是否下次显示
const showReconstructConfirm = ref(false); // 控制重建确认弹窗显示
const recordedVideoUrl = ref(''); // 录制的视频URL

// 不再需要currentStatus状态变量

// 状态管理简化，不再显示状态指示器

// 检查是否需要显示使用说明
const checkShowInstructions = () => {
  const savedPreference = localStorage.getItem('dontShowInstructions');
  if (!savedPreference) {
    showInstructions.value = true;
  }
};

// 关闭使用说明弹窗
const closeInstructions = () => {
  showInstructions.value = false;
  if (dontShowAgain.value) {
    localStorage.setItem('dontShowInstructions', 'true');
  }
  
  // 弹窗关闭后，如果用户点击了录制按钮，开始录制视频
  if (isRecording.value) {
    startRecording();
  }
};

// 确认进行三维重建
const confirmReconstruct = () => {
  showReconstructConfirm.value = false;
  // 跳转到视频界面，并传递参数来自动触发对应视频的重建
  if (videos.value.length > 0) {
    // 获取当前视频的信息（可以是索引或唯一标识符）
    const videoIndex = 0; // 假设我们总是重建第一个视频
    // 跳转到视频界面并传递重建参数和视频索引
    router.push({
      path: '/videos',
      query: {
        autoReconstruct: 'true',
        videoIndex: videoIndex.toString()
      }
    });
  } else {
    // 如果没有视频，仍然跳转到视频界面
    router.push('/videos');
  }
};

// 取消三维重建
const cancelReconstruct = () => {
  showReconstructConfirm.value = false;
  // 用户可以继续录制新视频
  // 留在当前页面，不进行跳转
  console.log('取消三维重建，继续在当前页面录制');
  
  // 重置录制状态，以便用户可以录制新视频
  if (currentStatus.value !== 'idle') {
    currentStatus.value = 'idle';
  }
};





// Ionic Native MediaCapture实例
const mediaCapture = MediaCapture;

const requestPermissions = async () => {
  try {
    // 检查是否在原生平台上运行
    if (Capacitor.isNativePlatform()) {
      // 在原生平台上，MediaCapture会自动处理权限请求
      console.log('在原生平台上运行，MediaCapture将自动处理权限');
      return true;
    } else {
      // 在浏览器中，使用浏览器API请求权限
      console.log('在浏览器中运行，使用浏览器API请求权限');
      
      // 检查浏览器是否支持媒体设备
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('您的浏览器不支持视频录制功能');
      }
      
      // 请求相机权限
      const cameraStream = await navigator.mediaDevices.getUserMedia({ 
        video: true,
        audio: true 
      });
      
      // 停止流以释放资源
      cameraStream.getTracks().forEach(track => track.stop());
      
      console.log('权限请求成功');
      return true;
    }
  } catch (err) {
    console.error('权限请求失败:', err);
    throw new Error('需要相机和麦克风权限才能使用此功能');
  }
}

// 开始录制视频的准备工作
const prepareRecording = () => {
  // 设置录制状态
  isRecording.value = true;
  error.value = '';
  
  // 检查是否需要显示使用说明
  checkShowInstructions();
  
  // 如果弹窗显示，等待用户确认后再开始录制
  if (showInstructions.value) {
    console.log('等待用户确认使用说明弹窗...');
    // 录制逻辑将在弹窗关闭后执行
  } else {
    // 如果没有弹窗，直接开始录制
    startRecording();
  }
};

// 实际的录制视频功能
const startRecording = async () => {
  try {
    // 如果已经有视频，先清空
    if (videos.value.length > 0) {
      videos.value = [];
      show3DModel.value = false;
      cleanupScene();
    }
    
    console.log('开始录制视频流程');
    
    // 检查权限
    console.log('请求相机和麦克风权限...');
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      console.error('权限检查失败');
      return;
    }
    
    console.log('权限获取成功，准备录制视频');
    
    // 使用MediaCapture录制视频
    console.log('开始录制视频...');
    const options = {
      limit: 1,           // 限制录制1个视频
      duration: 5,        // 最大录制时间5秒
      quality: 1,         // 质量 (0=低, 1=中, 2=高)
      allowEdit: false    // 不允许编辑
    };
    
    // 录制视频 - 这会打开设备的相机应用
    const mediaFiles = await mediaCapture.captureVideo(options);
    
    console.log('视频录制成功，视频数据:', mediaFiles);
    
    // 处理录制的视频文件
    if (mediaFiles && mediaFiles.length > 0) {
      const videoFile = mediaFiles[0];
      console.log('视频文件信息:', {
        name: videoFile.name,
        size: videoFile.size,
        fullPath: videoFile.fullPath,
        type: videoFile.type,
        lastModifiedDate: videoFile.lastModifiedDate
      });
      
      // 改进视频路径处理，确保跨平台兼容性
      let videoPath = videoFile.fullPath;
      
      // 对于Capacitor应用，使用Capacitor.convertFileSrc确保正确的文件访问
      if (Capacitor.isNativePlatform()) {
        try {
          videoPath = Capacitor.convertFileSrc(videoPath);
        } catch (convertError) {
          console.warn('文件路径转换失败，尝试添加file://前缀:', convertError);
          // 如果转换失败，尝试添加file://前缀
          if (!videoPath.startsWith('file://') && !videoPath.startsWith('http') && !videoPath.startsWith('blob:')) {
            try {
              videoPath = Capacitor.convertFileSrc('file://' + videoPath);
            } catch (secondError) {
              console.warn('二次转换仍失败，使用原始路径:', secondError);
            }
          }
        }
      } else {
        // 在Web平台上，确保路径格式正确
        if (!videoPath.startsWith('file://') && !videoPath.startsWith('http') && !videoPath.startsWith('blob:')) {
          videoPath = 'file://' + videoPath;
        }
      }
      
      // 设置录制视频的URL用于预览
      recordedVideoUrl.value = videoPath;
      
      videos.value.push(videoPath);
      console.log('视频添加到数组成功，路径:', videoPath);
      
      // 保存视频并显示重建确认弹窗
      saveVideoToStorage(videoPath);
      
      console.log('视频录制完成，已跳转到视频管理页面');
    } else {
      throw new Error('未录制到视频文件');
    }
  } catch (err) {
    console.error('录制视频失败:', err);
    console.error('错误详情:', JSON.stringify(err, null, 2));
    
    // 提供更具体的错误信息
    if (err.code) {
      switch (err.code) {
        case 3: // 用户取消
          error.value = '录制已取消';
          break;
        case 2: // 设备不支持
          error.value = '您的设备不支持视频录制';
          break;
        case 1: // 应用未获得权限
          error.value = '未获得相机/麦克风权限，请在设备设置中开启';
          break;
        default:
          error.value = `录制失败: 错误代码 ${err.code}`;
      }
    } else if (err.message) {
      error.value = `录制失败: ${err.message}`;
    } else {
      error.value = '录制视频失败，请重试';
    }
  } finally {
    isRecording.value = false;
    console.log('录制视频流程结束');
  }
};

// 移除视频
const removeVideo = (index) => {
  videos.value.splice(index, 1);
};

// 保存视频到本地存储
const saveVideoToStorage = (videoUrl) => {
  try {
    // 从本地存储获取现有视频列表
    const savedVideos = localStorage.getItem('photoReconstructionVideos');
    let videosList = [];
    
    if (savedVideos) {
      videosList = JSON.parse(savedVideos);
    }
    
    // 添加新视频
    videosList.push(videoUrl);
    
    // 保存回本地存储
    localStorage.setItem('photoReconstructionVideos', JSON.stringify(videosList));
    
    console.log('视频已保存到本地存储，当前视频数量:', videosList.length);
    
    // 显示重建确认弹窗，而不是直接跳转
    showReconstructConfirm.value = true;
  } catch (error) {
    console.error('保存视频到本地存储失败:', error);
  }
};


// 触发文件选择对话框
const triggerFileUpload = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click();
  }
};

// 处理文件上传
const handleFileUpload = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  
  // 检查文件类型
  if (!file.type.startsWith('video/')) {
    error.value = '请选择有效的视频文件';
    return;
  }
  
  // 检查文件大小（例如：限制为50MB）
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    error.value = '视频文件太大，请选择50MB以下的文件';
    return;
  }
  
  // 如果已经有视频，先清空
  if (videos.value.length > 0) {
    videos.value = [];
    // 移除不存在的属性引用
  }
  
  // 创建文件读取器
  const reader = new FileReader();
  reader.onload = (e) => {
    // 将视频数据URL添加到数组
    const videoDataUrl = e.target.result;
    videos.value.push(videoDataUrl);
    
    // 设置上传视频的URL用于预览
    recordedVideoUrl.value = videoDataUrl;
    
    // 保存视频并显示重建确认弹窗
    saveVideoToStorage(videoDataUrl);
    
    console.log('视频上传完成，显示重建确认弹窗');
  };
  reader.onerror = () => {
    error.value = '读取视频文件失败';
  };
  reader.readAsDataURL(file);
  
  // 清空文件输入，以便可以再次选择同一个文件
  event.target.value = '';
};

// 处理视频错误
const handleVideoError = (e) => {
  console.error('视频播放错误:', e);
  const video = e.target;
  error.value = '视频加载失败，请尝试重新录制或上传';
  console.log('当前视频源:', video.src);
};



// 相机控制变量
let mouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;
let rotationX = 0;
let rotationY = 0;
let scale = 1;









// 导入轨道控制器需要的Three.js扩展


</script>

<style scoped>
@import './PhotoReconstruction.css';
</style>

<template>
  <div class="photo-reconstruction">
    <div class="page-header">
      <h1><i class="fas fa-cube"></i> 照片三维重建系统</h1>
      <p class="page-description">通过视频快速创建高质量三维模型</p>
    </div>
    

    
    <!-- 错误提示 -->
    <div v-if="error" class="error-message">
      <i class="fas fa-exclamation-triangle"></i> {{ error }}
    </div>
    
    <!-- 录制视频按钮组 -->
    <div class="button-group">
      <button 
        class="primary-button capture-button" 
        @click="prepareRecording" 
        :disabled="isRecording"
      >
        <i class="fas fa-video"></i> {{ isRecording ? '录制中...' : '录制视频' }}
      </button>
      <button 
        class="secondary-button upload-button" 
        @click="triggerFileUpload" 
      >
        <i class="fas fa-folder-open"></i> 上传视频
      </button>
      <input 
        ref="fileInputRef" 
        type="file" 
        accept="video/*" 
        style="display: none" 
        @change="handleFileUpload"
      />
    </div>
    
    <!-- 使用说明弹窗 -->
    <div v-if="showInstructions" class="instructions-modal">
      <div class="modal-overlay" @click="closeInstructions"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h3><i class="fas fa-info-circle"></i> 使用说明</h3>
          <button class="close-button" @click="closeInstructions">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <ol>
            <li><strong>权限获取：</strong>点击"录制视频"按钮获取摄像头权限</li>
            <li><strong>视频录制：</strong>录制一个视频片段，建议视频5-10秒</li>
            <li><strong>视频上传：</strong>支持上传已有的视频文件进行重建</li>
            <li><strong>三维重建：</strong>录制或上传完成后自动开始三维重建</li>
            <li><strong>模型查看：</strong>查看生成的三维模型预览，支持交互操作</li>
          </ol>
        </div>
        <div class="modal-footer">
          <label class="dont-show-again">
            <input type="checkbox" v-model="dontShowAgain">
            <span>下次不再显示</span>
          </label>
          <button class="confirm-button" @click="closeInstructions">
            我知道了
          </button>
        </div>
      </div>
    </div>
    
    <!-- 重建确认弹窗 -->
    <div v-if="showReconstructConfirm" class="modal">
      <div class="modal-overlay" @click="cancelReconstruct"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h3><i class="fas fa-check-circle"></i> 视频录制完成</h3>
          <button class="close-button" @click="cancelReconstruct">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="video-preview">
            <video 
              ref="recordedVideo" 
              controls 
              :src="recordedVideoUrl" 
              width="100%" 
              height="auto"
              @error="handleVideoError"
              style="max-height: 300px; object-fit: contain;"
            ></video>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="cancelReconstruct" class="secondary-button">
            <i class="fas fa-redo"></i> 继续录制
          </button>
          <button @click="confirmReconstruct" class="primary-button">
            <i class="fas fa-cubes"></i> 跳转到视频界面进行重建
          </button>
        </div>
      </div>
    </div>

  </div>
</template>