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

const score = ref(0);
const health = ref(100);
const gameTime = ref(0);
let startTime = 0;

const difficultyConfig = {
  easy: { enemySpeed: 2, enemySpawnRate: 0.015, bulletSpeed: 8, bossAttackMultiplier: 0.7, bossHealPercent: 30 },
  medium: { enemySpeed: 3.5, enemySpawnRate: 0.025, bulletSpeed: 8, bossAttackMultiplier: 1, bossHealPercent: 20 },
  hard: { enemySpeed: 5, enemySpawnRate: 0.04, bulletSpeed: 8, bossAttackMultiplier: 1.5, bossHealPercent: 15 }
};

const MAX_GAME_TIME = 1200; // 20分钟
let gameCompleted = false;

const config = difficultyConfig[props.difficulty];

let currentBoss = null;
let nextBossTime = 30000;
let bossLevel = 1;

// 音效系统
const sounds = {
  bgm: null,
  shoot: null,
  bossSkill: null,
  bossDefeat: null,
  victory: null
};

function initSounds() {
  // 使用Web Audio API创建简单音效
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  sounds.shoot = () => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = 800;
    oscillator.type = 'square';
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  };
  
  sounds.bossSkill = () => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = 200;
    oscillator.type = 'sawtooth';
    gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  };
  
  sounds.bossDefeat = () => {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 400 - i * 100;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
      }, i * 100);
    }
  };
  
  sounds.victory = () => {
    const notes = [523, 587, 659, 698, 784];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = freq;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      }, i * 150);
    });
  };
}

let player = null;
let bullets = [];
let enemies = [];
let particles = [];
let bossBullets = [];

class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 40;
    this.height = 50;
  }

  draw() {
    ctx.fillStyle = '#4a9eff';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - 20);
    ctx.lineTo(this.x - 15, this.y + 20);
    ctx.lineTo(this.x, this.y + 10);
    ctx.lineTo(this.x + 15, this.y + 20);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = '#6bb6ff';
    ctx.fillRect(this.x - 20, this.y, 40, 8);
    
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y - 5, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  moveTo(targetX, targetY) {
    this.x = targetX;
    this.y = targetY;
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
  }

  draw() {
    ctx.fillStyle = '#ff4757';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y + 15);
    ctx.lineTo(this.x - 12, this.y - 10);
    ctx.lineTo(this.x, this.y - 5);
    ctx.lineTo(this.x + 12, this.y - 10);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = '#ff6b81';
    ctx.fillRect(this.x - 15, this.y, 30, 6);
  }

  update() {
    this.y += this.speed;
  }
  
  checkHit(bullet) {
    return Math.abs(bullet.x - this.x) < 20 && Math.abs(bullet.y - this.y) < 20;
  }
}

class Boss {
  constructor(level, attackType) {
    this.x = canvas.value.width / 2;
    this.y = 80;
    this.width = 80;
    this.height = 80;
    this.maxHealth = 50 + level * 20;
    this.health = this.maxHealth;
    this.level = level;
    this.attackType = attackType;
    this.lastAttackTime = 0;
    this.attackInterval = 1000;
    this.moveDirection = 1;
    this.damage = Math.floor(10 + level * 5) * config.bossAttackMultiplier;
    this.color = this.getColorByType(attackType);
  }
  
  getColorByType(type) {
    const colors = {
      spiral: '#ff6b00',
      laser: '#ff0066',
      spread: '#9c27b0',
      circle: '#2196f3',
      wave: '#00bcd4',
      cross: '#ff5722',
      random: '#4caf50',
      ultimate: '#ffd700'
    };
    return colors[type] || '#ff6b00';
  }

  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y + 30);
    ctx.lineTo(this.x - 35, this.y - 20);
    ctx.lineTo(this.x, this.y - 10);
    ctx.lineTo(this.x + 35, this.y - 20);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = this.color + 'cc';
    ctx.fillRect(this.x - 40, this.y, 80, 12);
    
    const barWidth = 100;
    const barHeight = 8;
    const barX = this.x - barWidth / 2;
    const barY = this.y - 40;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    
    const healthPercent = this.health / this.maxHealth;
    ctx.fillStyle = healthPercent > 0.5 ? '#4caf50' : healthPercent > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`BOSS LV.${this.level}`, this.x, this.y - 50);
  }

  update(currentTime) {
    this.x += this.moveDirection * 2;
    if (this.x < 50 || this.x > canvas.value.width - 50) {
      this.moveDirection *= -1;
    }
    
    if (currentTime - this.lastAttackTime > this.attackInterval) {
      this.attack();
      this.lastAttackTime = currentTime;
    }
  }

  attack() {
    if (sounds.bossSkill) sounds.bossSkill();
    
    if (this.attackType === 'spiral') {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + Date.now() * 0.005;
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage));
      }
    } else if (this.attackType === 'laser') {
      for (let i = -2; i <= 2; i++) {
        bossBullets.push(new BossBullet(this.x + i * 15, this.y + 20, Math.PI / 2, this.damage, 8));
      }
    } else if (this.attackType === 'spread') {
      for (let i = -3; i <= 3; i++) {
        const angle = Math.PI / 2 + (i * Math.PI / 12);
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage));
      }
    } else if (this.attackType === 'circle') {
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage));
      }
    } else if (this.attackType === 'wave') {
      for (let i = -4; i <= 4; i++) {
        const angle = Math.PI / 2 + Math.sin(Date.now() * 0.01 + i) * 0.5;
        bossBullets.push(new BossBullet(this.x + i * 10, this.y + 20, angle, this.damage));
      }
    } else if (this.attackType === 'cross') {
      [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach(angle => {
        for (let i = 0; i < 3; i++) {
          setTimeout(() => {
            bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage));
          }, i * 100);
        }
      });
    } else if (this.attackType === 'random') {
      for (let i = 0; i < 10; i++) {
        const angle = Math.random() * Math.PI * 2;
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage, 3 + Math.random() * 3));
      }
    } else if (this.attackType === 'ultimate') {
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage, 5));
      }
      setTimeout(() => {
        for (let i = 0; i < 16; i++) {
          const angle = (i / 16) * Math.PI * 2 + Math.PI / 16;
          bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage, 5));
        }
      }, 300);
    }
  }
}

class BossBullet {
  constructor(x, y, angle, damage, speed = 4) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = speed;
    this.damage = damage;
    this.radius = 6;
  }

  draw() {
    ctx.fillStyle = '#ff0066';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#ff66a3';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  update() {
    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed;
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

function setCanvasSize() {
  if (!canvas.value) return;
  const maxWidth = 600;
  const width = Math.min(window.innerWidth, maxWidth);
  const height = window.innerHeight;
  canvas.value.width = width;
  canvas.value.height = height;
  if (player) {
    player.x = Math.min(player.x, width - 20);
    player.y = Math.min(player.y, height - 30);
  }
}

function createExplosion(x, y, color) {
  for (let i = 0; i < 15; i++) {
    particles.push(new Particle(x, y, color));
  }
}

let lastShootTime = 0;
function autoShoot(currentTime) {
  if (currentTime - lastShootTime > 200) {
    bullets.push(new Bullet(player.x, player.y - 20));
    if (sounds.shoot) sounds.shoot();
    lastShootTime = currentTime;
  }
}

function getScoreMultiplier() {
  const seconds = gameTime.value;
  if (seconds < 20) return 1;
  if (seconds < 40) return 1.1;
  if (seconds < 60) return 1.2;
  if (seconds < 80) return 1.3;
  if (seconds < 100) return 1.5;
  return 1.5 + Math.floor((seconds - 100) / 20) * 0.1;
}

function gameLoop(currentTime) {
  if (!gameRunning) return;

  gameTime.value = Math.floor((currentTime - startTime) / 1000);
  
  // 检查是否通关
  if (gameTime.value >= MAX_GAME_TIME && !gameCompleted) {
    gameCompleted = true;
    if (sounds.victory) sounds.victory();
    endGame(true);
    return;
  }

  ctx.fillStyle = '#0a0e27';
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  for (let i = 0; i < 50; i++) {
    const x = (i * 37) % canvas.value.width;
    const y = ((currentTime * 0.05 + i * 50) % canvas.value.height);
    ctx.fillRect(x, y, 1, 1);
  }

  if (isTouching && player) {
    player.moveTo(touchX, touchY);
  }
  if (player) {
    player.draw();
    autoShoot(currentTime);
  }

  bullets = bullets.filter(bullet => {
    bullet.update();
    bullet.draw();
    return bullet.y > -20;
  });

  if (!currentBoss && currentTime - startTime > nextBossTime) {
    const attackTypes = ['spiral', 'laser', 'spread', 'circle', 'wave', 'cross', 'random', 'ultimate'];
    let attackType;
    if (bossLevel <= 8) {
      attackType = attackTypes[bossLevel - 1];
    } else {
      attackType = attackTypes[Math.floor(Math.random() * attackTypes.length)];
    }
    currentBoss = new Boss(bossLevel, attackType);
    bossLevel++;
    nextBossTime += 35000 + Math.random() * 10000;
  }

  if (currentBoss) {
    currentBoss.update(currentTime);
    currentBoss.draw();

    for (let i = bullets.length - 1; i >= 0; i--) {
      if (Math.abs(bullets[i].x - currentBoss.x) < 40 && 
          Math.abs(bullets[i].y - currentBoss.y) < 40) {
        bullets.splice(i, 1);
        currentBoss.health -= 5;
        createExplosion(currentBoss.x, currentBoss.y, '#ffeb3b');
        
        if (currentBoss.health <= 0) {
          const bossScore = Math.floor((100 + currentBoss.level * 50) * getScoreMultiplier());
          score.value += bossScore;
          
          // 恢复血量
          const healAmount = config.bossHealPercent;
          health.value = Math.min(100, health.value + healAmount);
          
          if (sounds.bossDefeat) sounds.bossDefeat();
          createExplosion(currentBoss.x, currentBoss.y, currentBoss.color);
          for (let j = 0; j < 30; j++) {
            particles.push(new Particle(currentBoss.x, currentBoss.y, '#ffeb3b'));
          }
          currentBoss = null;
        }
      }
    }
  }

  if (!currentBoss && Math.random() < config.enemySpawnRate) {
    enemies.push(new Enemy());
  }

  enemies = enemies.filter(enemy => {
    enemy.update();
    enemy.draw();

    for (let i = bullets.length - 1; i >= 0; i--) {
      if (enemy.checkHit(bullets[i])) {
        bullets.splice(i, 1);
        const enemyScore = Math.floor(20 * getScoreMultiplier());
        score.value += enemyScore;
        createExplosion(enemy.x, enemy.y, '#ffeb3b');
        return false;
      }
    }

    if (player && Math.abs(player.x - enemy.x) < 25 && Math.abs(player.y - enemy.y) < 25) {
      health.value -= 20;
      createExplosion(enemy.x, enemy.y, '#ff4757');
      if (health.value <= 0) {
        endGame();
      }
      return false;
    }

    if (enemy.y > canvas.value.height) {
      const penalty = Math.floor(5 * getScoreMultiplier());
      score.value = Math.max(0, score.value - penalty);
      return false;
    }

    return enemy.y < canvas.value.height + 30;
  });

  bossBullets = bossBullets.filter(bullet => {
    bullet.update();
    bullet.draw();

    if (player && Math.abs(player.x - bullet.x) < 20 && Math.abs(player.y - bullet.y) < 20) {
      health.value = Math.max(0, health.value - bullet.damage);
      createExplosion(bullet.x, bullet.y, '#ff0066');
      if (health.value <= 0) {
        endGame();
      }
      return false;
    }

    return bullet.x > -20 && bullet.x < canvas.value.width + 20 && 
           bullet.y > -20 && bullet.y < canvas.value.height + 20;
  });

  particles = particles.filter(particle => {
    particle.update();
    particle.draw();
    return particle.life > 0;
  });

  animationId = requestAnimationFrame(gameLoop);
}

function endGame(victory = false) {
  gameRunning = false;
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  const finalScore = Math.floor(score.value * (1 + gameTime.value * 0.01));
  emit('gameOver', finalScore, victory);
}

onMounted(() => {
  if (!canvas.value) {
    console.error('Canvas元素未找到');
    return;
  }
  
  initSounds();
  
  ctx = canvas.value.getContext('2d');
  setCanvasSize();
  window.addEventListener('resize', setCanvasSize);

  player = new Player(canvas.value.width / 2, canvas.value.height - 100);

  canvas.value.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.value.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.value.addEventListener('touchend', handleTouchEnd, { passive: false });
  canvas.value.addEventListener('mousedown', handleMouseDown);
  canvas.value.addEventListener('mousemove', handleMouseMove);
  canvas.value.addEventListener('mouseup', handleMouseUp);

  gameRunning = true;
  startTime = performance.now();
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
        <span class="label">时间</span>
        <span class="value">{{ gameTime }}s</span>
      </div>
      <div class="ui-item">
        <span class="label">倍率</span>
        <span class="value">{{ getScoreMultiplier().toFixed(1) }}x</span>
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
  gap: 10px;
  z-index: 10;
  background: rgba(0, 0, 0, 0.5);
  padding: 8px 12px;
  border-radius: 10px;
  backdrop-filter: blur(5px);
  max-width: 95%;
  flex-wrap: wrap;
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
  font-size: 0.9rem;
  font-weight: bold;
}

.value.score {
  color: #ffeb3b;
}

.health-bar {
  width: 60px;
  height: 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  overflow: hidden;
}

.health-fill {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #8bc34a);
  transition: width 0.3s;
}

@media (max-width: 480px) {
  .game-ui {
    gap: 6px;
    padding: 6px 8px;
  }
  
  .label {
    font-size: 0.65rem;
  }
  
  .value {
    font-size: 0.85rem;
  }
  
  .health-bar {
    width: 50px;
  }
}
</style>
