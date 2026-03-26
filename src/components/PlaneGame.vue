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
  easy: { 
    enemySpeed: 2, 
    enemySpawnRate: 0.015, 
    bulletSpeed: 8, 
    bossAttackMultiplier: 0.7, 
    bossHealPercent: 30,
    powerUpRate: 0.0008,
    initialFireRate: 250 // 初始射速（毫秒）
  },
  medium: { 
    enemySpeed: 3.5, 
    enemySpawnRate: 0.025, 
    bulletSpeed: 8, 
    bossAttackMultiplier: 1, 
    bossHealPercent: 20,
    powerUpRate: 0.0006,
    initialFireRate: 200
  },
  hard: { 
    enemySpeed: 5, 
    enemySpawnRate: 0.04, 
    bulletSpeed: 8, 
    bossAttackMultiplier: 1.5, 
    bossHealPercent: 15,
    powerUpRate: 0.0004,
    initialFireRate: 180
  }
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
let bullets = [];
let enemies = [];
let particles = [];
let bossBullets = [];
let powerUps = [];
let blackHoles = [];

// 环境效果
let slowEffect = { active: false, endTime: 0 };
let phantomEffect = { active: false, endTime: 0, actions: [] };
let barrier = { active: false, health: 0, maxHealth: 4 };

// 性能优化：限制对象数量
const MAX_BULLETS = 100;
const MAX_PARTICLES = 200;
const MAX_ENEMIES = 30;
const MAX_BOSS_BULLETS = 150;

// 地图滚动
let mapOffset = 0;
const mapSpeed = 0.5;

// 玩家武器系统
const playerWeapon = ref({
  // 属性类（可叠加）
  spreadLevel: 0, // 散弹等级
  pierceLevel: 0, // 穿甲等级
  fireRate: 1, // 射速等级，1-5
  
  // 弹道类（互斥）- 只能有一种
  bulletType: 'normal', // normal/laser/spiral/explosive
  bulletLevel: 0, // 当前弹道类型的等级
  
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
  // 武器类
  RAPID: { color: '#f44336', symbol: 'F', name: '射速', weight: 5 },
  EXPLOSIVE: { color: '#ff9800', symbol: 'E', name: '爆炸', weight: 3 },
  SPREAD: { color: '#2196f3', symbol: 'S', name: '散射', weight: 3 },
  
  // 特效型导弹
  LASER: { color: '#9c27b0', symbol: 'L', name: '激光', weight: 2 },
  BURST: { color: '#00bcd4', symbol: 'B', name: '爆裂', weight: 2 },
  PIERCE: { color: '#ffeb3b', symbol: 'P', name: '穿甲', weight: 2 },
  
  // 防护性
  HEALTH: { color: '#4caf50', symbol: '+', name: '血包', weight: 1.5 },
  SHIELD: { color: '#607d8b', symbol: 'D', name: '护盾', weight: 1.5 },
  BARRIER: { color: '#795548', symbol: 'X', name: '防护罩', weight: 1 },
  
  // 环境型
  SLOW: { color: '#9e9e9e', symbol: 'T', name: '延缓', weight: 0.5 },
  PHANTOM: { color: '#673ab7', symbol: 'G', name: '幻影', weight: 0.5 },
  
  // 全图爆炸
  LIGHTNING: { color: '#ffeb3b', symbol: '⚡', name: '闪电', weight: 0.1 }
};

class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 40;
    this.height = 50;
    this.shield = 0;
  }

  draw() {
    // 护盾效果
    if (this.shield > 0) {
      ctx.strokeStyle = 'rgba(0, 188, 212, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 35, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    ctx.fillStyle = '#4a9eff';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - 20);
    ctx.lineTo(this.x - 15, this.y + 20);
    ctx.lineTo(this.x, this.y + 10);
    ctx.lineTo(this.x + 15, this.y + 20);
    ctx.closePath();
    ctx.fill();
    
    // 根据武器类型改变机翼颜色
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
  }

  moveTo(targetX, targetY) {
    this.x = targetX;
    this.y = targetY;
    this.x = Math.max(20, Math.min(canvas.value.width - 20, this.x));
    this.y = Math.max(30, Math.min(canvas.value.height - 30, this.y));
  }
}

class Bullet {
  constructor(x, y, bulletType = 'normal', bulletLevel = 0, spreadLevel = 0, pierceLevel = 0, angle = 0) {
    this.x = x;
    this.y = y;
    this.bulletType = bulletType;
    this.bulletLevel = bulletLevel;
    this.spreadLevel = spreadLevel;
    this.pierceLevel = pierceLevel;
    this.angle = angle; // 散弹角度
    this.speed = config.bulletSpeed;
    
    // 根据弹道类型设置属性
    if (bulletType === 'laser') {
      // 激光线
      this.width = 3;
      this.height = 50;
      this.damage = 3 + bulletLevel;
      this.hitRadius = 5;
    } else if (bulletType === 'burst') {
      // 爆裂球：等级越高球越大
      this.width = 10 + bulletLevel * 3;
      this.height = 10 + bulletLevel * 3;
      this.damage = 2 + bulletLevel;
      this.hitRadius = this.width / 2;
    } else if (bulletType === 'explosive') {
      this.width = 8;
      this.height = 8;
      this.damage = 2 + bulletLevel;
      this.hitRadius = 6;
    } else {
      this.width = 4;
      this.height = 12;
      this.damage = 1;
      this.hitRadius = 4;
    }
    
    // 穿甲属性
    this.pierce = pierceLevel > 0;
    this.pierceCount = 0;
    this.maxPierce = Math.min(3 + pierceLevel, 10);
  }

  draw() {
    if (this.bulletType === 'explosive') {
      // 爆炸弹：橙色圆球
      ctx.fillStyle = '#ff9800';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.hitRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff5722';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (this.bulletType === 'laser') {
      // 激光线：紫色线条
      ctx.strokeStyle = '#9c27b0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 25);
      ctx.lineTo(this.x, this.y + 25);
      ctx.stroke();
      
      // 核心白线
      ctx.strokeStyle = '#e1bee7';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 25);
      ctx.lineTo(this.x, this.y + 25);
      ctx.stroke();
    } else if (this.bulletType === 'burst') {
      // 爆裂球：青色能量球，等级越高越大
      const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.hitRadius);
      gradient.addColorStop(0, '#e0f7fa');
      gradient.addColorStop(0.5, '#00bcd4');
      gradient.addColorStop(1, 'rgba(0, 188, 212, 0.3)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.hitRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // 外圈
      ctx.strokeStyle = '#00bcd4';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      // 普通/穿甲弹
      ctx.fillStyle = this.pierce ? '#ffeb3b' : '#4caf50';
      ctx.fillRect(this.x - 2, this.y - 6, this.width, this.height);
      if (this.pierce) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x - 2, this.y - 6, this.width, this.height);
      }
    }
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
          particles.push(new Particle(this.x, this.y, '#ff9800'));
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
    this.x = Math.random() * (canvas.value.width - 40) + 20;
    this.y = -30;
    this.width = 35;
    this.height = 35;
    this.level = level;
    this.maxHealth = level;
    this.health = level;
    
    // 高级敌机斜着飞
    if (level >= 3) {
      this.speed = (config.enemySpeed - level * 0.3) + Math.random() * 0.5;
      this.horizontalSpeed = (Math.random() - 0.5) * 2;
      this.pattern = Math.random() < 0.5 ? 'zigzag' : 'sine';
    } else {
      this.speed = (config.enemySpeed - level * 0.3) + Math.random() * 1;
      this.horizontalSpeed = 0;
      this.pattern = 'straight';
    }
    
    this.speed = Math.max(1.5, this.speed);
    this.color = this.getColorByLevel(level);
    this.canShoot = level >= 3;
    this.lastShootTime = 0;
    this.startY = this.y;
  }
  
  getColorByLevel(level) {
    const colors = ['#ff4757', '#ff6b81', '#ee5a6f', '#e84393', '#fd79a8'];
    return colors[Math.min(level - 1, colors.length - 1)];
  }

  draw() {
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
    
    if (this.level > 1) {
      const barWidth = 30;
      const barHeight = 3;
      const barX = this.x - barWidth / 2;
      const barY = this.y - 15;
      
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
    if (bossBullets.length < MAX_BOSS_BULLETS) {
      bossBullets.push(new BossBullet(this.x, this.y + 15, Math.PI / 2, 5, 3));
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
    
    // 血量随等级递增
    const baseHealth = attackType === 'buff' ? 150 : 50;
    this.maxHealth = baseHealth + level * 20;
    this.health = this.maxHealth;
    
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
      'left-right': '#00bcd4',
      'right-left': '#ff5722',
      'small-fast': '#4caf50',
      'big-spread': '#e91e63',
      'laser-line': '#9c27b0',
      'buff': '#ffd700'
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
    // 根据类型调整移动速度
    const speed = this.attackType === 'small-fast' ? this.moveSpeed : 
                  this.attackType === 'buff' ? this.moveSpeed : 2;
    
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
      // Boss 1: 螺旋
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + Date.now() * 0.005;
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage));
      }
    } else if (this.attackType === 'spread') {
      // Boss 2: 扇形
      for (let i = -3; i <= 3; i++) {
        const angle = Math.PI / 2 + (i * Math.PI / 12);
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage));
      }
    } else if (this.attackType === 'circle') {
      // Boss 3: 圆形
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage));
      }
    } else if (this.attackType === 'left-right') {
      // Boss 4: 从左往右
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 6 + (i * Math.PI / 12);
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage));
      }
    } else if (this.attackType === 'right-left') {
      // Boss 5: 从右往左
      for (let i = 0; i < 5; i++) {
        const angle = Math.PI + Math.PI / 6 - (i * Math.PI / 12);
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage));
      }
    } else if (this.attackType === 'small-fast') {
      // Boss 6: 小而快，快速射击
      for (let i = 0; i < 3; i++) {
        const angle = Math.PI / 2 + (i - 1) * Math.PI / 8;
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage, 6));
      }
    } else if (this.attackType === 'big-spread') {
      // Boss 7: 超大弹幕
      for (let i = -5; i <= 5; i++) {
        const angle = Math.PI / 2 + (i * Math.PI / 10);
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage));
      }
    } else if (this.attackType === 'laser-line') {
      // Boss 8: 激光线
      for (let i = -1; i <= 1; i++) {
        bossBullets.push(new BossBullet(this.x + i * 30, this.y + 20, Math.PI / 2, this.damage, 10, true));
      }
    } else if (this.attackType === 'buff') {
      // Boss 9: buff boss，普通攻击
      for (let i = -2; i <= 2; i++) {
        const angle = Math.PI / 2 + (i * Math.PI / 16);
        bossBullets.push(new BossBullet(this.x, this.y + 20, angle, this.damage));
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
    this.x = Math.random() * (canvas.value.width - 40) + 20;
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
  const rand = Math.random();
  
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

class BlackHole {
  constructor() {
    this.x = Math.random() * (canvas.value.width - 100) + 50;
    this.y = -50;
    this.radius = 40;
    this.speed = 1.5;
    this.rotation = 0;
  }

  draw() {
    this.rotation += 0.05;
    
    // 外圈旋转效果
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(138, 43, 226, ${0.3 - i * 0.1})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + i * 10, this.rotation + i, this.rotation + Math.PI + i);
      ctx.stroke();
    }
    
    // 黑洞中心
    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
    gradient.addColorStop(0, '#000');
    gradient.addColorStop(0.5, '#4a148c');
    gradient.addColorStop(1, 'rgba(138, 43, 226, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // 警告文字
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('!', this.x, this.y + 4);
  }

  update() {
    this.y += this.speed;
  }
  
  checkCollision(player) {
    const dist = Math.sqrt((player.x - this.x) ** 2 + (player.y - this.y) ** 2);
    return dist < this.radius;
  }
  
  teleportPlayer(player) {
    player.x = Math.random() * (canvas.value.width - 40) + 20;
    player.y = Math.random() * (canvas.value.height - 100) + 50;
    
    // 传送特效
    for (let i = 0; i < 20; i++) {
      particles.push(new Particle(player.x, player.y, '#8a2be2'));
    }
  }
}

function applyPowerUp(type) {
  if (type === 'HEALTH') {
    health.value = Math.min(100, health.value + 30);
  } else if (type === 'SPREAD') {
    // 属性类：散弹
    playerWeapon.value.spreadLevel = Math.min(playerWeapon.value.maxWeaponLevel, playerWeapon.value.spreadLevel + 1);
  } else if (type === 'PIERCE') {
    // 属性类：穿甲
    playerWeapon.value.pierceLevel = Math.min(playerWeapon.value.maxWeaponLevel, playerWeapon.value.pierceLevel + 1);
  } else if (type === 'EXPLOSIVE') {
    // 弹道类：爆炸（互斥）
    if (playerWeapon.value.bulletType === 'explosive') {
      playerWeapon.value.bulletLevel = Math.min(playerWeapon.value.maxWeaponLevel, playerWeapon.value.bulletLevel + 1);
    } else {
      playerWeapon.value.bulletType = 'explosive';
      playerWeapon.value.bulletLevel = 1;
    }
  } else if (type === 'LASER') {
    // 弹道类：激光（互斥）
    if (playerWeapon.value.bulletType === 'laser') {
      playerWeapon.value.bulletLevel = Math.min(playerWeapon.value.maxWeaponLevel, playerWeapon.value.bulletLevel + 1);
    } else {
      playerWeapon.value.bulletType = 'laser';
      playerWeapon.value.bulletLevel = 1;
    }
  } else if (type === 'BURST') {
    // 弹道类：爆裂（互斥）
    if (playerWeapon.value.bulletType === 'burst') {
      playerWeapon.value.bulletLevel = Math.min(playerWeapon.value.maxWeaponLevel, playerWeapon.value.bulletLevel + 1);
    } else {
      playerWeapon.value.bulletType = 'burst';
      playerWeapon.value.bulletLevel = 1;
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
    
    // 闪电特效
    for (let i = 0; i < 50; i++) {
      particles.push(new Particle(
        Math.random() * canvas.value.width,
        Math.random() * canvas.value.height * 0.7,
        '#ffeb3b'
      ));
    }
  } else if (type === 'SLOW') {
    // 延缓：减慢敌机5秒
    slowEffect.active = true;
    slowEffect.endTime = performance.now() + 5000;
  } else if (type === 'PHANTOM') {
    // 幻影：10秒
    phantomEffect.active = true;
    phantomEffect.endTime = performance.now() + 10000;
    phantomEffect.actions = [];
  } else if (type === 'BARRIER') {
    // 防护罩：刷新血量
    barrier.active = true;
    barrier.health = barrier.maxHealth;
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

class Phantom {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  draw() {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#673ab7';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - 20);
    ctx.lineTo(this.x - 15, this.y + 20);
    ctx.lineTo(this.x, this.y + 10);
    ctx.lineTo(this.x + 15, this.y + 20);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

class Barrier {
  draw() {
    if (!barrier.active || barrier.health <= 0) return;
    
    const y = canvas.value.height - 30;
    const healthPercent = barrier.health / barrier.maxHealth;
    
    // 防护罩
    ctx.strokeStyle = `rgba(121, 85, 72, ${0.3 + healthPercent * 0.4})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.value.width, y);
    ctx.stroke();
    
    // 能量点
    for (let i = 0; i < canvas.value.width; i += 20) {
      ctx.fillStyle = `rgba(255, 152, 0, ${0.5 + Math.sin(Date.now() * 0.01 + i) * 0.3})`;
      ctx.beginPath();
      ctx.arc(i, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
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
      // 散弹等级决定子弹数量和角度
      const spreadCount = Math.min(2 + spreadLevel, 7);
      const maxAngle = Math.min(15 + spreadLevel * 5, 40) * (Math.PI / 180);
      
      for (let i = 0; i < spreadCount; i++) {
        const angleStep = maxAngle / (spreadCount - 1);
        const angle = -maxAngle / 2 + angleStep * i;
        bullets.push(new Bullet(player.x, player.y - 20, bulletType, bulletLevel, spreadLevel, pierceLevel, angle));
      }
    } else {
      bullets.push(new Bullet(player.x, player.y - 20, bulletType, bulletLevel, spreadLevel, pierceLevel, 0));
    }
    
    // 根据武器类型播放不同音效
    if (sounds.shoot) sounds.shoot(bulletType);
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

function getWeaponDisplay() {
  try {
    const w = playerWeapon.value;
    const parts = [];
    
    // 弹道类型
    if (w.bulletType === 'laser' && w.bulletLevel > 0) {
      parts.push(`${w.bulletLevel}级激光`);
    } else if (w.bulletType === 'burst' && w.bulletLevel > 0) {
      parts.push(`${w.bulletLevel}级爆裂`);
    } else if (w.bulletType === 'explosive' && w.bulletLevel > 0) {
      parts.push(`${w.bulletLevel}级爆炸`);
    }
    
    // 属性类型
    const attrs = [];
    if (w.spreadLevel > 0) attrs.push(`散弹${w.spreadLevel}`);
    if (w.pierceLevel > 0) attrs.push(`穿甲${w.pierceLevel}`);
    
    if (attrs.length > 0) {
      parts.push(`[${attrs.join('+')}]`);
    }
    
    if (parts.length === 0) {
      return '普通武器';
    }
    
    return parts.join(' ');
  } catch (e) {
    return '普通武器';
  }
}

function getFireRateDisplay() {
  try {
    const rate = playerWeapon.value?.fireRate || 1;
    return `攻速${rate}`;
  } catch (e) {
    return '攻速1';
  }
}

function getPlaneLevel() {
  try {
    return getTotalLevel();
  } catch (e) {
    return 1;
  }
}

function gameLoop(currentTime) {
  if (!gameRunning) return;

  gameTime.value = Math.floor((currentTime - startTime) / 1000);
  
  if (gameTime.value >= MAX_GAME_TIME && !gameCompleted) {
    gameCompleted = true;
    if (sounds.victory) sounds.victory();
    endGame(true);
    return;
  }

  // 地图滚动
  mapOffset += mapSpeed;
  if (mapOffset > canvas.value.height) mapOffset = 0;

  ctx.fillStyle = '#0a0e27';
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);

  // 滚动星空背景
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  for (let i = 0; i < 50; i++) {
    const x = (i * 37) % canvas.value.width;
    const y = ((mapOffset + i * 50) % canvas.value.height);
    ctx.fillRect(x, y, 1, 1);
  }

  if (isTouching && player) {
    player.moveTo(touchX, touchY);
  }
  
  // 绘制防护罩
  if (barrier.active && barrier.health > 0) {
    new Barrier().draw();
  }
  
  if (player) {
    player.draw();
    autoShoot(currentTime);
    
    // 记录幻影动作
    if (phantomEffect.active) {
      phantomEffect.actions.push({ x: player.x, y: player.y, time: currentTime });
      // 只保留1秒内的动作
      phantomEffect.actions = phantomEffect.actions.filter(a => currentTime - a.time < 1000);
    }
  }
  
  // 绘制幻影
  if (phantomEffect.active && phantomEffect.actions.length > 0) {
    const oldestAction = phantomEffect.actions[0];
    if (oldestAction) {
      new Phantom(oldestAction.x, oldestAction.y).draw();
      
      // 幻影也发射子弹（1秒前的位置）
      if (currentTime - lastShootTime > config.initialFireRate - (playerWeapon.value.fireRate - 1) * 30) {
        const bulletType = playerWeapon.value.bulletType;
        const bulletLevel = playerWeapon.value.bulletLevel;
        const spreadLevel = playerWeapon.value.spreadLevel;
        const pierceLevel = playerWeapon.value.pierceLevel;
        
        if (bullets.length < MAX_BULLETS) {
          const phantomBullet = new Bullet(oldestAction.x, oldestAction.y - 20, bulletType, bulletLevel, spreadLevel, pierceLevel, 0);
          bullets.push(phantomBullet);
        }
      }
    }
  }
  
  // 更新环境效果
  if (slowEffect.active && currentTime > slowEffect.endTime) {
    slowEffect.active = false;
  }
  if (phantomEffect.active && currentTime > phantomEffect.endTime) {
    phantomEffect.active = false;
    phantomEffect.actions = [];
  }

  // 性能优化：限制子弹数量
  if (bullets.length > MAX_BULLETS) {
    bullets = bullets.slice(-MAX_BULLETS);
  }

  bullets = bullets.filter(bullet => {
    bullet.update();
    bullet.draw();
    return bullet.y > -20;
  });

  // 生成道具（按权重随机）
  if (Math.random() < config.powerUpRate * (1 + bossLevel * 0.1)) {
    const types = Object.keys(POWERUP_TYPES);
    const weights = types.map(t => POWERUP_TYPES[t].weight);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    let selectedType = types[0];
    
    for (let i = 0; i < types.length; i++) {
      random -= weights[i];
      if (random <= 0) {
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

  // 生成黑洞（每60-90秒一次）
  if (Math.random() < 0.0002 && blackHoles.length < 2) {
    blackHoles.push(new BlackHole());
  }

  blackHoles = blackHoles.filter(hole => {
    hole.update();
    hole.draw();
    
    if (player && hole.checkCollision(player)) {
      hole.teleportPlayer(player);
      return false;
    }
    
    return hole.y < canvas.value.height + 50;
  });

  if (!currentBoss && currentTime - startTime > nextBossTime) {
    const attackTypes = ['spiral', 'spread', 'circle', 'left-right', 'right-left', 'small-fast', 'big-spread', 'laser-line', 'buff'];
    let attackType;
    if (bossLevel <= 9) {
      attackType = attackTypes[bossLevel - 1];
    } else {
      // 9关后随机，但难度递增
      attackType = attackTypes[Math.floor(Math.random() * attackTypes.length)];
    }
    currentBoss = new Boss(bossLevel, attackType);
    
    // buff boss效果
    if (attackType === 'buff') {
      config.enemySpawnRate *= 1.5;
    }
    
    bossLevel++;
    nextBossTime += 35000 + Math.random() * 10000;
  }

  if (currentBoss) {
    currentBoss.update(currentTime);
    currentBoss.draw();

    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      if (!bullet || !currentBoss) continue; // 检查currentBoss是否还存在
      
      if (bullet.checkHit(currentBoss.x, currentBoss.y, 40)) {
        
        // 先执行爆炸效果
        if (typeof bullet.explode === 'function') {
          bullet.explode();
        }
        
        currentBoss.health -= 5;
        createExplosion(currentBoss.x, currentBoss.y, '#ffeb3b');
        
        // 检查穿甲弹，决定是否删除子弹
        if (typeof bullet.canPierce === 'function' && bullet.canPierce()) {
          if (typeof bullet.onHit === 'function') {
            bullet.onHit();
          }
        } else {
          bullets.splice(i, 1);
        }
        
        if (currentBoss.health <= 0) {
          const bossScore = Math.floor((100 + currentBoss.level * 50) * getScoreMultiplier());
          score.value += bossScore;
          
          // 恢复血量
          const healAmount = config.bossHealPercent;
          health.value = Math.min(100, health.value + healAmount);
          
          // 如果是buff boss，恢复敌机生成速度
          if (currentBoss.attackType === 'buff') {
            config.enemySpawnRate /= 1.5;
          }
          
          if (sounds.bossDefeat) sounds.bossDefeat();
          createExplosion(currentBoss.x, currentBoss.y, currentBoss.color);
          for (let j = 0; j < 30; j++) {
            particles.push(new Particle(currentBoss.x, currentBoss.y, '#ffeb3b'));
          }
          currentBoss = null;
          break; // 立即退出循环，不再处理其他子弹
        }
      }
    }
  }

  // Boss存在时也生成普通敌机
  if (enemies.length < MAX_ENEMIES && Math.random() < config.enemySpawnRate * (currentBoss ? 0.5 : 1)) {
    enemies.push(new Enemy(getEnemyLevel()));
  }

  enemies = enemies.filter(enemy => {
    enemy.update(currentTime);
    enemy.draw();

    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      if (!bullet) continue;
      
      if (enemy.checkHit(bullet)) {
        // 先执行爆炸效果和伤害
        if (typeof bullet.explode === 'function') {
          bullet.explode();
        }
        enemy.health -= bullet.damage;
        
        // 检查穿甲弹，决定是否删除子弹
        if (typeof bullet.canPierce === 'function' && bullet.canPierce()) {
          if (typeof bullet.onHit === 'function') {
            bullet.onHit();
          }
        } else {
          bullets.splice(i, 1);
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
        health.value -= 20;
        createExplosion(enemy.x, enemy.y, '#ff4757');
        if (health.value <= 0) {
          endGame();
        }
      }
      return false;
    }

    if (enemy.y > canvas.value.height) {
      // 检查防护罩
      if (barrier.active && barrier.health > 0) {
        barrier.health--;
        if (barrier.health <= 0) {
          barrier.active = false;
        }
      } else {
        const penalty = Math.floor(5 * getScoreMultiplier());
        score.value = Math.max(0, score.value - penalty);
        health.value = Math.max(0, health.value - 5); // 扣血
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
        health.value = Math.max(0, health.value - bullet.damage);
        createExplosion(bullet.x, bullet.y, '#ff0066');
        if (health.value <= 0) {
          endGame();
        }
      }
      return false;
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
        <span class="value">{{ playerName }}</span>
      </div>
      <div class="ui-item">
        <span class="value">{{ gameTime }}s</span>
      </div>
      <div class="ui-item">
        <span class="value">x{{ getScoreMultiplier().toFixed(1) }}</span>
      </div>
      <div class="ui-item">
        <span class="value score">{{ score }}</span>
      </div>
      <div class="ui-item">
        <span class="value level">Lv.{{ getPlaneLevel() }}</span>
      </div>
      <div class="ui-item weapon-item">
        <span class="value weapon">{{ getWeaponDisplay() }}</span>
      </div>
      <div class="ui-item">
        <span class="value rapid">{{ getFireRateDisplay() }}</span>
      </div>
      <div class="ui-item" v-if="player?.shield > 0">
        <span class="value shield">🛡{{ player.shield }}</span>
      </div>
      <div class="ui-item">
        <div class="health-bar">
          <div class="health-fill" :style="{ width: health + '%' }"></div>
          <span class="health-text">{{ health }}%</span>
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
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
  gap: 8px;
  z-index: 10;
  background: rgba(0, 0, 0, 0.3);
  padding: 8px 12px;
  border-radius: 10px;
  backdrop-filter: blur(3px);
  max-width: 95%;
}

.ui-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 50px;
}

.weapon-item {
  min-width: 100px;
  max-width: 180px;
}

.label {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.6rem;
  white-space: nowrap;
}

.value {
  color: #fff;
  font-size: 0.8rem;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
  text-shadow: 0 0 3px rgba(0,0,0,0.8);
}

.value.score {
  color: #ffeb3b;
}

.value.level {
  color: #9c27b0;
}

.value.weapon {
  color: #2196f3;
  max-width: 160px;
  font-size: 0.7rem;
}

.value.rapid {
  color: #f44336;
}

.value.shield {
  color: #00bcd4;
}

.health-bar {
  width: 60px;
  height: 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  overflow: visible;
  flex-shrink: 0;
  position: relative;
}

.health-fill {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #8bc34a);
  transition: width 0.3s;
  border-radius: 4px;
}

.health-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.6rem;
  color: #fff;
  font-weight: bold;
  text-shadow: 0 0 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9);
  pointer-events: none;
  z-index: 1;
}

@media (max-width: 480px) {
  .game-ui {
    gap: 6px;
    padding: 6px 8px;
    grid-template-columns: repeat(auto-fit, minmax(50px, 1fr));
  }
  
  .ui-item {
    min-width: 50px;
  }
  
  .label {
    font-size: 0.6rem;
  }
  
  .value {
    font-size: 0.75rem;
    max-width: 60px;
  }
  
  .health-bar {
    width: 50px;
  }
}
</style>
