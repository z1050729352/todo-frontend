<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  playerName: String,
  difficulty: String
});

const emit = defineEmits(['gameOver']);

const canvas = ref(null);
let ctx = null;
let animationId = null;
let gameRunning = false;

// 游戏状态
const score = ref(0);
const health = ref(100);

// 难度配置
const difficultyConfig = {
  easy: { enemySpeed: 2, enemySpawnRate: 0.015, bulletSpeed: 8 },
  medium: { enemySpeed: 3.5, enemySpawnRate: 0.025, bulletSpeed: 8 },
  hard: { enemySpeed: 5, enemySpawnRate: 0.04, bulletSpeed: 8 }
};

const config = difficultyConfig[props.difficulty];

// 游戏对象
let player = null;
let bullets = [];
let enemies = [];
let particles = [];

class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 40;
    this.height = 50;
    this.speed = 5;
  }

  draw() {
    // 飞机主体
    ctx.fillStyle = '#4a9eff';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - 20);
    ctx.lineTo(this.x - 15, this.y + 20);
    ctx.lineTo(this.x, this.y + 10);
    ctx.lineTo(this.x + 15, this.y + 20);
    ctx.closePath();
    ctx.fill();
    
    // 机翼
    ctx.fillStyle = '#6bb6ff';
    ctx.fillRect(this.x - 20, this.y, 40, 8);
    
    // 驾驶舱
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y - 5, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  update(targetX, targetY) {
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 5) {
      this.x += (dx / distance) * this.speed;
      this.y += (dy / distance) * this.speed;
    }
    
    // 边界限制
    this.x = Math.max(20, Math.min(canvas.value.width - 20, this.x));
    this.y = Math.max(30, Math.min(canvas.value.height - 30, this.y));
  }
}

class Bullet {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 4;
    this.height = 12;
    this.speed = config.bulletSpeed;
  }

  draw() {
    ctx.fillStyle = '#ffeb3b';
    ctx.fillRect(this.x - 2, this.y - 6, this.width, this.height);
    
    // 子弹光晕
    ctx.fillStyle = 'rgba(255, 235, 59, 0.5)';
    ctx.fillRect(this.x - 3, this.y - 8, this.width + 2, this.height + 4);
  }

  update() {
    this.y -= this.speed;
  }
}

class Enemy {
  constructor() {
    this.x = Math.random() * (canvas.value.width - 40) + 20;
    this.y = -30;
    this.width = 35;
    this.height = 35;
    this.speed = config.enemySpeed + Math.random() * 1;
    this.health = 2; // 需要2点伤害才能摧毁
  }

  draw() {
    // 根据生命值改变颜色
    const healthPercent = this.health / 2;
    const red = Math.floor(255);
    const green = Math.floor(71 + (180 - 71) * (1 - healthPercent));
    const blue = Math.floor(87 + (200 - 87) * (1 - healthPercent));
    
    // 敌机主体（头部）
    ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y + 15);
    ctx.lineTo(this.x - 12, this.y - 10);
    ctx.lineTo(this.x, this.y - 5);
    ctx.lineTo(this.x + 12, this.y - 10);
    ctx.closePath();
    ctx.fill();
    
    // 机翼（机身）
    ctx.fillStyle = '#ff6b81';
    ctx.fillRect(this.x - 15, this.y, 30, 6);
  }

  update() {
    this.y += this.speed;
  }
  
  // 获取头部碰撞区域
  getHeadHitbox() {
    return {
      x: this.x - 12,
      y: this.y - 10,
      width: 24,
      height: 20
    };
  }
  
  // 获取机身碰撞区域
  getBodyHitbox() {
    return {
      x: this.x - 15,
      y: this.y,
      width: 30,
      height: 6
    };
  }
  
  // 检测击中部位并返回伤害值
  checkHit(bullet) {
    const head = this.getHeadHitbox();
    const body = this.getBodyHitbox();
    
    // 检测头部击中（重创，2点伤害）
    if (bullet.x >= head.x && bullet.x <= head.x + head.width &&
        bullet.y >= head.y && bullet.y <= head.y + head.height) {
      return 2; // 头部重创
    }
    
    // 检测机身击中（轻伤，1点伤害）
    if (bullet.x >= body.x && bullet.x <= body.x + body.width &&
        bullet.y >= body.y && bullet.y <= body.y + body.height) {
      return 1; // 机身轻伤
    }
    
    return 0; // 未击中
  }
}

class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 4;
    this.vy = (Math.random() - 0.5) * 4;
    this.life = 1;
    this.color = color;
  }

  draw() {
    ctx.fillStyle = this.color;
    ctx.globalAlpha = this.life;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life -= 0.02;
  }
}

// 触摸和鼠标控制
let touchX = 0;
let touchY = 0;
let isTouching = false;

function handleTouchStart(e) {
  e.preventDefault();
  isTouching = true;
  const touch = e.touches[0];
  const rect = canvas.value.getBoundingClientRect();
  touchX = touch.clientX - rect.left;
  touchY = touch.clientY - rect.top;
}

function handleTouchMove(e) {
  e.preventDefault();
  if (!isTouching) return;
  const touch = e.touches[0];
  const rect = canvas.value.getBoundingClientRect();
  touchX = touch.clientX - rect.left;
  touchY = touch.clientY - rect.top;
}

function handleTouchEnd(e) {
  e.preventDefault();
  isTouching = false;
}

function handleMouseDown(e) {
  isTouching = true;
  const rect = canvas.value.getBoundingClientRect();
  touchX = e.clientX - rect.left;
  touchY = e.clientY - rect.top;
}

function handleMouseMove(e) {
  if (!isTouching) return;
  const rect = canvas.value.getBoundingClientRect();
  touchX = e.clientX - rect.left;
  touchY = e.clientY - rect.top;
}

function handleMouseUp() {
  isTouching = false;
}

// 设置画布大小
function setCanvasSize() {
  if (!canvas.value) return;
  
  const maxWidth = 600;
  const width = Math.min(window.innerWidth, maxWidth);
  const height = window.innerHeight;
  
  canvas.value.width = width;
  canvas.value.height = height;
  
  // 如果玩家已存在，调整位置
  if (player) {
    player.x = Math.min(player.x, width - 20);
    player.y = Math.min(player.y, height - 30);
  }
}

// 碰撞检测
function checkCollision(obj1, obj2) {
  return obj1.x < obj2.x + obj2.width &&
         obj1.x + obj1.width > obj2.x &&
         obj1.y < obj2.y + obj2.height &&
         obj1.y + obj1.height > obj2.y;
}

// 创建爆炸效果
function createExplosion(x, y, color) {
  for (let i = 0; i < 15; i++) {
    particles.push(new Particle(x, y, color));
  }
}

// 自动射击
let lastShootTime = 0;
function autoShoot(currentTime) {
  if (currentTime - lastShootTime > 200) {
    bullets.push(new Bullet(player.x, player.y - 20));
    lastShootTime = currentTime;
  }
}

// 游戏循环
function gameLoop(currentTime) {
  if (!gameRunning) return;

  ctx.fillStyle = '#0a0e27';
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);

  // 绘制星空背景
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  for (let i = 0; i < 50; i++) {
    const x = (i * 37) % canvas.value.width;
    const y = ((currentTime * 0.05 + i * 50) % canvas.value.height);
    ctx.fillRect(x, y, 1, 1);
  }

  // 更新和绘制玩家
  if (isTouching && player) {
    player.update(touchX, touchY);
  }
  if (player) {
    player.draw();
    autoShoot(currentTime);
  }

  // 更新和绘制子弹
  bullets = bullets.filter(bullet => {
    bullet.update();
    bullet.draw();
    return bullet.y > -20;
  });

  // 生成敌机
  if (Math.random() < config.enemySpawnRate) {
    enemies.push(new Enemy());
  }

  // 更新和绘制敌机
  enemies = enemies.filter(enemy => {
    enemy.update();
    enemy.draw();

    // 检测子弹碰撞
    for (let i = bullets.length - 1; i >= 0; i--) {
      const damage = enemy.checkHit(bullets[i]);
      
      if (damage > 0) {
        bullets.splice(i, 1);
        enemy.health -= damage;
        
        // 根据伤害类型创建不同的视觉效果
        if (damage === 2) {
          // 头部重创 - 黄色爆炸
          createExplosion(enemy.x, enemy.y - 5, '#ffeb3b');
          score.value += 15; // 头部击中额外奖励
        } else {
          // 机身轻伤 - 橙色火花
          createExplosion(enemy.x, enemy.y, '#ff9800');
          score.value += 5;
        }
        
        if (enemy.health <= 0) {
          // 完全摧毁 - 大爆炸
          createExplosion(enemy.x, enemy.y, '#ff4757');
          for (let j = 0; j < 10; j++) {
            particles.push(new Particle(enemy.x, enemy.y, '#ffeb3b'));
          }
          score.value += 10; // 摧毁奖励
          return false;
        }
      }
    }

    // 检测玩家碰撞
    if (player && checkCollision(player, enemy)) {
      health.value -= 20;
      createExplosion(enemy.x, enemy.y, '#ff4757');
      
      if (health.value <= 0) {
        endGame();
      }
      return false;
    }

    return enemy.y < canvas.value.height + 30;
  });

  // 更新和绘制粒子
  particles = particles.filter(particle => {
    particle.update();
    particle.draw();
    return particle.life > 0;
  });

  animationId = requestAnimationFrame(gameLoop);
}

function endGame() {
  gameRunning = false;
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  emit('gameOver', score.value);
}

onMounted(() => {
  if (!canvas.value) {
    console.error('Canvas元素未找到');
    return;
  }
  
  ctx = canvas.value.getContext('2d');
  
  // 设置画布大小
  setCanvasSize();
  
  // 监听窗口大小变化
  window.addEventListener('resize', setCanvasSize);

  // 初始化玩家
  player = new Player(canvas.value.width / 2, canvas.value.height - 100);

  // 添加事件监听
  canvas.value.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.value.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.value.addEventListener('touchend', handleTouchEnd, { passive: false });
  canvas.value.addEventListener('mousedown', handleMouseDown);
  canvas.value.addEventListener('mousemove', handleMouseMove);
  canvas.value.addEventListener('mouseup', handleMouseUp);

  // 开始游戏
  gameRunning = true;
  animationId = requestAnimationFrame(gameLoop);
});

onUnmounted(() => {
  gameRunning = false;
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  
  window.removeEventListener('resize', setCanvasSize);
  
  if (canvas.value) {
    canvas.value.removeEventListener('touchstart', handleTouchStart);
    canvas.value.removeEventListener('touchmove', handleTouchMove);
    canvas.value.removeEventListener('touchend', handleTouchEnd);
    canvas.value.removeEventListener('mousedown', handleMouseDown);
    canvas.value.removeEventListener('mousemove', handleMouseMove);
    canvas.value.removeEventListener('mouseup', handleMouseUp);
  }
});
</script>

<template>
  <div class="game-container">
    <div class="game-ui">
      <div class="ui-item">
        <span class="label">玩家</span>
        <span class="value">{{ playerName }}</span>
      </div>
      <div class="ui-item">
        <span class="label">分数</span>
        <span class="value score">{{ score }}</span>
      </div>
      <div class="ui-item">
        <span class="label">生命</span>
        <div class="health-bar">
          <div class="health-fill" :style="{ width: health + '%' }"></div>
        </div>
      </div>
    </div>
    <canvas ref="canvas"></canvas>
  </div>
</template>

<style scoped>
.game-container {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  justify-content: center;
  background: #0a0e27;
  overflow: hidden;
}

canvas {
  display: block;
  touch-action: none;
  cursor: none;
  max-width: 100%;
  max-height: 100%;
}

.game-ui {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 15px;
  z-index: 10;
  background: rgba(0, 0, 0, 0.5);
  padding: 8px 15px;
  border-radius: 10px;
  backdrop-filter: blur(5px);
  max-width: 90%;
}

.ui-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 0;
}

.label {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.7rem;
  white-space: nowrap;
}

.value {
  color: #fff;
  font-size: 1rem;
  font-weight: bold;
}

.value.score {
  color: #ffeb3b;
}

.health-bar {
  width: 80px;
  height: 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  overflow: hidden;
}

.health-fill {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #8bc34a);
  transition: width 0.3s;
}

@media (max-width: 480px) {
  .game-ui {
    gap: 8px;
    padding: 6px 10px;
    font-size: 0.85rem;
  }
  
  .label {
    font-size: 0.65rem;
  }
  
  .value {
    font-size: 0.9rem;
  }
  
  .health-bar {
    width: 60px;
    height: 6px;
  }
}

@media (max-width: 360px) {
  .game-ui {
    gap: 5px;
    padding: 5px 8px;
  }
  
  .label {
    font-size: 0.6rem;
  }
  
  .value {
    font-size: 0.85rem;
  }
  
  .health-bar {
    width: 50px;
  }
}
</style>
