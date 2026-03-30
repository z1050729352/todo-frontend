<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import html2canvas from 'html2canvas';

import { getSocket } from '../socket';

const props = defineProps({
  playerName: {
    type: String,
    default: '玩家'
  },
  difficulty: {
    type: String,
    default: 'medium'
  },
  isGuest: {
    type: Boolean,
    default: false
  },
  isMultiplayer: {
    type: Boolean,
    default: false
  },
  roomData: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['gameOver', 'backToHub']);

const canvas = ref(null);

// 截图功能状态
const isCapturing = ref(false);
const screenshotUrl = ref('');
const showScreenshotPreview = ref(false);

async function takeScreenshot() {
  if (isCapturing.value) return;
  
  // 暂停游戏
  if (!isPaused) togglePause();
  
  isCapturing.value = true;
  try {
    const gameContainer = document.querySelector('.game-container');
    const canvas_screenshot = await html2canvas(gameContainer, {
      useCORS: true,
      scale: 1.5, // 提高清晰度同时兼顾性能
      logging: false,
      backgroundColor: '#1a1a1a',
      ignoreElements: (element) => {
        // 忽略截图按钮本身和之前的预览弹窗
        return element.classList.contains('screenshot-btn') || 
               element.classList.contains('screenshot-preview-overlay') ||
               element.classList.contains('loading-overlay');
      }
    });
    
    // 压缩图片控制在 2MB 以内
    screenshotUrl.value = canvas_screenshot.toDataURL('image/jpeg', 0.7);
    showScreenshotPreview.value = true;
  } catch (error) {
    console.error('截图失败:', error);
    alert('截图失败，请稍后重试');
  } finally {
    isCapturing.value = false;
  }
}

function closeScreenshot() {
  showScreenshotPreview.value = false;
  screenshotUrl.value = '';
}
let ctx = null;
let animationId = null;
let gameRunning = false;

const score = ref(0);
const health = ref(100);
const teammateHealth = ref(100);
const gameTime = ref(0);
let startTime = 0;
let lastTime = 0;
let mapOffset = 0;
const mapSpeed = 0.5;

let rngSeed = Date.now();
function seededRandom() {
  rngSeed = (rngSeed * 9301 + 49297) % 233280;
  return rngSeed / 233280;
}
const getSeededRandom = seededRandom;

const difficultyConfig = {
  easy: { 
    enemySpeed: 2, 
    enemySpawnRate: 0.015, 
    bulletSpeed: 8, 
    bossAttackMultiplier: 0.7, 
    bossHealPercent: 30,
    powerUpRate: 0.0015,
    initialFireRate: 250,
    enemyCountMultiplier: 1 // 敌机数量倍率
  },
  medium: { 
    enemySpeed: 3.5, 
    enemySpawnRate: 0.02, 
    bulletSpeed: 8, 
    bossAttackMultiplier: 1, 
    bossHealPercent: 20,
    powerUpRate: 0.0012,
    initialFireRate: 200,
    enemyCountMultiplier: 1
  },
  hard: { 
    enemySpeed: 6.5, 
    enemySpawnRate: 0.035, 
    bulletSpeed: 10, 
    bossAttackMultiplier: 2.0, 
    bossHealPercent: 10,
    powerUpRate: 0.0015,
    initialFireRate: 150,
    enemyCountMultiplier: 1.5
  }
};

let gameCompleted = false;
const MAX_BOSS_COUNT = 12; // 打完 12 个 Boss 通关

const config = difficultyConfig[props.difficulty];

let currentBoss = null;
let nextBossTime = 30000; // 第一个 Boss 的出现时间
let lastBossDefeatedTime = 0; // 上一个 Boss 被击败的时间
let bossLevel = 1;

// 游戏特效和提示系统
let gameStartEffect = {
  active: false,
  phase: 0,
  startTime: 0,
  shipY: -100,
  targetY: 0,
  textAlpha: 0,
  textScale: 0.5
};

let gameOfficiallyStarted = false; // 游戏正式开始标志（特效结束后才为 true）

let bossWarningEffect = {
  active: false,
  startTime: 0,
  textAlpha: 0,
  shakeIntensity: 0
};

let newEnemyWarning = {
  active: false,
  startTime: 0,
  textAlpha: 0,
  enemyType: ''
};

let victoryEffect = {
  active: false,
  startTime: 0,
  particles: [],
  textAlpha: 1,
  textScale: 1
};

let notifiedEnemyTypes = new Set();

// 音效系统
const sounds = {
  bgm: null,
  shoot: null,
  bossSkill: null,
  bossDefeat: null,
  victory: null,
  explosion: null,
  powerUp: null
};

function initSounds() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // 普通射击音效 - 清脆的"哒"声
    sounds.shoot = (weaponType = 'normal') => {
      try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // 根据武器类型调整音效
        if (weaponType === 'laser') {
          // 激光：高频持续音
          oscillator.frequency.value = 1800;
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.03, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.08);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.08);
        } else if (weaponType === 'explosive') {
          // 爆炸弹：低沉有力
          oscillator.frequency.value = 200;
          oscillator.type = 'sawtooth';
          gainNode.gain.setValueAtTime(0.04, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.12);
        } else if (weaponType === 'pierce') {
          // 穿甲弹：尖锐穿透感
          oscillator.frequency.value = 1500;
          oscillator.type = 'triangle';
          gainNode.gain.setValueAtTime(0.03, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.06);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.06);
        } else if (weaponType === 'burst') {
          // 爆裂弹：低沉爆裂音
          oscillator.frequency.value = 300;
          oscillator.type = 'sawtooth';
          gainNode.gain.setValueAtTime(0.04, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.08);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.08);
        } else {
          // 普通子弹：清脆的"哒"
          oscillator.frequency.value = 1000;
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.03, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.05);
        }
      } catch (e) {}
    };
    
    // 爆炸音效
    sounds.explosion = () => {
      try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 100;
        oscillator.type = 'sawtooth';
        gainNode.gain.setValueAtTime(0.03, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
      } catch (e) {}
    };
    
    // 道具拾取音效 - 清脆悦耳
    sounds.powerUp = () => {
      try {
        const notes = [800, 1000];
        notes.forEach((freq, i) => {
          setTimeout(() => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.value = freq;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.04, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
          }, i * 40);
        });
      } catch (e) {}
    };
    
    // Boss技能音效 - 威胁感但不刺耳
    sounds.bossSkill = () => {
      try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 180;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.04, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.15);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.15);
      } catch (e) {}
    };
    
    // Boss被击败 - 胜利的音效
    sounds.bossDefeat = () => {
      try {
        const notes = [400, 500, 600];
        notes.forEach((freq, i) => {
          setTimeout(() => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.value = freq;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
          }, i * 60);
        });
      } catch (e) {}
    };

    // 低血量警告音效
    sounds.lowHealth = () => {
      try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 600;
        oscillator.type = 'square';
        gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      } catch (e) {}
    };
    
    // 动态 BGM 系统
    let bgmInterval = null;
    let currentBPM = 80;

    sounds.playBGM = () => {
      if (bgmInterval) return;
      bgmInterval = setInterval(() => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.value = 110; 
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0.01, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
        osc.start();
        osc.stop(audioContext.currentTime + 0.1);
      }, (60 / currentBPM) * 1000);
    };

    sounds.updateBPM = (newBPM) => {
      if (currentBPM === newBPM) return;
      currentBPM = newBPM;
      if (bgmInterval) {
        clearInterval(bgmInterval);
        bgmInterval = null;
        sounds.playBGM();
      }
    };

    sounds.stopBGM = () => {
      if (bgmInterval) {
        clearInterval(bgmInterval);
        bgmInterval = null;
      }
    };

    // 通关音效 - 欢快的旋律
    sounds.victory = () => {
      try {
        const melody = [523, 587, 659, 698, 784, 880];
        melody.forEach((freq, i) => {
          setTimeout(() => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.value = freq;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.06, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.15);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.15);
          }, i * 100);
        });
      } catch (e) {}
    };
  } catch (e) {
    console.log('音效初始化失败，继续游戏');
  }
}

let player = null;
let player2 = null; // Multiplayer
let bullets = [];
let bulletPool = []; // Bullet Object Pool
let otherPlayerBullets = []; // Bullets from the other player
let enemies = [];
let particles = [];
let bossBullets = [];
let powerUps = [];
let slowZones = []; // 改名为slowZones

// 环境效果
let slowEffect = { active: false, endTime: 0 };
let barrier = { active: false, health: 0, maxHealth: 4 };
let playerSlowEffect = { active: false, endTime: 0, speedMultiplier: 1 }; // 玩家减速效果

// 屏幕震动
let screenShake = { active: false, intensity: 0, endTime: 0 };

function triggerShake(intensity, duration) {
  screenShake.active = true;
  screenShake.intensity = intensity;
  screenShake.endTime = performance.now() + duration;
}
const MAX_BULLETS = 100;
const MAX_PARTICLES = 500; // 增加粒子上限以支持特效
const MAX_ENEMIES = 30;
const MAX_BOSS_BULLETS = 150;

// 创建子弹 (对象池)
function createBullet(x, y, type, level, spread, pierce, angle) {
  let b;
  if (bulletPool.length > 0) {
    b = bulletPool.pop();
    b.reset(x, y, type, level, spread, pierce, angle);
  } else {
    b = new Bullet(x, y, type, level, spread, pierce, angle);
  }
  bullets.push(b);
}

// 释放子弹
function freeBullet(bullet) {
  bullet.active = false;
  if (bulletPool.length < 200) {
    bulletPool.push(bullet);
  }
}
class BackgroundLayer {
  constructor(speed, count, color, sizeRange) {
    this.speed = speed;
    this.elements = [];
    for (let i = 0; i < count; i++) {
      this.elements.push({
        x: getSeededRandom() * 800, // 初始宽度，会在 resize 后调整
        y: getSeededRandom() * 1000,
        size: getSeededRandom() * (sizeRange[1] - sizeRange[0]) + sizeRange[0],
        opacity: getSeededRandom() * 0.5 + 0.2
      });
    }
    this.color = color;
  }

  update(delta, canvasHeight, canvasWidth) {
    this.elements.forEach(el => {
      el.y += this.speed * (delta / 16.67);
      if (el.y > canvasHeight) {
        el.y = -20;
        el.x = getSeededRandom() * canvasWidth;
      }
    });
  }

  draw(ctx) {
    ctx.fillStyle = this.color;
    this.elements.forEach(el => {
      ctx.globalAlpha = el.opacity;
      ctx.beginPath();
      if (this.speed > 50) { // 近景云层：椭圆
        ctx.ellipse(el.x, el.y, el.size * 2, el.size, 0, 0, Math.PI * 2);
      } else if (this.speed > 30) { // 中景建筑：方块
        ctx.fillRect(el.x, el.y, el.size, el.size * 1.5);
      } else { // 远景星空：圆点
        ctx.arc(el.x, el.y, el.size, 0, Math.PI * 2);
      }
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;
  }
}

let bgLayers = [];

function initBackground() {
  bgLayers = [
    new BackgroundLayer(20, 50, '#ffffff', [1, 3]), // 远景星空
    new BackgroundLayer(40, 15, '#333344', [20, 40]), // 中景建筑
    new BackgroundLayer(80, 8, '#555566', [60, 100]) // 近景云层
  ];
}

// 玩家武器系统
const playerWeapon = ref({
  // 属性类（可叠加）
  spreadLevel: 0, 
  pierceLevel: 0, 
  fireRate: 1, 
  
  // 强攻属性
  damageBoost: 0, // 攻击力叠加 0-3
  damageBoostEndTime: 0,
  
  // 弹道类（互斥）
  bulletType: 'normal',
  bulletLevel: 0,
  
  maxWeaponLevel: 10,
  maxFireRate: 5
});

// 计算总战机等级
function getTotalLevel() {
  const w = playerWeapon.value;
  return w.spreadLevel + w.pierceLevel + w.fireRate + w.bulletLevel;
}

// 道具类型
const POWERUP_TYPES = {
  // 武器类 - 提高权重
  RAPID: { color: '#f44336', symbol: '速', name: '射速', weight: 8 },
  EXPLOSIVE: { color: '#ff9800', symbol: '爆', name: '爆炸', weight: 5 },
  SPREAD: { color: '#2196f3', symbol: '散', name: '散射', weight: 5 },
  
  // 特效型导弹 - 提高权重
  LASER: { color: '#9c27b0', symbol: '光', name: '激光', weight: 4 },
  BURST: { color: '#00bcd4', symbol: '裂', name: '爆裂', weight: 4 },
  PIERCE: { color: '#ffeb3b', symbol: '穿', name: '穿甲', weight: 4 },
  
  // 防护性
  HEALTH: { color: '#4caf50', symbol: '血', name: '血包', weight: 2 },
  SHIELD: { color: '#607d8b', symbol: '盾', name: '护盾', weight: 1.5 },
  BARRIER: { color: '#795548', symbol: '墙', name: '防护罩', weight: 1 },
  
  // 环境型
  SLOW: { color: '#9e9e9e', symbol: '缓', name: '延缓', weight: 0.5 },
  
  // 强化类
  BOOST: { color: '#00FFFF', symbol: '+', name: '强攻', weight: 3 },
  
  // 战机升级
  PLANE: { color: '#9c27b0', symbol: '升', name: '强化', weight: 1.5 },
};

function drawHexagon(x, y, size) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const px = x + size * Math.cos(angle);
    const py = y + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
}

function createExhaustParticles(x, y) {
  if (particles.length >= MAX_PARTICLES) return;
  for (let i = 0; i < 2; i++) {
    createParticle(x, y, '#00FFFF', 0.8 + getSeededRandom() * 0.4, 'exhaust');
  }
}

// 伤害数字提示系统
class DamageIndicator {
  constructor(x, y, amount, isCrit = false) {
    this.x = x;
    this.y = y;
    this.amount = amount;
    this.isCrit = isCrit;
    this.life = 1.0;
    this.vx = (getSeededRandom() - 0.5) * 2;
    this.vy = -2 - getSeededRandom() * 2;
  }

  update(delta) {
    this.life -= delta / 1000;
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.1; // 重力
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.isCrit ? '#FF8000' : '#FFFFFF';
    ctx.font = this.isCrit ? 'bold 32px Arial' : '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.amount, this.x, this.y);
    ctx.restore();
  }
}

let damageIndicators = [];


class Player {
  constructor(x, y, isOther = false) {
    this.x = x;
    this.y = y;
    this.width = 40;
    this.height = 50;
    this.shield = 0;
    this.rotation = 0; 
    this.isOther = isOther;
  }

  draw() {
    ctx.save();
    if (this.isOther) {
      ctx.globalAlpha = 0.5; // 其他玩家半透明
    }

    // 引擎喷焰 (粒子)
    if (getSeededRandom() < 0.6 && !this.isOther) { // 其他玩家不生成粒子减少消耗
      createExhaustParticles(this.x, this.y + 20);
    }

    // 护盾效果：六边形能量场
    if (this.shield > 0) {
      this.rotation += 0.02;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
      ctx.lineWidth = 2;
      drawHexagon(0, 0, 45);
      ctx.restore();
    }
    
    // 战机机身
    const bodyGradient = ctx.createLinearGradient(this.x - 20, this.y, this.x + 20, this.y);
    if (this.isOther) {
      bodyGradient.addColorStop(0, '#8b0000'); // 深红
      bodyGradient.addColorStop(0.5, '#ff5252'); // 浅红
      bodyGradient.addColorStop(1, '#8b0000');
    } else {
      bodyGradient.addColorStop(0, '#1e3c72');
      bodyGradient.addColorStop(0.5, '#2a5298');
      bodyGradient.addColorStop(1, '#1e3c72');
    }
    
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - 20);
    ctx.lineTo(this.x - 15, this.y + 20);
    ctx.lineTo(this.x, this.y + 10);
    ctx.lineTo(this.x + 15, this.y + 20);
    ctx.closePath();
    ctx.fill();
    
    // 根据武器类型改变机翼颜色 (这里假设对方的武器颜色默认或者同步)
    const bulletType = playerWeapon.value.bulletType;
    let wingColor = '#6bb6ff';
    if (bulletType === 'laser') wingColor = '#9c27b0';
    if (bulletType === 'explosive') wingColor = '#ff9800';
    if (bulletType === 'burst') wingColor = '#00bcd4';
    if (playerWeapon.value.spreadLevel > 0) wingColor = '#2196f3';
    
    ctx.fillStyle = wingColor;
    ctx.fillRect(this.x - 20, this.y, 40, 8);
    
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y - 5, 6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }

  moveTo(targetX, targetY) {
    // 应用减速效果
    const speedMult = playerSlowEffect.active ? playerSlowEffect.speedMultiplier : 1;
    
    if (speedMult < 1) {
      // 减速时，移动更慢（插值）
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      this.x += dx * speedMult;
      this.y += dy * speedMult;
    } else {
      // 正常速度
      this.x = targetX;
      this.y = targetY;
    }
    
    this.x = Math.max(20, Math.min(canvas.value.width - 20, this.x));
    this.y = Math.max(30, Math.min(canvas.value.height - 30, this.y));
  }
}

class Bullet {
  constructor(x, y, bulletType = 'normal', bulletLevel = 0, spreadLevel = 0, pierceLevel = 0, angle = 0) {
    this.x = x;
    this.y = y;
    this.startX = x;
    this.startY = y;
    this.bulletType = bulletType;
    this.bulletLevel = bulletLevel;
    this.spreadLevel = spreadLevel;
    this.pierceLevel = pierceLevel;
    this.angle = angle; // 散弹角度
    this.speed = config.bulletSpeed;
    this.time = 0; // 生命周期计时
    
    // 根据弹道类型设置属性
    if (bulletType === 'laser') {
      this.width = 4;
      this.height = 80;
      this.damage = 3 + bulletLevel;
      this.hitRadius = 8;
    } else if (bulletType === 'burst') {
      this.width = 12 + bulletLevel * 2;
      this.height = this.width;
      this.damage = 2 + bulletLevel;
      this.hitRadius = this.width / 2;
      this.gravity = 0.2; // 抛物线重力
      this.vx = Math.sin(angle) * this.speed;
      this.vy = -Math.cos(angle) * this.speed;
    } else if (bulletType === 'explosive') {
      this.width = 10;
      this.height = 14;
      this.damage = 2 + bulletLevel;
      this.hitRadius = 7;
      this.swayFreq = 3; // 摇摆频率
      this.swayAmp = 10; // 摇摆振幅
    } else {
      this.width = 5;
      this.height = 15;
      this.damage = 1;
      this.hitRadius = 5;
    }
    
    this.pierce = pierceLevel > 0;
    this.pierceCount = 0;
    this.maxPierce = Math.min(3 + pierceLevel, 6); // max 6
    this.defenseIgnore = pierceLevel > 0 ? Math.min(0.3 + pierceLevel * 0.1, 0.9) : 0;
    this.active = true;
  }

  // 对象池重置方法
  reset(x, y, bulletType, bulletLevel, spreadLevel, pierceLevel, angle) {
    this.x = x;
    this.y = y;
    this.startX = x;
    this.startY = y;
    this.bulletType = bulletType;
    this.bulletLevel = Math.min(bulletLevel, 6); // max 6
    this.spreadLevel = Math.min(spreadLevel, 6); // max 6
    this.pierceLevel = Math.min(pierceLevel, 6); // max 6
    this.angle = angle;
    this.time = 0;
    this.active = true;
    
    if (bulletType === 'laser') {
      this.width = 4;
      this.height = 80;
      this.damage = 3 + this.bulletLevel;
      this.hitRadius = 8;
    } else if (bulletType === 'burst') {
      this.width = 12 + this.bulletLevel * 2;
      this.height = this.width;
      this.damage = 2 + this.bulletLevel;
      this.hitRadius = this.width / 2;
      this.gravity = 0.2;
      this.vx = Math.sin(angle) * this.speed;
      this.vy = -Math.cos(angle) * this.speed;
    } else if (bulletType === 'explosive') {
      this.width = 10;
      this.height = 14;
      this.damage = 2 + this.bulletLevel;
      this.hitRadius = 7;
      this.swayFreq = 3;
      this.swayAmp = 10;
    } else {
      this.width = 5;
      this.height = 15;
      this.damage = 1;
      this.hitRadius = 5;
    }
    
    this.pierce = this.pierceLevel > 0;
    this.pierceCount = 0;
    this.maxPierce = Math.min(3 + this.pierceLevel, 6); // max 6
    this.defenseIgnore = this.pierceLevel > 0 ? Math.min(0.3 + this.pierceLevel * 0.1, 0.9) : 0;
  }

  update(delta) {
    this.time += delta / 1000;
    
    if (this.bulletType === 'burst') {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += this.gravity;
    } else if (this.bulletType === 'explosive') {
      this.x = this.startX + Math.sin(this.angle) * this.speed * (this.time * 60) + 
               Math.sin(this.time * Math.PI * 2 * this.swayFreq) * this.swayAmp;
      this.y -= Math.cos(this.angle) * this.speed;
    } else if (this.bulletType === 'laser') {
      this.x += Math.sin(this.angle) * this.speed * 2;
      this.y -= Math.cos(this.angle) * this.speed * 2;
    } else {
      this.x += Math.sin(this.angle) * this.speed;
      this.y -= Math.cos(this.angle) * this.speed;
    }

    if (getSeededRandom() < 0.4) {
      const color = this.bulletType === 'burst' ? '#FF8000' : 
                   (this.bulletType === 'laser' ? '#00FFFF' : '#FFFFFF');
      if (particles.length < MAX_PARTICLES) {
        createParticle(this.x, this.y, color, 0.5, 'trail');
      }
    }
  }

  draw() {
    ctx.save();
    if (this.isOther) {
      ctx.globalAlpha = 0.5;
    }
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    if (this.bulletType === 'laser') {
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00FFFF';
      
      const grad = ctx.createLinearGradient(0, -this.height / 2, 0, this.height / 2);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.2, '#00FFFF');
      grad.addColorStop(1, 'rgba(0, 255, 255, 0.2)');
      
      ctx.fillStyle = grad;
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
      
      // 移除高开销的电弧绘制，改为简单的核心高光
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-this.width / 4, -this.height / 2, this.width / 2, this.height / 3);
    } else if (this.bulletType === 'burst') {
      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, this.width / 2);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.4, '#FF8000');
      grad.addColorStop(1, 'rgba(255, 128, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, this.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.bulletType === 'explosive') {
      ctx.fillStyle = '#333';
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
      if (Math.floor(this.time * 10) % 2 === 0) {
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(-2, -2, 4, 4);
      }
    } else {
      ctx.fillStyle = this.pierce ? '#ffeb3b' : '#4caf50';
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
    }
    ctx.restore();
  }

  update() {
    // 根据角度移动（散弹）
    if (this.angle !== 0) {
      this.x += Math.sin(this.angle) * this.speed * 0.3;
    }
    this.y -= this.speed;
  }
  
  // 检查是否击中目标
  checkHit(targetX, targetY, targetRadius = 20) {
    const dist = Math.sqrt((this.x - targetX) ** 2 + (this.y - targetY) ** 2);
    return dist < (this.hitRadius + targetRadius);
  }
  
  explode() {
    try {
      if (this.bulletType === 'explosive') {
        // 创建敌机数组的副本，避免在遍历时修改
        const enemiesCopy = [...enemies];
        const explosionRadius = 60 + this.bulletLevel * 10; // 爆炸半径随等级增加
        
        enemiesCopy.forEach(enemy => {
          if (enemy && enemy.x !== undefined && enemy.y !== undefined) {
            const dist = Math.sqrt((enemy.x - this.x) ** 2 + (enemy.y - this.y) ** 2);
            if (dist < explosionRadius) {
              enemy.health -= 2 + this.bulletLevel; // 范围伤害
              createExplosion(enemy.x, enemy.y, '#ff9800');
            }
          }
        });
        
        // 爆炸视觉效果
        for (let i = 0; i < 15; i++) {
          createParticle(this.x, this.y, '#ff9800');
        }
      }
    } catch (e) {
      // 静默处理错误，不影响游戏
    }
  }
  
  canPierce() {
    return this.pierce && this.pierceCount < this.maxPierce;
  }
  
  onHit() {
    if (this.pierce) {
      this.pierceCount++;
    }
  }
}

class Enemy {
  constructor(level = 1) {
    this.x = getSeededRandom() * (canvas.value.width - 40) + 20;
    this.y = -30;
    this.width = 35;
    this.height = 35;
    this.level = level;
    
    // 敌机血量：4阶段开始翻3倍，7阶段后再翻
    let healthMultiplier = 1;
    if (bossLevel >= 7) {
      healthMultiplier = 4.5;
    } else if (bossLevel >= 4) {
      healthMultiplier = 3;
    }
    
    if (props.isMultiplayer) {
      healthMultiplier *= 2; // Multiplayer double HP
    }
    
    this.maxHealth = level * 2 * healthMultiplier;
    this.health = this.maxHealth;
    
    // 防御系统：等级越高防御越高，中后期大幅提升
    // 1级: 0%, 2级: 5%, 3级: 15%, 4级: 25%, 5级+: 35%+（中后期再加10%）
    if (level === 1) {
      this.defense = 0;
    } else if (level === 2) {
      this.defense = 0.05;
    } else if (level === 3) {
      this.defense = 0.15;
    } else if (level === 4) {
      this.defense = 0.25;
    } else {
      this.defense = Math.min(0.35 + (level - 4) * 0.1, 0.75);
    }
    
    // 4阶段以后敌机防御增强3倍，7阶段后继续提升
    if (bossLevel >= 7) {
      this.defense = Math.min(this.defense * 3 + 0.1, 0.95);
    } else if (bossLevel >= 4) {
      this.defense = Math.min(this.defense * 3, 0.9);
    }
    
    // 根据等级设置敌机类型
    // 动态难度加成（指数级增长）：每 60 秒增加一定难度
    const timeMultiplier = Math.pow(1.05, Math.floor(gameTime.value / 60));
    const dynamicSpeed = config.enemySpeed * timeMultiplier;
    
    if (level === 1) {
      this.type = 'normal';
      this.speed = dynamicSpeed + getSeededRandom() * 1;
      this.horizontalSpeed = 0;
      this.pattern = 'straight';
      this.canShoot = false;
      this.shootPattern = 'single';
    } else if (level === 2) {
      this.type = 'fast';
      this.speed = dynamicSpeed * 1.3 + getSeededRandom() * 1;
      this.horizontalSpeed = 0;
      this.pattern = 'straight';
      this.canShoot = false;
      this.shootPattern = 'single';
    } else if (level === 3) {
      this.type = 'shooter';
      this.speed = dynamicSpeed * 0.8;
      this.horizontalSpeed = (getSeededRandom() - 0.5) * 1.5;
      this.pattern = 'zigzag';
      this.canShoot = true;
      this.shootPattern = 'single';
    } else if (level === 4) {
      this.type = 'heavy';
      this.speed = dynamicSpeed * 0.6;
      this.horizontalSpeed = 0;
      this.pattern = 'straight';
      this.canShoot = true;
      this.shootPattern = 'double';
    } else {
      this.type = 'elite';
      this.speed = dynamicSpeed * 0.7;
      this.horizontalSpeed = (getSeededRandom() - 0.5) * 2;
      this.pattern = getSeededRandom() < 0.5 ? 'zigzag' : 'sine';
      this.canShoot = true;
      this.shootPattern = getSeededRandom() < 0.5 ? 'triple' : 'spread';
    }
    
    this.speed = Math.max(1.5, this.speed);
    this.color = this.getColorByLevel(level);
    this.lastShootTime = 0;
    this.startY = this.y;
  }
  
  getColorByLevel(level) {
    const colors = ['#ff4757', '#ff6b81', '#ee5a6f', '#e84393', '#fd79a8', '#c44569'];
    return colors[Math.min(level - 1, colors.length - 1)];
  }

  draw() {
    // 根据类型绘制不同形状
    if (this.type === 'heavy') {
      // 重型：方形
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x - 15, this.y - 15, 30, 30);
      ctx.strokeStyle = this.color + 'cc';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.x - 15, this.y - 15, 30, 30);
    } else if (this.type === 'elite') {
      // 精英：六边形
      ctx.fillStyle = this.color;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const px = this.x + Math.cos(angle) * 15;
        const py = this.y + Math.sin(angle) * 15;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      // 普通/快速/射手：三角形
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y + 15);
      ctx.lineTo(this.x - 12, this.y - 10);
      ctx.lineTo(this.x, this.y - 5);
      ctx.lineTo(this.x + 12, this.y - 10);
      ctx.closePath();
      ctx.fill();
      
      ctx.fillStyle = this.color + 'cc';
      ctx.fillRect(this.x - 15, this.y, 30, 6);
    }
    
    if (this.level > 1) {
      const barWidth = 30;
      const barHeight = 3;
      const barX = this.x - barWidth / 2;
      const barY = this.y - 20;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      
      const healthPercent = this.health / this.maxHealth;
      ctx.fillStyle = healthPercent > 0.5 ? '#4caf50' : '#f44336';
      ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
    }
  }

  update(currentTime) {
    // 延缓效果
    const speedMultiplier = slowEffect.active ? 0.5 : 1;
    this.y += this.speed * speedMultiplier;
    
    // 高级敌机移动模式
    if (this.pattern === 'zigzag') {
      this.x += this.horizontalSpeed * speedMultiplier;
      if (this.x < 30 || this.x > canvas.value.width - 30) {
        this.horizontalSpeed *= -1;
      }
    } else if (this.pattern === 'sine') {
      const distance = this.y - this.startY;
      this.x += Math.sin(distance * 0.05) * 2 * speedMultiplier;
    }
    
    // 延缓效果下减慢射击
    const shootInterval = slowEffect.active ? 4000 : 2000;
    if (this.canShoot && currentTime - this.lastShootTime > shootInterval && this.y > 50 && this.y < canvas.value.height - 100) {
      this.shoot();
      this.lastShootTime = currentTime;
    }
  }
  
  shoot() {
    if (bossBullets.length >= MAX_BOSS_BULLETS) return;
    
    if (this.shootPattern === 'single') {
      // 单发
      bossBullets.push(new BossBullet(this.x, this.y + 15, Math.PI / 2, 5, 4));
    } else if (this.shootPattern === 'double') {
      // 双发
      bossBullets.push(new BossBullet(this.x - 10, this.y + 15, Math.PI / 2, 5, 4));
      bossBullets.push(new BossBullet(this.x + 10, this.y + 15, Math.PI / 2, 5, 4));
    } else if (this.shootPattern === 'triple') {
      // 三发
      bossBullets.push(new BossBullet(this.x - 12, this.y + 15, Math.PI / 2, 5, 4));
      bossBullets.push(new BossBullet(this.x, this.y + 15, Math.PI / 2, 5, 4));
      bossBullets.push(new BossBullet(this.x + 12, this.y + 15, Math.PI / 2, 5, 4));
    } else if (this.shootPattern === 'spread') {
      // 扇形
      for (let i = -1; i <= 1; i++) {
        const angle = Math.PI / 2 + (i * Math.PI / 12);
        bossBullets.push(new BossBullet(this.x, this.y + 15, angle, 5, 4));
      }
    }
  }
  
  checkHit(bullet) {
    return bullet.checkHit(this.x, this.y, 20);
  }
}

class Boss {
  constructor(level, attackType) {
    this.x = canvas.value.width / 2;
    this.y = 80;
    this.level = level;
    this.attackType = attackType;
    
    // 根据类型设置属性
    if (attackType === 'small-fast') {
      // Boss 6: 小而快
      this.width = 50;
      this.height = 50;
      this.moveSpeed = 4;
    } else if (attackType === 'buff') {
      // Boss 9: buff boss
      this.width = 100;
      this.height = 100;
      this.moveSpeed = 1;
    } else {
      this.width = 80;
      this.height = 80;
      this.moveSpeed = 2;
    }
    
    // 血量大幅提升，随等级递增，第4阶段开始翻5倍
    let baseHealth = attackType === 'buff' ? 1200 : 400;
    let healthGrowth = level <= 2 ? level * 120 : level === 3 ? 400 : level === 4 ? 600 : level === 5 ? 900 : 1200 + (level - 5) * 250;
    
    // 4阶段以后血量翻5倍，7阶段后再增加
    if (level >= 7) {
      baseHealth *= 7;
      healthGrowth *= 5;
    } else if (level >= 4) {
      baseHealth *= 5;
      healthGrowth *= 5;
    }
    
    if (props.isMultiplayer) {
      baseHealth *= 2;
      healthGrowth *= 2;
    }
    
    this.maxHealth = baseHealth + healthGrowth;
    this.health = this.maxHealth;
    this.healthBars = level >= 4 ? Math.ceil(this.maxHealth / 2000) : 1; // 4阶段后每2000血一条血条
    
    // 防御系统：第4阶段开始防御增强3倍
    if (level === 1) {
      this.defense = 0.15; // 1级15%
    } else if (level === 2) {
      this.defense = 0.2; // 2级20%
    } else if (level === 3) {
      this.defense = 0.25; // 3级25%
    } else if (level <= 6) {
      // 4-6级防御增强3倍：90%-95%
      const baseDefense = 0.3 + (level - 4) * 0.05;
      this.defense = Math.min(baseDefense * 3, 0.95);
    } else {
      // 7级以后防御继续增强，最高95%
      this.defense = Math.min(0.6 + (level - 7) * 0.08, 0.95);
    }
    
    this.lastAttackTime = 0;
    // 攻击间隔
    if (attackType === 'small-fast') {
      this.attackInterval = 600;
    } else if (attackType === 'shield-gen') {
      this.attackInterval = 800;
      this.lastShieldTime = 0;
      this.shieldInterval = 5000; // 每5秒生成护盾
      this.bossShield = 0; // Boss护盾
      this.maxBossShield = 10; // 最多10层护盾
    } else if (attackType === 'rain') {
      this.attackInterval = 3000; // 全屏子弹雨间隔更长
    } else {
      this.attackInterval = 800;
    }
    
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
      'shield-gen': '#00bcd4',
      'rain': '#ff5722',
      'small-fast': '#4caf50',
      'big-spread': '#e91e63',
      'laser-line': '#9c27b0',
      'buff': '#ffd700'
    };
    return colors[type] || '#ff6b00';
  }

  draw() {
    // Boss护盾效果
    if (this.attackType === 'shield-gen' && this.bossShield > 0) {
      ctx.strokeStyle = 'rgba(0, 188, 212, 0.6)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 50, 0, Math.PI * 2);
      ctx.stroke();
      
      // 显示护盾层数
      ctx.fillStyle = '#00bcd4';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`盾${this.bossShield}`, this.x, this.y + 60);
    }
    
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
    
    // 多血条显示
    const barWidth = 100;
    const barHeight = 8;
    const barX = this.x - barWidth / 2;
    const barY = this.y - 40;
    const barSpacing = 4;
    
    if (this.healthBars > 1) {
      // 多条血条显示
      const totalBarsHeight = this.healthBars * barHeight + (this.healthBars - 1) * barSpacing;
      const startY = barY - totalBarsHeight - 10;
      
      // 绘制所有血条
      for (let i = 0; i < this.healthBars; i++) {
          const currentBarY = startY + i * (barHeight + barSpacing);
          const barHealth = Math.max(0, Math.min(this.health - i * 2000, 2000));
          const barHealthPercent = barHealth / 2000;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(barX, currentBarY, barWidth, barHeight);
        
        const barColor = barHealthPercent > 0.5 ? '#4caf50' : barHealthPercent > 0.25 ? '#ff9800' : '#f44336';
        ctx.fillStyle = barColor;
        ctx.fillRect(barX, currentBarY, barWidth * barHealthPercent, barHeight);
      }
      
      // 显示血条倍数
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.fillText(`✖️${this.healthBars}`, this.x, startY - 8);
      ctx.shadowBlur = 0;
    } else {
      // 单血条显示
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      
      const healthPercent = this.health / this.maxHealth;
      ctx.fillStyle = healthPercent > 0.5 ? '#4caf50' : healthPercent > 0.25 ? '#ff9800' : '#f44336';
      ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
    }
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`BOSS LV.${this.level}`, this.x, this.y - 50);
  }

  update(currentTime) {
    // 护盾生成Boss：每5秒生成护盾
    if (this.attackType === 'shield-gen' && currentTime - this.lastShieldTime > this.shieldInterval) {
      if (this.bossShield < this.maxBossShield) {
        this.bossShield = this.maxBossShield; // 刷新护盾
        this.lastShieldTime = currentTime;
      }
    }
    
    // 根据类型调整移动速度
    const timeMultiplier = Math.pow(1.05, Math.floor(gameTime.value / 60)); // 动态难度加成
    const baseSpeed = this.attackType === 'small-fast' ? this.moveSpeed : 
                  this.attackType === 'buff' ? this.moveSpeed : 2;
    const speed = baseSpeed * timeMultiplier;
    
    this.x += this.moveDirection * speed;
    if (this.x < 50 || this.x > canvas.value.width - 50) {
      this.moveDirection *= -1;
    }
    
    // 高级Boss斜向移动（在上方30%范围内）
    if (this.level >= 3) {
      const maxY = canvas.value.height * 0.3;
      const minY = 60;
      this.y += Math.sin(currentTime * 0.001) * 0.5;
      this.y = Math.max(minY, Math.min(maxY, this.y));
    }
    
    if (currentTime - this.lastAttackTime > this.attackInterval) {
      this.attack();
      this.lastAttackTime = currentTime;
    }
  }

  attack() {
    if (sounds.bossSkill) sounds.bossSkill();
    
    if (this.attackType === 'spiral') {
      // Boss 1: 螺旋 - 增加到12发
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + Date.now() * 0.005;
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage));
      }
    } else if (this.attackType === 'spread') {
      // Boss 2: 扇形 - 增加到9发
      for (let i = -4; i <= 4; i++) {
        const angle = Math.PI / 2 + (i * Math.PI / 10);
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage));
      }
    } else if (this.attackType === 'circle') {
      // Boss 3: 圆形 - 增加到16发
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage));
      }
    } else if (this.attackType === 'shield-gen') {
      // Boss 4: 护盾生成 - 普通扇形攻击
      for (let i = -3; i <= 3; i++) {
        const angle = Math.PI / 2 + (i * Math.PI / 12);
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage, 5));
      }
    } else if (this.attackType === 'rain') {
      // Boss 5: 全屏子弹雨 - 减少一半覆盖面积
      const bulletCount = 10 + this.level; // 子弹数量减半
      const centerX = canvas.value.width / 2;
      const spreadWidth = canvas.value.width / 2; // 覆盖屏幕一半宽度
      for (let i = 0; i < bulletCount; i++) {
        const randomX = centerX + (getSeededRandom() - 0.5) * spreadWidth;
        const randomAngle = Math.PI / 2 + (getSeededRandom() - 0.5) * Math.PI / 6; // 大致向下，略有偏移
        bossBullets.push(new BossBullet(randomX, -20, randomAngle, this.damage, 6));
      }
    } else if (this.attackType === 'small-fast') {
      // Boss 6: 小而快，快速连射
      for (let i = 0; i < 5; i++) {
        const angle = Math.PI / 2 + (i - 2) * Math.PI / 12;
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage, 7));
      }
    } else if (this.attackType === 'big-spread') {
      // Boss 7: 超大弹幕 - 增加到13发
      for (let i = -6; i <= 6; i++) {
        const angle = Math.PI / 2 + (i * Math.PI / 8);
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage));
      }
    } else if (this.attackType === 'laser-line') {
      // Boss 8: 激光线 - 增加到5条
      for (let i = -2; i <= 2; i++) {
        bossBullets.push(new BossBullet(this.x + i * 25, this.y + 20, Math.PI / 2, this.damage, 12, true));
      }
    } else if (this.attackType === 'buff') {
      // Boss 9: buff boss，双重攻击
      for (let i = -3; i <= 3; i++) {
        const angle = Math.PI / 2 + (i * Math.PI / 14);
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage));
      }
      // 额外圆形弹幕
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage, 3));
      }
    }
  }
}

class BossBullet {
  constructor(x, y, angle, damage, speed = 4, isLaser = false) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = speed;
    this.damage = damage;
    this.radius = 6;
    this.isLaser = isLaser;
  }

  draw() {
    if (this.isLaser) {
      // 激光线
      ctx.strokeStyle = '#9c27b0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x, this.y + 30);
      ctx.stroke();
      
      ctx.strokeStyle = '#e1bee7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x, this.y + 30);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ff0066';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = '#ff66a3';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  update() {
    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed;
  }
}

class PowerUp {
  constructor(type) {
    this.x = getSeededRandom() * (canvas.value.width - 40) + 20;
    this.y = -30;
    this.type = type;
    this.speed = 2;
    this.size = 25;
    this.config = POWERUP_TYPES[type];
  }

  draw() {
    ctx.fillStyle = this.config.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.config.symbol, this.x, this.y);
  }

  update() {
    this.y += this.speed;
  }
  
  checkCollision(player) {
    const dist = Math.sqrt((player.x - this.x) ** 2 + (player.y - this.y) ** 2);
    return dist < this.size + 20;
  }
}

function getEnemyLevel() {
  // 根据Boss等级决定敌机等级分布
  const level = bossLevel;
  const rand = getSeededRandom();
  
  if (level === 1) return 1;
  if (level === 2) return rand < 0.9 ? 1 : 2;
  if (level === 3) return rand < 0.8 ? 1 : rand < 0.9 ? 2 : 3;
  if (level === 4) return rand < 0.7 ? 1 : rand < 0.85 ? 2 : rand < 0.95 ? 3 : 4;
  
  // 5级以后
  if (rand < 0.3) return 1;
  if (rand < 0.5) return 2;
  if (rand < 0.7) return 3;
  if (rand < 0.85) return 4;
  return 5;
}

class SlowZone {
  constructor() {
    this.x = getSeededRandom() * (canvas.value.width - 100) + 50;
    this.y = -50;
    this.radius = 40;
    this.speed = 1.5;
    this.rotation = 0;
  }

  draw() {
    this.rotation += 0.05;
    
    // 外圈旋转效果 - 蓝色减速区域
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(33, 150, 243, ${0.3 - i * 0.1})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + i * 10, this.rotation + i, this.rotation + Math.PI + i);
      ctx.stroke();
    }
    
    // 减速区域中心
    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
    gradient.addColorStop(0, '#1976d2');
    gradient.addColorStop(0.5, '#2196f3');
    gradient.addColorStop(1, 'rgba(33, 150, 243, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // 减速符号
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('慢', this.x, this.y + 6);
  }

  update() {
    this.y += this.speed;
  }
  
  checkCollision(player) {
    const dist = Math.sqrt((player.x - this.x) ** 2 + (player.y - this.y) ** 2);
    return dist < this.radius;
  }
  
  applySlowEffect(player) {
    // 触发减速效果：4秒内飞机移动速度大幅降低
    playerSlowEffect.active = true;
    playerSlowEffect.endTime = performance.now() + 4000;
    playerSlowEffect.speedMultiplier = 0.08; // 改为0.08，速度降低到8%，几乎停滞
    
    // 减速特效
    for (let i = 0; i < 15; i++) {
      createParticle(player.x, player.y, '#2196f3');
    }
  }
}

function syncHealth() {
  if (props.isMultiplayer) {
    const socket = getSocket();
    if (socket) {
      socket.emit('game_action', {
        roomId: props.roomData.roomId,
        action: {
          type: 'health_sync',
          health: health.value,
          teammateHealth: teammateHealth.value
        }
      });
    }
  }
}

function takeDamage(amount) {
  if (health.value > 0) {
    if (health.value >= amount) {
      health.value -= amount;
    } else {
      const remaining = amount - health.value;
      health.value = 0;
      if (props.isMultiplayer) {
        teammateHealth.value = Math.max(0, teammateHealth.value - remaining);
      }
    }
  } else if (props.isMultiplayer) {
    teammateHealth.value = Math.max(0, teammateHealth.value - amount);
  } else {
    health.value = Math.max(0, health.value - amount);
  }
  
  triggerDamageFlash();
  triggerShake(12, 150);
  
  syncHealth();
  
  if (health.value <= 0 && (!props.isMultiplayer || teammateHealth.value <= 0)) {
    endGame();
    return true; // Indicates game over
  }
  return false;
}

function healPlayer(amount) {
  const oldHealth = health.value;
  if (health.value < 100) {
    if (health.value + amount <= 100) {
      health.value += amount;
    } else {
      const remaining = amount - (100 - health.value);
      health.value = 100;
      if (props.isMultiplayer) {
        teammateHealth.value = Math.min(100, teammateHealth.value + remaining);
      }
    }
  } else if (props.isMultiplayer) {
    teammateHealth.value = Math.min(100, teammateHealth.value + amount);
  }
  
  if (health.value > oldHealth || (props.isMultiplayer && teammateHealth.value < 100)) {
    triggerHealFlash();
  }
  
  syncHealth();
}

function applyPowerUp(type) {
  if (type === 'HEALTH') {
    healPlayer(30);
  } else if (type === 'BOOST') {
    // 强攻：增加伤害叠加，最多3层，持续10秒
    playerWeapon.value.damageBoost = Math.min(3, playerWeapon.value.damageBoost + 1);
    playerWeapon.value.damageBoostEndTime = performance.now() + 10000;
  } else if (type === 'PLANE') {
    // 战机强化：所有等级+1
    playerWeapon.value.bulletLevel = Math.min(playerWeapon.value.maxWeaponLevel, playerWeapon.value.bulletLevel + 1);
    playerWeapon.value.spreadLevel = Math.min(5, playerWeapon.value.spreadLevel + 1);
    playerWeapon.value.pierceLevel = Math.min(5, playerWeapon.value.pierceLevel + 1);
  } else if (type === 'SPREAD') {
    playerWeapon.value.spreadLevel = Math.min(playerWeapon.value.maxWeaponLevel, playerWeapon.value.spreadLevel + 1);
  } else if (type === 'PIERCE') {
    playerWeapon.value.pierceLevel = Math.min(playerWeapon.value.maxWeaponLevel, playerWeapon.value.pierceLevel + 1);
  } else if (type === 'EXPLOSIVE' || type === 'LASER' || type === 'BURST') {
    const bulletType = type.toLowerCase();
    // 切换弹药逻辑：如果类型不同，当前等级-1，如果是同类型则升级
    if (playerWeapon.value.bulletType !== bulletType) {
      playerWeapon.value.bulletType = bulletType;
      playerWeapon.value.bulletLevel = Math.max(1, playerWeapon.value.bulletLevel - 1);
    } else {
      playerWeapon.value.bulletLevel = Math.min(playerWeapon.value.maxWeaponLevel, playerWeapon.value.bulletLevel + 1);
    }
  } else if (type === 'RAPID') {
    playerWeapon.value.fireRate = Math.min(playerWeapon.value.maxFireRate, playerWeapon.value.fireRate + 1);
  } else if (type === 'SHIELD') {
    if (player) player.shield = Math.min(5, player.shield + 3);
  } else if (type === 'LIGHTNING') {
    // 闪电：清除全图敌机
    enemies.forEach(enemy => {
      const enemyScore = Math.floor((10 + enemy.level * 10) * getScoreMultiplier());
      score.value += enemyScore;
      createExplosion(enemy.x, enemy.y, '#ffeb3b');
    });
    enemies = [];
  } else if (type === 'SLOW') {
    slowEffect.active = true;
    slowEffect.endTime = performance.now() + 5000;
  } else if (type === 'BARRIER') {
    barrier.active = true;
    barrier.health = barrier.maxHealth;
  }
}

let particlePool = [];

class Particle {
  constructor(x, y, color, size = 1, type = 'normal') {
    this.init(x, y, color, size, type);
  }
  
  init(x, y, color, size = 1, type = 'normal') {
    this.x = x;
    this.y = y;
    this.color = color;
    this.size = size;
    this.type = type;
    this.life = 1;
    this.active = true;
    
    if (type === 'trail') {
      this.vx = (getSeededRandom() - 0.5);
      this.vy = (getSeededRandom() - 0.5);
      this.decay = 0.05;
    } else if (type === 'exhaust') {
      this.vx = (getSeededRandom() - 0.5) * 2;
      this.vy = getSeededRandom() * 3 + 2;
      this.decay = 0.04;
    } else {
      const angle = getSeededRandom() * Math.PI * 2;
      const speed = getSeededRandom() * 4 * size;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.decay = 0.02 + getSeededRandom() * 0.03;
    }
  }

  draw() {
    if (!this.active) return;
    ctx.fillStyle = this.color;
    ctx.globalAlpha = this.life;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3 * this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  update() {
    if (!this.active) return;
    this.x += this.vx;
    this.y += this.vy;
    this.life -= this.decay;
    if (this.life <= 0) this.active = false;
  }
}

function createParticle(x, y, color, size = 1, type = 'normal') {
  if (window.effectLevel === 0 && type === 'trail') return; // 低画质关闭尾迹
  let p;
  if (particlePool.length > 0) {
    p = particlePool.pop();
    p.init(x, y, color, size, type);
  } else {
    p = new Particle(x, y, color, size, type);
  }
  particles.push(p);
}

function freeParticle(p) {
  p.active = false;
  if (particlePool.length < 500) {
    particlePool.push(p);
  }
}



let touchX = 0;
let touchY = 0;
let isTouching = false;

// 暂停功能
let isPaused = false;
let pausedAt = 0; // 记录暂停时的时间

function togglePause() {
  if (!isPaused) {
    // 暂停游戏
    isPaused = true;
    pausedAt = performance.now();
  } else {
    // 继续游戏，调整相关时间补偿暂停流逝的时间
    const pauseDuration = performance.now() - pausedAt;
    startTime += pauseDuration;
    
    // 关键修复：补偿 Boss 相关的时间计时器
    if (lastBossDefeatedTime > 0) {
      lastBossDefeatedTime += pauseDuration;
    }
    
    // 补偿警告特效计时器
    if (bossWarningEffect.active) bossWarningEffect.startTime += pauseDuration;
    if (newEnemyWarning.active) newEnemyWarning.startTime += pauseDuration;
    if (gameStartEffect.active) gameStartEffect.startTime += pauseDuration;
    
    isPaused = false;
  }
}

function goBackToHub() {
  const confirmed = window.confirm('确定要返回主菜单吗？当前游戏进度将不会被保存。');
  if (confirmed) {
    gameRunning = false;
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    emit('backToHub');
  }
}

function restartGame() {
  // 重置所有游戏状态
  score.value = 0;
  health.value = 100;
  teammateHealth.value = 100;
  gameTime.value = 0;
  bossLevel = 1;
  currentBoss = null;
  lastBossDefeatedTime = 0;
  nextBossTime = 30000;
  gameCompleted = false;
  notifiedEnemyTypes.clear();
  victoryEffect.active = false;
  gameOfficiallyStarted = false;
  
  // 重置开始时间
  startTime = performance.now();
  
  // 清空所有数组
  bullets = [];
  enemies = [];
  particles = [];
  bossBullets = [];
  powerUps = [];
  slowZones = [];
  
  // 重置防护罩和效果
  barrier.active = false;
  barrier.health = 0;
  slowEffect.active = false;
  playerSlowEffect.active = false;
  
  // 重置玩家位置
  if (player) {
    player.x = canvas.value.width / 2;
    player.y = canvas.value.height - 100;
    player.shield = 0;
  }
  
  // 重置武器
  playerWeapon.value = {
    spreadLevel: 0,
    pierceLevel: 0,
    fireRate: 1,
    bulletType: 'normal',
    bulletLevel: 0,
    maxWeaponLevel: 10,
    maxFireRate: 5
  };
  
  // 触发开始特效
  gameStartEffect.active = true;
  gameStartEffect.startTime = performance.now();
  gameStartEffect.phase = 1;
  
  isPaused = false;
}

function handleCanvasClick(e) {
  if (!isPaused || !canvas.value) return;
  
  const rect = canvas.value.getBoundingClientRect();
  const scaleX = canvas.value.width / rect.width;
  const scaleY = canvas.value.height / rect.height;
  
  const clickX = (e.clientX - rect.left) * scaleX;
  const clickY = (e.clientY - rect.top) * scaleY;
  
  checkPauseButtonClick(clickX, clickY);
}

function handlePauseTouch(e) {
  if (!isPaused || !canvas.value) return;
  e.preventDefault();
  
  const rect = canvas.value.getBoundingClientRect();
  const scaleX = canvas.value.width / rect.width;
  const scaleY = canvas.value.height / rect.height;
  
  const touch = e.changedTouches[0];
  const clickX = (touch.clientX - rect.left) * scaleX;
  const clickY = (touch.clientY - rect.top) * scaleY;
  
  checkPauseButtonClick(clickX, clickY);
}

function checkPauseButtonClick(clickX, clickY) {
  const btnWidth = 180;
  const btnHeight = 50;
  const btnX = canvas.value.width / 2 - btnWidth / 2;
  
  const btn1Y = canvas.value.height / 2 - 20;
  const btn2Y = canvas.value.height / 2 + 50;
  const btn3Y = canvas.value.height / 2 + 120;
  
  // 检查继续游戏按钮点击
  if (clickX >= btnX && clickX <= btnX + btnWidth && clickY >= btn1Y && clickY <= btn1Y + btnHeight) {
    togglePause();
    return;
  }
  
  // 检查重新开始按钮点击
  if (clickX >= btnX && clickX <= btnX + btnWidth && clickY >= btn2Y && clickY <= btn2Y + btnHeight) {
    restartGame();
    return;
  }

  // 检查返回菜单按钮点击
  if (clickX >= btnX && clickX <= btnX + btnWidth && clickY >= btn3Y && clickY <= btn3Y + btnHeight) {
    goBackToHub();
  }
}

// 掉血特效
let damageFlash = { active: false, opacity: 0 };

// 回血特效
let healFlash = { active: false, opacity: 0 };

function triggerHealFlash() {
  healFlash.active = true;
  healFlash.opacity = 0.5;
}

function triggerDamageFlash() {
  damageFlash.active = true;
  damageFlash.opacity = 0.5;
  
  // 屏幕震动效果（如果支持）
  if (navigator.vibrate) {
    navigator.vibrate(100);
  }
  
  // 播放受伤音效
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = 150;
    oscillator.type = 'sawtooth';
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch (e) {}
}

function handleTouchStart(e) {
  if (!canvas.value || !gameRunning) return;
  try {
    e.preventDefault();
    isTouching = true;
    const touch = e.touches[0];
    const rect = canvas.value.getBoundingClientRect();
    touchX = touch.clientX - rect.left;
    touchY = touch.clientY - rect.top;
  } catch (err) {
    // 静默处理错误
  }
}

function handleTouchMove(e) {
  if (!canvas.value || !gameRunning) return;
  try {
    e.preventDefault();
    if (!isTouching) return;
    const touch = e.touches[0];
    const rect = canvas.value.getBoundingClientRect();
    touchX = touch.clientX - rect.left;
    touchY = touch.clientY - rect.top;
  } catch (err) {
    // 静默处理错误
  }
}

function handleTouchEnd(e) {
  if (!canvas.value) return;
  try {
    e.preventDefault();
    isTouching = false;
  } catch (err) {
    // 静默处理错误
  }
}

function handleMouseDown(e) {
  if (!canvas.value || !gameRunning) return;
  try {
    isTouching = true;
    const rect = canvas.value.getBoundingClientRect();
    touchX = e.clientX - rect.left;
    touchY = e.clientY - rect.top;
  } catch (err) {
    // 静默处理错误
  }
}

function handleMouseMove(e) {
  if (!canvas.value || !gameRunning) return;
  try {
    if (!isTouching) return;
    const rect = canvas.value.getBoundingClientRect();
    touchX = e.clientX - rect.left;
    touchY = e.clientY - rect.top;
  } catch (err) {
    // 静默处理错误
  }
}

function handleMouseUp() {
  if (!canvas.value) return;
  try {
    isTouching = false;
  } catch (err) {
    // 静默处理错误
  }
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
  // 限制同时存在的粒子数量，如果已经很多就不再生成，防止崩溃
  if (particles.length > MAX_PARTICLES - 15) return;
  
  for (let i = 0; i < 15; i++) {
    createParticle(x, y, color);
  }
}

// 渲染游戏特效
function renderGameEffects(currentTime) {
  // 游戏开始特效
  if (gameStartEffect.active) {
    const elapsed = currentTime - gameStartEffect.startTime;
    
    if (gameStartEffect.phase === 1) {
      // 飞船从上方飞入
      const progress = Math.min(elapsed / 1000, 1);
      gameStartEffect.shipY = -100 + (canvas.value.height - 100) * progress;
      
      // 绘制飞船
      ctx.save();
      ctx.translate(canvas.value.width / 2, gameStartEffect.shipY);
      
      // 飞船主体
      ctx.fillStyle = '#4a9eff';
      ctx.beginPath();
      ctx.moveTo(0, -25);
      ctx.lineTo(-20, 25);
      ctx.lineTo(0, 15);
      ctx.lineTo(20, 25);
      ctx.closePath();
      ctx.fill();
      
      // 引擎尾焰
      const flameLength = 30 + Math.sin(elapsed * 0.02) * 10;
      ctx.fillStyle = '#ff6b00';
      ctx.beginPath();
      ctx.moveTo(-10, 25);
      ctx.lineTo(0, 25 + flameLength);
      ctx.lineTo(10, 25);
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
      
      if (progress >= 1) {
        gameStartEffect.phase = 2;
        gameStartEffect.startTime = currentTime;
      }
    } else if (gameStartEffect.phase === 2) {
      // 显示"战斗开始了"文字
      const progress = Math.min(elapsed / 800, 1);
      gameStartEffect.textAlpha = Math.sin(progress * Math.PI);
      gameStartEffect.textScale = 1 + Math.sin(progress * Math.PI) * 0.3;
      
      ctx.save();
      ctx.translate(canvas.value.width / 2, canvas.value.height / 2);
      ctx.scale(gameStartEffect.textScale, gameStartEffect.textScale);
      ctx.globalAlpha = gameStartEffect.textAlpha;
      
      // 发光效果
      ctx.shadowColor = '#ff6b00';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('战斗开始了！', 0, 0);
      
      ctx.restore();
      
      if (elapsed > 1500) {
        gameStartEffect.phase = 3;
        gameStartEffect.startTime = currentTime;
      }
    } else if (gameStartEffect.phase === 3) {
      // "开干吧！"文字
      const progress = Math.min(elapsed / 1000, 1);
      gameStartEffect.textAlpha = Math.sin(progress * Math.PI);
      gameStartEffect.textScale = 1.2 + Math.sin(progress * Math.PI) * 0.2;
      
      ctx.save();
      ctx.translate(canvas.value.width / 2, canvas.value.height / 2 + 50);
      ctx.scale(gameStartEffect.textScale, gameStartEffect.textScale);
      ctx.globalAlpha = gameStartEffect.textAlpha;
      
      ctx.shadowColor = '#ff0066';
      ctx.shadowBlur = 25;
      ctx.fillStyle = '#ffeb3b';
      ctx.font = 'bold 56px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('开干吧！', 0, 0);
      
      ctx.restore();
      
      if (elapsed > 2000) {
        gameStartEffect.active = false;
        player.y = canvas.value.height - 100;
        gameOfficiallyStarted = true; // 特效结束，游戏正式开始
      }
    }
  }
  
  // Boss 警告特效
  if (bossWarningEffect.active) {
    const elapsed = currentTime - bossWarningEffect.startTime;
    const progress = Math.min(elapsed / 2000, 1);
    
    // 屏幕震动
    const shake = Math.sin(elapsed * 0.05) * 5 * (1 - progress);
    ctx.save();
    ctx.translate(shake, shake);
    
    // 红色警告背景
    ctx.fillStyle = `rgba(255, 0, 0, ${0.3 * (1 - progress)})`;
    ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);
    
    // 警告文字
    ctx.globalAlpha = 1 - progress;
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ff0000';
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('⚠️ 警告：BOSS 来袭 ⚠️', canvas.value.width / 2, canvas.value.height / 2 - 50);
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px Arial';
    ctx.fillText(`LV.${bossLevel - 1} BOSS 即将出现！`, canvas.value.width / 2, canvas.value.height / 2 + 20);
    
    ctx.restore();
    
    if (elapsed > 2000) {
      bossWarningEffect.active = false;
    }
  }
  
  // 新敌机警告
  if (newEnemyWarning.active) {
    const elapsed = currentTime - newEnemyWarning.startTime;
    const progress = Math.min(elapsed / 1500, 1);
    
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.shadowColor = '#ff9800';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ff9800';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`⚠️ 新敌机物种侵入！`, canvas.value.width / 2, 100);
    ctx.restore();
    
    if (elapsed > 1500) {
      newEnemyWarning.active = false;
    }
  }
  
  // 通关特效
  if (victoryEffect.active) {
    const elapsed = currentTime - victoryEffect.startTime;
    
    // 生成烟花粒子
    if (elapsed % 200 < 50) {
      for (let i = 0; i < 10; i++) {
        victoryEffect.particles.push({
          x: getSeededRandom() * canvas.value.width,
          y: getSeededRandom() * canvas.value.height * 0.5,
          vx: (getSeededRandom() - 0.5) * 10,
          vy: (getSeededRandom() - 0.5) * 10,
          life: 1,
          color: `hsl(${getSeededRandom() * 360}, 100%, 50%)`
        });
      }
    }
    
    // 更新和绘制粒子
    victoryEffect.particles = victoryEffect.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2;
      p.life -= 0.02;
      
      if (p.life > 0) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
        return true;
      }
      return false;
    });
    
    ctx.globalAlpha = 1;
    
    // 胜利文字
    const pulse = Math.sin(elapsed * 0.005) * 0.2 + 1;
    ctx.save();
    ctx.translate(canvas.value.width / 2, canvas.value.height / 2 - 50);
    ctx.scale(pulse, pulse);
    
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎉 通关成功！🎉', 0, 0);
    
    ctx.restore();
    
    // 玩家名字
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${props.playerName || '玩家'} 太厉害了！`, canvas.value.width / 2, canvas.value.height / 2 + 50);
    
    ctx.restore();
  }
}

let lastShootTime = 0;
let lastMoveSyncTime = 0;
function autoShoot(currentTime) {
  if (!player) return;
  
  const baseInterval = config.initialFireRate;
  const fireRateBonus = (playerWeapon.value.fireRate - 1) * 30;
  const shootInterval = Math.max(50, baseInterval - fireRateBonus);
  
  if (currentTime - lastShootTime > shootInterval) {
    const bulletType = playerWeapon.value.bulletType;
    const bulletLevel = playerWeapon.value.bulletLevel;
    const spreadLevel = playerWeapon.value.spreadLevel;
    const pierceLevel = playerWeapon.value.pierceLevel;
    
    if (bullets.length >= MAX_BULLETS) return;
    
    if (spreadLevel > 0) {
      // 散弹优化：2级显示2条(夹角15°)，3级显示3条(夹角10°)
      const spreadCount = spreadLevel + 1;
      const angleBetween = spreadCount === 2 ? 15 : 10;
      const totalAngle = (spreadCount - 1) * angleBetween * (Math.PI / 180);
      
      for (let i = 0; i < spreadCount; i++) {
        const angle = spreadCount === 1 ? 0 : (-totalAngle / 2 + (totalAngle / (spreadCount - 1)) * i);
        createBullet(player.x, player.y - 20, bulletType, bulletLevel, spreadLevel, pierceLevel, angle);
      }
    } else {
      createBullet(player.x, player.y - 20, bulletType, bulletLevel, spreadLevel, pierceLevel, 0);
    }
    
    // 根据武器类型播放不同音效
    if (sounds.shoot) sounds.shoot(bulletType);
    lastShootTime = currentTime;
    
    // Multiplayer sync shoot
    if (props.isMultiplayer) {
      const socket = getSocket();
      if (socket) {
        socket.emit('game_action', {
          roomId: props.roomData.roomId,
          action: { type: 'shoot', bulletType, bulletLevel, spreadLevel, pierceLevel }
        });
      }
    }
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

function getWeaponSymbol() {
  const type = playerWeapon.value.bulletType;
  if (type === 'burst') return '🔥';
  if (type === 'explosive') return '💣';
  if (type === 'laser') return '⚡';
  return '🔫';
}

function getWeaponName() {
  const type = playerWeapon.value.bulletType;
  if (type === 'burst') return '爆裂弹';
  if (type === 'explosive') return '爆炸弹';
  if (type === 'laser') return '激光束';
  return '标准弹';
}

function getWeaponDisplay() {
  try {
    const w = playerWeapon.value;
    const parts = [];
    
    // 弹道类型 - 简称
    if (w.bulletType === 'laser' && w.bulletLevel > 0) {
      parts.push(`光${w.bulletLevel}`);
    } else if (w.bulletType === 'burst' && w.bulletLevel > 0) {
      parts.push(`裂${w.bulletLevel}`);
    } else if (w.bulletType === 'explosive' && w.bulletLevel > 0) {
      parts.push(`爆${w.bulletLevel}`);
    }
    
    // 属性类型 - 简称
    if (w.spreadLevel > 0) parts.push(`散${w.spreadLevel}`);
    if (w.pierceLevel > 0) parts.push(`穿${w.pierceLevel}`);
    
    if (parts.length === 0) {
      return '普通';
    }
    
    return parts.join(' ');
  } catch (e) {
    return '普通';
  }
}

function getFireRateDisplay() {
  try {
    const rate = playerWeapon.value?.fireRate || 1;
    return `速${rate}`;
  } catch (e) {
    return '速1';
  }
}

function getPlaneLevel() {
  try {
    return getTotalLevel();
  } catch (e) {
    return 1;
  }
}

function renderPauseScreen() {
  // 半透明黑色遮罩
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);
  
  // 暂停标题
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('游戏暂停', canvas.value.width / 2, canvas.value.height / 2 - 120);
  
  // 分隔线
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(canvas.value.width / 2 - 100, canvas.value.height / 2 - 70);
  ctx.lineTo(canvas.value.width / 2 + 100, canvas.value.height / 2 - 70);
  ctx.stroke();
  
  const btnWidth = 180;
  const btnHeight = 50;
  const btnX = canvas.value.width / 2 - btnWidth / 2;
  
  // 按钮配置
  const buttons = [
    { text: '继续游戏', color: '#4caf50', y: canvas.value.height / 2 - 20 },
    { text: '重新开始', color: '#ff9800', y: canvas.value.height / 2 + 50 },
    { text: '返回菜单', color: '#f44336', y: canvas.value.height / 2 + 120 }
  ];

  buttons.forEach(btn => {
    // 按钮阴影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    
    ctx.fillStyle = btn.color;
    ctx.fillRect(btnX, btn.y, btnWidth, btnHeight);
    
    // 重置阴影
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(btn.text, canvas.value.width / 2, btn.y + btnHeight / 2);
  });
}

let lastLowHealthSoundTime = 0;

function gameLoop(currentTime) {
  if (!gameRunning && !victoryEffect.active) return;
  
  // 如果暂停，显示暂停界面但停止游戏逻辑
  if (isPaused) {
    // 渲染暂停界面
    renderPauseScreen();
    animationId = requestAnimationFrame(gameLoop);
    return;
  }
  
  // 立即检查血量，优先级最高
  if (health.value <= 0 && (!props.isMultiplayer || teammateHealth.value <= 0)) {
    if (gameRunning) {
      endGame();
    }
    return;
  }
  
  // 低血量警告音效
  if (health.value > 0 && health.value <= 20) {
    if (currentTime - lastLowHealthSoundTime > 1000) {
      if (sounds.lowHealth) sounds.lowHealth();
      lastLowHealthSoundTime = currentTime;
    }
  } else if (props.isMultiplayer && teammateHealth.value > 0 && teammateHealth.value <= 20) {
    if (currentTime - lastLowHealthSoundTime > 1000) {
      if (sounds.lowHealth) sounds.lowHealth();
      lastLowHealthSoundTime = currentTime;
    }
  }

  const delta = currentTime - lastTime;
  lastTime = currentTime;
  gameTime.value = Math.floor((currentTime - startTime) / 1000);
  
  // 不设置时间限制，只有打完 12 个 Boss 才算通关

  // 地图滚动（星空背景）
  mapOffset += mapSpeed;
  if (mapOffset > canvas.value.height) mapOffset = 0;

  ctx.fillStyle = '#0a0e27';
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  for (let i = 0; i < 50; i++) {
    const x = (i * 37) % canvas.value.width;
    const y = ((mapOffset + i * 50) % canvas.value.height);
    ctx.fillRect(x, y, 1, 1);
  }
  renderGameEffects(currentTime);

  // 掉血红色闪光特效
  if (damageFlash.active) {
    ctx.fillStyle = `rgba(255, 0, 0, ${damageFlash.opacity})`;
    ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);
    damageFlash.opacity -= 0.02;
    if (damageFlash.opacity <= 0) {
      damageFlash.active = false;
    }
  }
  
  // 回血绿色闪光特效
  if (healFlash.active) {
    ctx.fillStyle = `rgba(0, 255, 100, ${healFlash.opacity})`;
    ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);
    healFlash.opacity -= 0.02;
    if (healFlash.opacity <= 0) {
      healFlash.active = false;
    }
  }

  // 屏幕震动应用
  if (screenShake.active) {
    if (currentTime > screenShake.endTime) {
      screenShake.active = false;
    } else {
      const shakeX = (getSeededRandom() - 0.5) * screenShake.intensity;
      const shakeY = (getSeededRandom() - 0.5) * screenShake.intensity;
      ctx.save();
      ctx.translate(shakeX, shakeY);
    }
  }

  // 更新并绘制伤害数字
  damageIndicators = damageIndicators.filter(di => {
    di.update(delta);
    di.draw(ctx);
    return di.life > 0;
  });

  // 检查强攻 Buff 到期
  if (playerWeapon.value.damageBoost > 0 && currentTime > playerWeapon.value.damageBoostEndTime) {
    playerWeapon.value.damageBoost = 0;
  }

  // 游戏开始特效期间不允许控制
  if (isTouching && player && !gameStartEffect.active) {
    player.moveTo(touchX, touchY);
    
    // Multiplayer sync move
    if (props.isMultiplayer && (currentTime - lastMoveSyncTime) > 16) { // Throttle sync
      const socket = getSocket();
      if (socket) {
        socket.emit('game_action', {
          roomId: props.roomData.roomId,
          action: { type: 'move', x: player.x, y: player.y, playerId: socket.id }
        });
        lastMoveSyncTime = currentTime;
      }
    }
  }

  if (player2) {
    player2.draw();
  }
  
  // 绘制防护墙（墙道具：飞机后方固定偏移）
  if (barrier.active && barrier.health > 0 && player) {
    const wallY = player.y + 45; // 飞机后方固定偏移
    const wallWidth = 80;
    const wallHeight = 15;
    
    ctx.save();
    ctx.translate(player.x, wallY);
    
    // 墙体发光效果
    ctx.shadowColor = '#795548';
    ctx.shadowBlur = 10;
    
    // 根据生命值改变颜色透明度
    const healthPercent = barrier.health / barrier.maxHealth;
    ctx.fillStyle = `rgba(121, 85, 72, ${0.4 + healthPercent * 0.6})`;
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 2;
    
    // 绘制圆角矩形墙体 (使用兼容性更好的普通矩形或手动绘制圆角)
    ctx.beginPath();
    ctx.rect(-wallWidth/2, -wallHeight/2, wallWidth, wallHeight);
    ctx.fill();
    ctx.stroke();
    
    // 能量节点效果
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = `rgba(255, 152, 0, ${0.5 + Math.sin(currentTime * 0.01 + i) * 0.5})`;
      ctx.beginPath();
      ctx.arc(i * 20, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // 显示生命值
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${barrier.health}/${barrier.maxHealth}`, 0, 0);
    
    ctx.restore();
  }
  
  // 游戏开始特效期间不绘制玩家
  if (player && !gameStartEffect.active) {
    player.draw();
    autoShoot(currentTime);
  }
  
  // 更新环境效果
  if (slowEffect.active && currentTime > slowEffect.endTime) {
    slowEffect.active = false;
  }

  // 性能优化：限制子弹数量并使用对象池
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.update(delta);
    bullet.draw();
    if (bullet.y <= -20 || !bullet.active) {
      freeBullet(bullet);
      bullets.splice(i, 1);
    }
  }

  // 其他玩家子弹
  for (let i = otherPlayerBullets.length - 1; i >= 0; i--) {
    const bullet = otherPlayerBullets[i];
    bullet.update(delta);
    bullet.draw();
    if (bullet.y <= -20 || !bullet.active) {
      otherPlayerBullets.splice(i, 1);
    }
  }

  // 生成道具（按权重随机，仅在游戏正式开始后）
  const dropMultiplier = props.isMultiplayer ? 2 : 1;
  if (gameOfficiallyStarted && getSeededRandom() < config.powerUpRate * (1 + bossLevel * 0.1) * dropMultiplier) {
    const types = Object.keys(POWERUP_TYPES);
    const weights = types.map(t => POWERUP_TYPES[t].weight);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let randWeight = getSeededRandom() * totalWeight;
    let selectedType = types[0];
    
    for (let i = 0; i < types.length; i++) {
      randWeight -= weights[i];
      if (randWeight <= 0) {
        selectedType = types[i];
        break;
      }
    }
    
    powerUps.push(new PowerUp(selectedType));
  }

  powerUps = powerUps.filter(powerUp => {
    powerUp.update();
    powerUp.draw();
    
    if (player && powerUp.checkCollision(player)) {
      applyPowerUp(powerUp.type);
      createExplosion(powerUp.x, powerUp.y, powerUp.config.color);
      if (sounds.powerUp) sounds.powerUp();
      return false;
    }
    
    return powerUp.y < canvas.value.height + 30;
  });

  // 生成减速区域（偶尔出现，仅在游戏正式开始后）
  if (gameOfficiallyStarted && getSeededRandom() < 0.001 && slowZones.length < 2) {
    slowZones.push(new SlowZone());
  }

  slowZones = slowZones.filter(zone => {
    zone.update();
    zone.draw();
    
    if (player && zone.checkCollision(player)) {
      zone.applySlowEffect(player);
      return false;
    }
    
    return zone.y < canvas.value.height + 50;
  });
  
  // 更新玩家减速效果
  if (playerSlowEffect.active && currentTime > playerSlowEffect.endTime) {
    playerSlowEffect.active = false;
    playerSlowEffect.speedMultiplier = 1;
  }

  // Boss生成逻辑：第一个Boss按游戏开始时间，后续Boss按击败时间（仅在游戏正式开始后）
  const timeSinceStart = currentTime - startTime;
  const timeSinceLastBoss = lastBossDefeatedTime > 0 ? currentTime - lastBossDefeatedTime : timeSinceStart;
  
  if (gameOfficiallyStarted) {
    if (sounds.playBGM) sounds.playBGM();
    // 根据 Boss 状态调整 BPM
    if (currentBoss) {
      const hpPercent = currentBoss.health / currentBoss.maxHealth;
      if (hpPercent < 0.3) sounds.updateBPM(160);
      else sounds.updateBPM(120);
    } else {
      sounds.updateBPM(80);
    }
  }

  if (gameOfficiallyStarted && !currentBoss && timeSinceLastBoss > nextBossTime) {
    const attackTypes = ['spiral', 'spread', 'circle', 'shield-gen', 'rain', 'small-fast', 'big-spread', 'laser-line', 'buff'];
    let attackType;
    if (bossLevel <= 9) {
      attackType = attackTypes[bossLevel - 1];
    } else {
      // 9 关后随机，但难度递增
      attackType = attackTypes[Math.floor(getSeededRandom() * attackTypes.length)];
    }
    currentBoss = new Boss(bossLevel, attackType);
    
    // 触发 Boss 警告特效
    bossWarningEffect.active = true;
    bossWarningEffect.startTime = currentTime;
    
    // buff boss 效果
    if (attackType === 'buff') {
      config.enemySpawnRate *= 1.5;
    }
    
    bossLevel++;
    // 重置下一个 Boss 的间隔时间（35-45 秒）
    nextBossTime = 35000 + getSeededRandom() * 10000;
  }

  if (currentBoss) {
    currentBoss.update(currentTime);
    currentBoss.draw();

    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      if (!bullet || !currentBoss) continue; 
      
      if (bullet.checkHit(currentBoss.x, currentBoss.y, 40)) {
        
        // 先执行爆炸效果
        if (typeof bullet.explode === 'function') {
          bullet.explode();
        }
        
        // 护盾Boss：先消耗护盾
        if (currentBoss.attackType === 'shield-gen' && currentBoss.bossShield > 0) {
          currentBoss.bossShield--;
          createExplosion(currentBoss.x, currentBoss.y, '#00bcd4');
          
          // 护盾抵挡攻击，不删除穿甲弹
          if (typeof bullet.canPierce === 'function' && bullet.canPierce()) {
            if (typeof bullet.onHit === 'function') {
              bullet.onHit();
            }
          } else {
            bullet.active = false;
          }
          continue; // 护盾抵挡，不扣血
        }
        
        // 计算实际伤害（考虑强攻 buff、暴击、防御和穿甲）
        const isCrit = getSeededRandom() < 0.15;
        const boostDamage = (playerWeapon.value.damageBoost || 0) * 5;
        const baseDamage = (bullet.damage || 5) + boostDamage;
        const critMultiplier = isCrit ? 2 : 1;
        
        const effectiveDefense = Math.max(0, currentBoss.defense - (bullet.defenseIgnore || 0));
        const actualDamage = Math.ceil(baseDamage * critMultiplier * (1 - effectiveDefense));
        currentBoss.health -= actualDamage;
        
        // 添加伤害指示
        damageIndicators.push(new DamageIndicator(bullet.x, bullet.y, actualDamage, isCrit));
        createExplosion(currentBoss.x, currentBoss.y, isCrit ? '#FF8000' : '#ffeb3b');
        
        // 处理子弹穿透/移除
        if (bullet.pierce && bullet.pierceCount < bullet.maxPierce) {
          bullet.pierceCount++;
        } else {
          bullet.active = false; // instead of splice
        }
        
        if (currentBoss && currentBoss.health <= 0) {
          const bossScore = Math.floor((100 + currentBoss.level * 50) * getScoreMultiplier());
          score.value += bossScore;
          
          // 恢复血量
          healPlayer(config.bossHealPercent);
          
          // 如果是buff boss，恢复敌机生成速度
          if (currentBoss.attackType === 'buff') {
            config.enemySpawnRate /= 1.5;
          }
          
          if (sounds.bossDefeat) sounds.bossDefeat();
          createExplosion(currentBoss.x, currentBoss.y, currentBoss.color);
          
          // 限制爆炸粒子数量，防止生成过多卡死
          const particleCount = Math.min(30, MAX_PARTICLES - particles.length);
          for (let j = 0; j < particleCount; j++) {
            createParticle(currentBoss.x, currentBoss.y, '#ffeb3b');
          }
          
          // 记录Boss被击败的时间，作为下一个Boss计时的起点
          lastBossDefeatedTime = currentTime;
          
          // 检查是否通关（打完 12 个 Boss）
          if (bossLevel > MAX_BOSS_COUNT && !gameCompleted) {
            gameCompleted = true;
            if (sounds.victory) sounds.victory();
            
            // 触发通关特效
            victoryEffect.active = true;
            victoryEffect.startTime = currentTime;
            
            endGame(true);
            return;
          }
          
          currentBoss = null;
          break; // 立即退出循环，不再处理其他子弹
        }
      }
    }
  }

  // Boss 存在时也生成普通敌机（仅在游戏正式开始后）
  // 4阶段才开始增加敌机，7阶段开始大幅增加
  let enemySpawnMultiplier = config.enemyCountMultiplier;
  if (bossLevel >= 7) {
    enemySpawnMultiplier *= 2; // 7阶段后敌机翻倍
  } else if (bossLevel >= 4) {
    enemySpawnMultiplier *= 1.5; // 4阶段后敌机增加50%
  }
  
    const timeMultiplier = Math.pow(1.05, Math.floor(gameTime.value / 60));
    const effectiveSpawnRate = config.enemySpawnRate * enemySpawnMultiplier * timeMultiplier * (currentBoss ? 0.5 : 1);
  
  if (gameOfficiallyStarted && enemies.length < MAX_ENEMIES && getSeededRandom() < effectiveSpawnRate) {
    const enemyLevel = getEnemyLevel();
    const newEnemy = new Enemy(enemyLevel);
    
    // 新敌机警告：只在高等级敌机（4 级+）或特殊类型第一次出现时提示
    const enemyType = newEnemy.type;
    if (enemyLevel >= 4 && !notifiedEnemyTypes.has(enemyType)) {
      notifiedEnemyTypes.add(enemyType);
      newEnemyWarning.active = true;
      newEnemyWarning.startTime = currentTime;
      newEnemyWarning.enemyType = enemyType;
    }
    
    enemies.push(newEnemy);
  }

  enemies = enemies.filter(enemy => {
    enemy.update(currentTime);
    enemy.draw();

    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      if (!bullet) continue;
      
      if (enemy.checkHit(bullet)) {
        // 先执行爆炸效果
        if (typeof bullet.explode === 'function') {
          bullet.explode();
        }
        
        // 计算实际伤害（考虑强攻 buff、暴击、防御和穿甲）
        const isCrit = getSeededRandom() < 0.15;
        const boostDamage = (playerWeapon.value.damageBoost || 0) * 5;
        const baseDamage = (bullet.damage || 1) + boostDamage;
        const critMultiplier = isCrit ? 2 : 1;
        
        const effectiveDefense = Math.max(0, enemy.defense - (bullet.defenseIgnore || 0));
        const actualDamage = Math.ceil(baseDamage * critMultiplier * (1 - effectiveDefense));
        enemy.health -= actualDamage;
        
        // 添加伤害指示
        damageIndicators.push(new DamageIndicator(bullet.x, bullet.y, actualDamage, isCrit));
        
        // 处理子弹穿透/移除
        if (bullet.pierce && bullet.pierceCount < bullet.maxPierce) {
            bullet.pierceCount++;
          } else {
            bullet.active = false;
          }
        
        if (enemy.health <= 0) {
          const enemyScore = Math.floor((10 + enemy.level * 10) * getScoreMultiplier());
          score.value += enemyScore;
          createExplosion(enemy.x, enemy.y, enemy.color);
          if (sounds.explosion) sounds.explosion();
          return false;
        } else {
          createExplosion(enemy.x, enemy.y, '#ffeb3b');
        }
      }
    }

    if (player && Math.abs(player.x - enemy.x) < 25 && Math.abs(player.y - enemy.y) < 25) {
      if (player.shield > 0) {
        player.shield--;
        createExplosion(enemy.x, enemy.y, '#00bcd4');
      } else {
        createExplosion(enemy.x, enemy.y, '#ff4757');
        if (takeDamage(20)) {
          return false;
        }
      }
      return false;
    }

    // 检查墙道具（屏障实体）碰撞
    if (barrier.active && barrier.health > 0 && player) {
      const wallY = player.y + 45;
      const wallWidth = 80;
      const wallHeight = 15;
      
      if (Math.abs(enemy.x - player.x) < wallWidth / 2 + 15 && 
          Math.abs(enemy.y - wallY) < wallHeight / 2 + 15) {
        
        barrier.health--;
        if (barrier.health <= 0) barrier.active = false;
        
        createExplosion(enemy.x, enemy.y, '#795548');
        return false; // 敌机撞墙销毁
      }
    }

    if (enemy.y > canvas.value.height) {
      const penalty = Math.floor(5 * getScoreMultiplier());
      score.value = Math.max(0, score.value - penalty);
      if (takeDamage(5)) {
        return false;
      }
      return false;
    }

    return enemy.y < canvas.value.height + 30;
  });

  // 性能优化：限制Boss子弹数量
  if (bossBullets.length > MAX_BOSS_BULLETS) {
    bossBullets = bossBullets.slice(-MAX_BOSS_BULLETS);
  }

  bossBullets = bossBullets.filter(bullet => {
    bullet.update();
    bullet.draw();

    if (player && Math.abs(player.x - bullet.x) < 20 && Math.abs(player.y - bullet.y) < 20) {
      if (player.shield > 0) {
        player.shield--;
        createExplosion(bullet.x, bullet.y, '#00bcd4');
      } else {
        createExplosion(bullet.x, bullet.y, '#ff0066');
        if (takeDamage(bullet.damage)) {
          return false;
        }
      }
      return false;
    }

    // 检查墙道具（屏障实体）碰撞
    if (barrier.active && barrier.health > 0 && player) {
      const wallY = player.y + 45;
      const wallWidth = 80;
      const wallHeight = 15;
      
      if (Math.abs(bullet.x - player.x) < wallWidth / 2 + bullet.radius && 
          Math.abs(bullet.y - wallY) < wallHeight / 2 + bullet.radius) {
        
        barrier.health--;
        if (barrier.health <= 0) barrier.active = false;
        
        createExplosion(bullet.x, bullet.y, '#795548');
        return false; // 子弹被墙挡住销毁
      }
    }

    return bullet.x > -20 && bullet.x < canvas.value.width + 20 && 
           bullet.y > -20 && bullet.y < canvas.value.height + 20;
  });

  // 性能优化：限制粒子数量
  if (particles.length > MAX_PARTICLES) {
    particles = particles.slice(-MAX_PARTICLES);
  }

  particles = particles.filter(particle => {
    particle.update();
    particle.draw();
    return particle.life > 0;
  });

  if (screenShake.active) {
    ctx.restore();
  }

  animationId = requestAnimationFrame(gameLoop);
}

function endGame(victory = false) {
  if (!gameRunning) return; 
  gameRunning = false;
  isTouching = false;

  if (sounds.stopBGM) sounds.stopBGM();
  
  if (props.isMultiplayer) {
    const socket = getSocket();
    if (socket) {
      socket.off('game_action');
    }
  }

  if (!victory) {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    const finalScoreValue = Math.floor(score.value * (1 + gameTime.value * 0.01));
    emit('gameOver', finalScoreValue, victory);
  } else {
    // 通关时继续运行以显示特效，5 秒后再结束
    setTimeout(() => {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      const finalScoreValue = Math.floor(score.value * (1 + gameTime.value * 0.01));
      emit('gameOver', finalScoreValue, victory);
    }, 5000);
  }
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

  // 初始化玩家位置（但先不绘制，等特效结束）
  player = new Player(canvas.value.width / 2, canvas.value.height + 200); // 先放在屏幕外

  canvas.value.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.value.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.value.addEventListener('touchend', handleTouchEnd, { passive: false });
  canvas.value.addEventListener('mousedown', handleMouseDown);
  canvas.value.addEventListener('mousemove', handleMouseMove);
  canvas.value.addEventListener('mouseup', handleMouseUp);

  if (props.isMultiplayer) {
    player2 = new Player(canvas.value.width / 2 + 40, canvas.value.height - 80, true);
    
    if (props.roomData && props.roomData.seed) {
      rngSeed = props.roomData.seed;
    }
    
    const socket = getSocket();
    if (socket) {
      socket.on('game_action', (data) => {
        if (!player2) return;
        const { action } = data;
        if (action.type === 'move') {
          player2.x = action.x;
          player2.y = action.y;
        } else if (action.type === 'shoot') {
          // 创建对方的子弹
          const { bulletType, bulletLevel, spreadLevel, pierceLevel } = action;
          const spreadCount = spreadLevel > 0 ? (spreadLevel === 1 ? 2 : spreadLevel + 1) : 1;
          
          if (spreadCount > 1) {
            const angleBetween = spreadCount === 2 ? 15 : 10;
            const totalAngle = (spreadCount - 1) * angleBetween * (Math.PI / 180);
            
            for (let i = 0; i < spreadCount; i++) {
              const angle = spreadCount === 1 ? 0 : (-totalAngle / 2 + (totalAngle / (spreadCount - 1)) * i);
              const b = new Bullet(player2.x, player2.y - 20, bulletType, bulletLevel, spreadLevel, pierceLevel, angle);
              b.isOther = true;
              otherPlayerBullets.push(b);
            }
          } else {
            const b = new Bullet(player2.x, player2.y - 20, bulletType, bulletLevel, spreadLevel, pierceLevel, 0);
            b.isOther = true;
            otherPlayerBullets.push(b);
          }
        } else if (action.type === 'health_sync') {
          // Teammate sent their state
          // Their 'health' is our 'teammateHealth'
          // Their 'teammateHealth' is our 'health'
          teammateHealth.value = action.health;
          health.value = action.teammateHealth;
          
          if (health.value <= 0 && teammateHealth.value <= 0) {
            endGame();
          }
        }
      });
    }
  }

  gameRunning = true;
  startTime = performance.now();
  
  // 触发游戏开始特效
  gameStartEffect.active = true;
  gameStartEffect.startTime = performance.now();
  gameStartEffect.phase = 1;
  
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
  
  if (props.isMultiplayer) {
    const socket = getSocket();
    if (socket) {
      socket.off('game_action');
    }
  }
});
</script>

<template>
  <div class="game-container">
    <!-- 顶部 HUD 信息栏 -->
    <div class="hud-top-bar">
      <div class="hud-left">
        <button class="hud-back-btn" @click="goBackToHub">←</button>
        <div v-if="!isGuest" class="player-profile">
          <span class="hud-label">PILOT</span>
          <span class="hud-value">{{ playerName }}</span>
        </div>
      </div>

      <div class="hud-center">
        <div class="hud-stats">
          <div class="stat-group">
            <span class="stat-icon">⏱</span>
            <span>{{ gameTime }}s</span>
          </div>
          <div class="stat-group">
            <span class="stat-icon">🏆</span>
            <span class="stat-score">{{ score }}</span>
          </div>
          <span class="stat-multiplier">x{{ getScoreMultiplier().toFixed(1) }}</span>
        </div>
      </div>

      <div class="hud-right">
        <!-- 武器与血量状态 -->
        <div class="weapon-status" :class="{'multiplayer': isMultiplayer}">
          <div class="health-bars-container">
            <div class="health-mini-bar player-health" :class="{'critical-flash': health <= 20}">
              <div class="health-fill" :style="{ width: health + '%' }"></div>
              <span v-if="health <= 0" class="health-text">濒危</span>
            </div>
            <div v-if="isMultiplayer" class="health-mini-bar teammate-health" :class="{'critical-flash': teammateHealth <= 20}">
              <div class="health-fill teammate-fill" :style="{ width: teammateHealth + '%' }"></div>
              <span v-if="teammateHealth <= 0" class="health-text">濒危</span>
            </div>
          </div>
          <div class="weapon-icon-wrapper" :class="{ 'pulse-glow': true }">
            <span class="weapon-symbol">{{ getWeaponSymbol() }}</span>
            <span class="weapon-level">Lv.{{ playerWeapon.bulletLevel || 1 }}</span>
          </div>
        </div>
        
        <!-- 一键截图按钮 -->
        <button class="screenshot-btn" @click="takeScreenshot" title="一键截图">�</button>
        <button class="hud-pause-btn" @click="togglePause">⏸</button>
      </div>
    </div>

    <!-- 全屏 Canvas -->
    <canvas ref="canvas" @click="handleCanvasClick" @touchend="handlePauseTouch"></canvas>
    
    <!-- 截图加载动画 -->
    <div v-if="isCapturing" class="loading-overlay">
      <div class="loader"></div>
      <p>正在生成战报截图...</p>
    </div>

    <!-- 截图预览与保存 -->
    <div v-if="showScreenshotPreview" class="screenshot-preview-overlay" @click.self="closeScreenshot">
      <div class="screenshot-content">
        <div class="preview-header">
          <h3>我的飞行战报</h3>
          <button class="close-btn" @click="closeScreenshot">×</button>
        </div>
        <div class="image-wrapper">
          <img :src="screenshotUrl" alt="游戏截图" />
        </div>
        <div class="preview-footer">
          <p>长按图片可保存至相册</p>
          <a :href="screenshotUrl" download="plane-game-score.jpg" class="download-link">点击保存</a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: #1a1a1a; /* 深灰背景 */
}

/* 现代玻璃拟态 HUD */
.hud-top-bar {
  position: absolute;
  top: 15px;
  left: 50%;
  transform: translateX(-50%);
  width: 95%;
  max-width: 800px;
  height: 56px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 15px;
  background: rgba(10, 14, 39, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
  z-index: 100;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.hud-left, .hud-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hud-back-btn, .hud-pause-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.hud-back-btn:hover, .hud-pause-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

.player-profile {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.hud-label {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 1px;
  text-transform: uppercase;
}

.hud-value {
  font-size: 14px;
  color: #fff;
  font-weight: 600;
}

/* 中央数据区 */
.hud-center {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 20px;
}

.hud-stats {
  display: flex;
  align-items: center;
  gap: 20px;
  font-size: 15px;
  font-family: 'Monaco', monospace;
  color: #fff;
}

.stat-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-icon {
  opacity: 0.8;
  font-size: 14px;
}

.stat-score {
  color: #FFD700;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(255, 215, 0, 0.4);
}

.stat-multiplier {
  font-size: 12px;
  color: #00FFFF;
  background: rgba(0, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

/* 武器状态与进度条 */
.weapon-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-right: 10px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.health-bars-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-right: 5px;
}

.health-mini-bar {
  width: 60px;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.health-fill {
  height: 100%;
  background: linear-gradient(90deg, #FF416C, #FF4B2B);
  transition: width 0.3s ease;
}

.teammate-fill {
  background: linear-gradient(90deg, #00b4db, #0083b0);
}

.health-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 8px;
  color: white;
  font-weight: bold;
  text-shadow: 0 0 2px black;
  white-space: nowrap;
}

@keyframes criticalPulse {
  0% { opacity: 1; box-shadow: 0 0 0px transparent; }
  50% { opacity: 0.7; box-shadow: 0 0 8px #FF416C; }
  100% { opacity: 1; box-shadow: 0 0 0px transparent; }
}

.critical-flash {
  animation: criticalPulse 1s infinite;
  border-color: #FF416C;
}

.weapon-icon-wrapper {
  position: relative;
  width: 30px;
  height: 30px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.weapon-symbol {
  font-size: 16px;
}

.weapon-level {
  position: absolute;
  bottom: -6px;
  right: -6px;
  background: #2196F3;
  color: #fff;
  font-size: 9px;
  padding: 2px 5px;
  border-radius: 6px;
  font-weight: bold;
  border: 1px solid #fff;
}

.screenshot-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(255, 193, 7, 0.15);
  border: 1px solid rgba(255, 193, 7, 0.3);
  color: #FFC107;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.screenshot-btn:hover {
  background: rgba(255, 193, 7, 0.3);
  transform: scale(1.05);
}

@media (max-width: 600px) {
  .hud-top-bar {
    top: 10px;
    height: 50px;
    padding: 0 10px;
    border-radius: 12px;
  }
  
  .hud-stats {
    gap: 10px;
    font-size: 13px;
  }
  
  .hud-label, .player-profile {
    display: none;
  }
  
  .health-mini-bar {
    width: 40px;
  }
}

</style>
