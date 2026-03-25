<script setup>
import { ref } from 'vue';

const emit = defineEmits(['start']);

const playerName = ref('');
const difficulty = ref('medium');

const difficulties = [
  { value: 'easy', label: '简单', desc: '适合新手' },
  { value: 'medium', label: '中等', desc: '有点挑战' },
  { value: 'hard', label: '困难', desc: '极限挑战' }
];

function handleStart() {
  if (!playerName.value.trim()) {
    alert('请输入玩家名称');
    return;
  }
  emit('start', playerName.value.trim(), difficulty.value);
}
</script>

<template>
  <div class="game-start">
    <div class="stars"></div>
    <div class="content">
      <h1 class="title">✈️ 飞机大战</h1>
      <div class="form">
        <div class="input-group">
          <label>玩家名称</label>
          <input 
            v-model="playerName" 
            type="text" 
            placeholder="请输入你的名字"
            maxlength="20"
            @keyup.enter="handleStart"
          />
        </div>
        
        <div class="difficulty-group">
          <label>选择难度</label>
          <div class="difficulty-options">
            <div 
              v-for="diff in difficulties" 
              :key="diff.value"
              class="difficulty-option"
              :class="{ active: difficulty === diff.value }"
              @click="difficulty = diff.value"
            >
              <div class="diff-label">{{ diff.label }}</div>
              <div class="diff-desc">{{ diff.desc }}</div>
            </div>
          </div>
        </div>
        
        <button class="start-btn" @click="handleStart">
          开始游戏
        </button>
      </div>
      
      <div class="instructions">
        <h3>游戏说明</h3>
        <p>👆 触摸屏幕控制飞机移动</p>
        <p>🎯 击毁障碍物获得分数</p>
        <p>💥 避免碰撞障碍物</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-start {
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #0a0e27 0%, #1a1f3a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.stars {
  position: absolute;
  width: 100%;
  height: 100%;
  background-image: 
    radial-gradient(2px 2px at 20% 30%, white, transparent),
    radial-gradient(2px 2px at 60% 70%, white, transparent),
    radial-gradient(1px 1px at 50% 50%, white, transparent),
    radial-gradient(1px 1px at 80% 10%, white, transparent),
    radial-gradient(2px 2px at 90% 60%, white, transparent),
    radial-gradient(1px 1px at 33% 80%, white, transparent);
  background-size: 200% 200%;
  animation: twinkle 8s ease-in-out infinite;
}

@keyframes twinkle {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.content {
  position: relative;
  z-index: 1;
  max-width: 400px;
  width: 90%;
  max-height: 90%;
  overflow-y: auto;
  padding: 2rem 1.5rem;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.content::-webkit-scrollbar {
  width: 4px;
}

.content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
}

.content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}

.title {
  font-size: 2.5rem;
  color: #fff;
  text-align: center;
  margin-bottom: 2rem;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
}

.form {
  margin-bottom: 2rem;
}

.input-group {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  color: #fff;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

input {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 1rem;
  transition: all 0.3s;
}

input:focus {
  outline: none;
  border-color: #4a9eff;
  background: rgba(255, 255, 255, 0.15);
}

input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.difficulty-group {
  margin-bottom: 1.5rem;
}

.difficulty-options {
  display: flex;
  gap: 0.5rem;
}

.difficulty-option {
  flex: 1;
  padding: 0.75rem 0.5rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.3s;
  text-align: center;
}

.difficulty-option:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
}

.difficulty-option.active {
  border-color: #4a9eff;
  background: rgba(74, 158, 255, 0.3);
}

.diff-label {
  color: #fff;
  font-weight: bold;
  margin-bottom: 0.25rem;
}

.diff-desc {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.75rem;
}

.start-btn {
  width: 100%;
  padding: 1rem;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.start-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

.start-btn:active {
  transform: translateY(0);
}

.instructions {
  text-align: center;
  color: rgba(255, 255, 255, 0.8);
}

.instructions h3 {
  margin-bottom: 0.75rem;
  color: #fff;
}

.instructions p {
  margin: 0.5rem 0;
  font-size: 0.9rem;
}

@media (max-width: 480px) {
  .content {
    padding: 1.5rem 1rem;
    width: 95%;
  }
  
  .title {
    font-size: 1.8rem;
    margin-bottom: 1.5rem;
  }
  
  .difficulty-options {
    flex-direction: column;
  }
  
  .instructions {
    font-size: 0.85rem;
  }
  
  .instructions h3 {
    font-size: 1rem;
  }
}

@media (max-height: 700px) {
  .content {
    padding: 1rem;
  }
  
  .title {
    font-size: 1.5rem;
    margin-bottom: 1rem;
  }
  
  .form {
    margin-bottom: 1rem;
  }
  
  .input-group, .difficulty-group {
    margin-bottom: 1rem;
  }
  
  .instructions {
    display: none;
  }
}
</style>
