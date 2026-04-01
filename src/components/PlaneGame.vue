<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';

import { getSocket } from '../socket';
import { showToast } from '../utils/toast';
import { getAuthData } from '../utils/auth';
import { applyWallPickup, consumeWallOnCross } from '../modules/wall';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT, computeViewport, clampInWorld } from '../utils/viewport';
import { getCurrentOrientation, getOrientationLabel, requestBestEffortOrientationLock, waitForOrientation } from '../utils/orientation';
import { GameState, updatePlayerHUD } from '../state/gameState';
import { computeSoloWorldSize } from '../utils/soloCanvas';

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

const isHost = props.isMultiplayer && props.roomData?.role === 'host';

const emit = defineEmits(['gameOver', 'backToHub']);
const myUserId = getAuthData()?.user?.id;

const canvas = ref(null);
const desiredOrientation = 'portrait'; // 现单人双人都统一使用竖屏
const shouldEnforceOrientation = typeof navigator !== 'undefined' && (
  Number(navigator.maxTouchPoints || 0) > 0 ||
  /Android|iPhone|iPad|iPod/i.test(String(navigator.userAgent || ''))
);
const currentOrientation = ref(getCurrentOrientation());
const orientationMismatch = ref(false);
const showOrientationPrompt = ref(false);
const orientationTransitioning = ref(false);
let pausedByOrientation = false;
const hudWidth = ref(0);
const hudScale = ref(1);

function formatTimeMMSS(totalSeconds) {
  const t = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const mm = String(Math.floor(t / 60)).padStart(2, '0');
  const ss = String(t % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function bulletTypeLabel(type) {
  const t = String(type || '');
  if (t === 'laser') return '激光';
  if (t === 'burst') return '弹幕';
  if (t === 'explosive') return '爆炸';
  if (t === 'pulse') return '脉冲';
  if (t === 'needle') return '针刺';
  if (t === 'ion') return '离子';
  return '普通';
}

function bulletLevelLabel(level) {
  const lv = Math.max(0, Math.floor(Number(level) || 0));
  return `Lv.${lv}`;
}

function computePierceDefenseIgnore(pierceLevel) {
  const lv = Math.max(0, Math.floor(Number(pierceLevel) || 0));
  if (lv <= 0) return 0;
  return Math.min(0.12 + (lv - 1) * 0.06, 0.42);
}

function computeAttackPower(weapon) {
  const w = weapon && typeof weapon === 'object' ? weapon : {};
  const bt = String(w.bulletType || 'normal');
  const bl = Math.floor(Number(w.bulletLevel) || 0);
  let base = 1;
  if (bt === 'laser') base = 3 + bl;
  else if (bt === 'burst') base = 2 + bl;
  else if (bt === 'explosive') base = 2 + bl;
  else if (bt === 'pulse') base = 2 + bl;
  else if (bt === 'needle') base = 1 + bl;
  else if (bt === 'ion') base = 3 + Math.floor(bl * 0.5);
  const boost = Math.max(0, Math.floor(Number(w.damageBoost) || 0));
  return Math.max(0, base + boost);
}

const hudTimeText = computed(() => formatTimeMMSS(gameTime.value));

function clampInCanvas(x, y, marginX = 0, marginY = 0) {
  const w = Number(canvas.value?.width || 0);
  const h = Number(canvas.value?.height || 0);
  const nx = Math.max(marginX, Math.min(w - marginX, Number(x)));
  const ny = Math.max(marginY, Math.min(h - marginY, Number(y)));
  return { x: nx, y: ny };
}

function updateOrientationState() {
  if (!shouldEnforceOrientation) {
    currentOrientation.value = getCurrentOrientation();
    orientationMismatch.value = false;
    showOrientationPrompt.value = false;
    return;
  }
  const cur = getCurrentOrientation();
  currentOrientation.value = cur;
  const mismatch = cur !== 'unknown' && cur !== 'square' && cur !== desiredOrientation;
  orientationMismatch.value = mismatch;
  if (mismatch) {
    showOrientationPrompt.value = true;
    if (gameRunning && !isPaused.value) {
      pausedByOrientation = true;
      togglePause();
    }
    return;
  }
  if (pausedByOrientation && isPaused.value) {
    pausedByOrientation = false;
    togglePause();
  }
}

async function performOrientationTransition() {
  if (!orientationMismatch.value) {
    showOrientationPrompt.value = false;
    return;
  }
  orientationTransitioning.value = true;
  await new Promise((r) => setTimeout(r, 300));
  const lockRes = await requestBestEffortOrientationLock(desiredOrientation);
  const ok = await waitForOrientation(desiredOrientation, 2500);
  orientationTransitioning.value = false;
  updateOrientationState();
  if (ok) {
    showOrientationPrompt.value = false;
    setCanvasSize();
    return;
  }
  if (!lockRes.ok) {
    showToast('当前设备不支持该方向', 'warning', 4000);
  } else {
    showToast('请将设备旋转至正确方向', 'warning', 4000);
  }
}

let ctx = null;
let animationId = null;
let gameRunning = false;

const score = ref(0);
const health = ref(100);
const teammateHealth = ref(100);
const wallCount = ref(0);
const gameTime = ref(0);
let startTime = 0;
let lastTime = 0;
let mapOffset = 0;
const mapSpeed = 0.5;

let rngSeed = 1;
function seededRandom() {
  rngSeed = (rngSeed * 9301 + 49297) % 233280;
  return rngSeed / 233280;
}
const getSeededRandom = seededRandom;

const SIM_TICK_HZ = 60;
const SIM_TICK_MS = 1000 / SIM_TICK_HZ;
const useDeterministicNet = props.isMultiplayer;
let simTick = 0;
let simNowMs = 0;
let hostTick = 0;
let followerTargetTick = 0;
let lastTickSyncSentAtTick = -1;
let lastHashSentAtTick = -1;
let lastHostTickSeen = 0;
let lastAppliedEvtTick = 0;
let netPendingEventsByTick = new Map();
let hostEvtBuffer = [];
let hostSnapshotsByTick = new Map();
let followerHashesByTick = new Map();

function getGameNowMs() {
  return useDeterministicNet ? simNowMs : performance.now();
}

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
          // 弹幕弹：低沉炸裂音
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
let enemyIdSeq = 0;
let netEnemySpawnSeqTick = -1;
let netEnemySpawnSeq = 0;
let lastPlanePatchAt = 0;
let pendingRemovedEnemyIds = [];
let lastPlaneSnapshotTick = 0;
let netEnemyMap = new Map();
let netBossBulletMap = new Map();
let bossBulletIdSeq = 0;
let netBossBulletSeqTick = -1;
let netBossBulletSeq = 0;

// 环境效果
let environmentEffects = {
  gravityWell: { active: false, endTime: 0, x: 0, y: 0, radius: 180, pull: 0.65, speedMultiplier: 0.7 },
  emp: { active: false, endTime: 0 },
  updraft: { active: false, endTime: 0, speedMultiplier: 0.72, liftBandRatio: 0.72, liftPerFrame: 1.2 },
  shrapnelStorm: { active: false, endTime: 0, nextWaveAt: 0, intervalMs: 250, minCount: 3, maxCount: 5, damage: 1 }
};

// 屏幕震动
let screenShake = { active: false, intensity: 0, endTime: 0 };

function triggerShake(intensity, duration) {
  screenShake.active = true;
  screenShake.intensity = intensity;
  screenShake.endTime = getGameNowMs() + duration;
}

function activateEnvironmentEffect(type, options = {}) {
  const now = getGameNowMs();
  const t = String(type || '');
  const shouldBroadcast = options.broadcast !== false;
  let durationMs = 0;
  if (t === 'GRAVITY_WELL') {
    durationMs = 4000;
    environmentEffects.gravityWell.active = true;
    environmentEffects.gravityWell.endTime = now + durationMs;
    environmentEffects.gravityWell.x = canvas.value ? canvas.value.width / 2 : 0;
    environmentEffects.gravityWell.y = canvas.value ? canvas.value.height * 0.45 : 0;
  } else if (t === 'EMP') {
    durationMs = 3000;
    environmentEffects.emp.active = true;
    environmentEffects.emp.endTime = now + durationMs;
  } else if (t === 'UPDRAFT') {
    durationMs = 3500;
    environmentEffects.updraft.active = true;
    environmentEffects.updraft.endTime = now + durationMs;
  } else if (t === 'SHRAPNEL_STORM') {
    durationMs = 5000;
    environmentEffects.shrapnelStorm.active = true;
    environmentEffects.shrapnelStorm.endTime = now + durationMs;
    environmentEffects.shrapnelStorm.nextWaveAt = now + 40;
  } else {
    return false;
  }
  if (props.isMultiplayer && isHost && useDeterministicNet && shouldBroadcast) {
    netQueueEvent({ type: 'env_effect', tick: simTick, effect: t, durationMs });
  }
  return true;
}

function getEnemyMoveMultiplier() {
  let m = 1;
  if (environmentEffects.gravityWell.active) m *= environmentEffects.gravityWell.speedMultiplier;
  if (environmentEffects.updraft.active) m *= environmentEffects.updraft.speedMultiplier;
  return Math.max(0.2, m);
}

function getEnemyShootIntervalBase() {
  if (environmentEffects.emp.active) return 6000;
  return 2000;
}

function getBossAttackIntervalMultiplier() {
  if (environmentEffects.emp.active) return 2.2;
  return 1;
}
const MAX_BULLETS = 100;
const MAX_PARTICLES = 500; // 增加粒子上限以支持特效
const MAX_ENEMIES = 30;
const MAX_BOSS_BULLETS = 150;
const NET_SMOOTH_MS = 110;
let perfTier = 0;
let perfLastTs = 0;
let perfFrames = 0;

function getParticleCap() {
  if (perfTier >= 2) return 180;
  if (perfTier === 1) return 320;
  return MAX_PARTICLES;
}

function setNetTarget(entity, x, y) {
  if (!entity) return;
  if (!entity.net) entity.net = { x: entity.x, y: entity.y };
  entity.net.x = x;
  entity.net.y = y;
}

function updateNetEntity(entity, delta) {
  if (!entity?.net) return;
  const tx = entity.net.x;
  const ty = entity.net.y;
  const dx = tx - entity.x;
  const dy = ty - entity.y;
  const dist2 = dx * dx + dy * dy;
  const snapDist = Math.max(40, (entity.width || 35) * 2);
  if (dist2 > snapDist * snapDist) {
    entity.x = tx;
    entity.y = ty;
    return;
  }
  const t = Math.min(1, delta / NET_SMOOTH_MS);
  entity.x += dx * t;
  entity.y += dy * t;
}

function applyPlaneSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;
  if (!props.isMultiplayer) return;
  if (!Number.isFinite(snapshot.tick) || snapshot.tick <= lastPlaneSnapshotTick) return;
  lastPlaneSnapshotTick = snapshot.tick;

  if (Array.isArray(snapshot.players) && myUserId) {
    const mine = snapshot.players.find((p) => p && p.playerId === myUserId);
    if (mine && Number.isFinite(mine.wallCount)) wallCount.value = Math.max(0, Math.min(4, mine.wallCount));
  }

  if (isHost) return;

  const nextMap = new Map();
  const list = Array.isArray(snapshot.enemies) ? snapshot.enemies : [];
  for (const s of list) {
    if (!s || typeof s !== 'object') continue;
    if (s.state === 'dead') continue;
    const id = String(s.id ?? '');
    if (!id) continue;
    let enemy = netEnemyMap.get(id);
    if (!enemy) {
      enemy = new Enemy(Number(s.level) || 1);
      enemy.id = id;
      netEnemyMap.set(id, enemy);
    }
    enemy.level = Number(s.level) || enemy.level;
    if (typeof s.type === 'string') enemy.type = s.type;
    if (typeof s.color === 'string') enemy.color = s.color;
    if (Number.isFinite(s.maxHealth)) enemy.maxHealth = s.maxHealth;
    if (Number.isFinite(s.health)) enemy.health = s.health;
    setNetTarget(enemy, Number(s.x) || enemy.x, Number(s.y) || enemy.y);
    nextMap.set(id, enemy);
  }
  netEnemyMap = nextMap;
  enemies = Array.from(netEnemyMap.values());

  if (snapshot.boss && typeof snapshot.boss === 'object' && snapshot.boss.state !== 'dead') {
    if (!currentBoss) {
      currentBoss = new Boss(Number(snapshot.boss.phase) || 1, snapshot.boss.attackType || 'rain');
    }
    if (typeof snapshot.boss.attackType === 'string') currentBoss.attackType = snapshot.boss.attackType;
    if (Number.isFinite(snapshot.boss.width)) currentBoss.width = snapshot.boss.width;
    if (Number.isFinite(snapshot.boss.height)) currentBoss.height = snapshot.boss.height;
    if (typeof snapshot.boss.color === 'string') currentBoss.color = snapshot.boss.color;
    if (Number.isFinite(snapshot.boss.maxHealth)) currentBoss.maxHealth = snapshot.boss.maxHealth;
    if (Number.isFinite(snapshot.boss.health)) currentBoss.health = snapshot.boss.health;
    if (Array.isArray(snapshot.boss.healthBars)) currentBoss.healthBars = snapshot.boss.healthBars;
    setNetTarget(currentBoss, Number(snapshot.boss.x) || currentBoss.x, Number(snapshot.boss.y) || currentBoss.y);
  } else if (currentBoss) {
    currentBoss = null;
  }

  if (Array.isArray(snapshot.bossBullets)) {
    const next = new Map();
    for (const b of snapshot.bossBullets) {
      if (!b || typeof b !== 'object') continue;
      const id = String(b.id ?? '');
      if (!id) continue;
      let bb = netBossBulletMap.get(id);
      if (!bb) {
        bb = createBossBullet(Number(b.x) || 0, Number(b.y) || 0, Number(b.angle) || 0, Number(b.damage) || 1, Number(b.speed) || 4, !!b.isLaser, id);
        bb.x = Number(b.x) || bb.x;
        bb.y = Number(b.y) || bb.y;
      }
      bb.angle = Number.isFinite(b.angle) ? Number(b.angle) : bb.angle;
      bb.speed = Number.isFinite(b.speed) ? Number(b.speed) : bb.speed;
      bb.damage = Number.isFinite(b.damage) ? Number(b.damage) : bb.damage;
      bb.isLaser = !!b.isLaser;
      setNetTarget(bb, Number(b.x) || bb.x, Number(b.y) || bb.y);
      next.set(id, bb);
    }
    netBossBulletMap = next;
    bossBullets = Array.from(netBossBulletMap.values());
  } else {
    netBossBulletMap = new Map();
    bossBullets = [];
  }
}

function fnv1a32(str) {
  let h = 0x811c9dc5;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function buildNetStateHash() {
  const parts = [];
  const enemyList = Array.isArray(enemies) ? enemies.slice() : [];
  enemyList.sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
  for (const e of enemyList) {
    const id = String(e?.id || '');
    if (!id) continue;
    parts.push(`e:${id}:${Math.round(e.x)}:${Math.round(e.y)}:${Math.round(Number(e.health) || 0)}`);
  }
  if (currentBoss) {
    parts.push(`b:${Math.round(currentBoss.x)}:${Math.round(currentBoss.y)}:${Math.round(Number(currentBoss.health) || 0)}:${String(currentBoss.attackType || '')}:${Math.round(Number(currentBoss.bossShield) || 0)}`);
  } else {
    parts.push('b:-');
  }
  const bbList = Array.isArray(bossBullets) ? bossBullets.slice() : [];
  bbList.sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
  for (const bb of bbList) {
    const id = String(bb?.id || '');
    if (!id) continue;
    parts.push(`bb:${id}:${Math.round(bb.x)}:${Math.round(bb.y)}:${Math.round((Number(bb.angle) || 0) * 1000)}:${Math.round(Number(bb.speed) || 0)}:${Math.round(Number(bb.damage) || 0)}:${bb.isLaser ? 1 : 0}`);
  }
  return fnv1a32(parts.join('|'));
}

function buildNetStateSnapshot() {
  const enemyList = Array.isArray(enemies) ? enemies.slice() : [];
  enemyList.sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
  const bossSnapshot = currentBoss ? ({
    id: String(currentBoss.id || 'boss'),
    x: currentBoss.x,
    y: currentBoss.y,
    level: currentBoss.level,
    attackType: currentBoss.attackType,
    width: currentBoss.width,
    height: currentBoss.height,
    color: currentBoss.color,
    maxHealth: currentBoss.maxHealth,
    health: currentBoss.health,
    healthBars: currentBoss.healthBars,
    defense: currentBoss.defense,
    moveSpeed: currentBoss.moveSpeed,
    lastAttackTime: currentBoss.lastAttackTime,
    attackInterval: currentBoss.attackInterval,
    moveDirection: currentBoss.moveDirection,
    bossShield: currentBoss.bossShield,
    maxBossShield: currentBoss.maxBossShield,
    lastShieldTime: currentBoss.lastShieldTime,
    shieldInterval: currentBoss.shieldInterval,
    damage: currentBoss.damage
  }) : null;

  const bbList = Array.isArray(bossBullets) ? bossBullets.slice() : [];
  bbList.sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));

  return {
    tick: simTick,
    enemies: enemyList.map((e) => ({
      id: String(e.id || ''),
      x: e.x,
      y: e.y,
      level: e.level,
      type: e.type,
      color: e.color,
      maxHealth: e.maxHealth,
      health: e.health,
      defense: e.defense,
      speed: e.speed,
      horizontalSpeed: e.horizontalSpeed,
      pattern: e.pattern,
      canShoot: e.canShoot,
      shootPattern: e.shootPattern,
      lastShootTime: e.lastShootTime,
      startY: e.startY
    })),
    boss: bossSnapshot,
    bossBullets: bbList.map((bb) => ({
      id: String(bb.id || ''),
      x: bb.x,
      y: bb.y,
      angle: bb.angle,
      speed: bb.speed,
      damage: bb.damage,
      isLaser: !!bb.isLaser
    }))
  };
}

function applyNetStateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;

  if (Array.isArray(snapshot.enemies)) {
    const next = new Map();
    for (const s of snapshot.enemies) {
      if (!s || typeof s !== 'object') continue;
      const id = String(s.id ?? '');
      if (!id) continue;
      let enemy = next.get(id) || netEnemyMap.get(id);
      if (!enemy) {
        enemy = new Enemy(Number(s.level) || 1);
        enemy.id = id;
      }
      if (Number.isFinite(s.x)) enemy.x = s.x;
      if (Number.isFinite(s.y)) enemy.y = s.y;
      if (Number.isFinite(s.maxHealth)) enemy.maxHealth = s.maxHealth;
      if (Number.isFinite(s.health)) enemy.health = s.health;
      if (Number.isFinite(s.defense)) enemy.defense = s.defense;
      if (Number.isFinite(s.speed)) enemy.speed = s.speed;
      if (Number.isFinite(s.horizontalSpeed)) enemy.horizontalSpeed = s.horizontalSpeed;
      if (typeof s.pattern === 'string') enemy.pattern = s.pattern;
      if (typeof s.type === 'string') enemy.type = s.type;
      if (typeof s.color === 'string') enemy.color = s.color;
      enemy.canShoot = !!s.canShoot;
      if (typeof s.shootPattern === 'string') enemy.shootPattern = s.shootPattern;
      if (Number.isFinite(s.lastShootTime)) enemy.lastShootTime = s.lastShootTime;
      if (Number.isFinite(s.startY)) enemy.startY = s.startY;
      next.set(id, enemy);
    }
    netEnemyMap = next;
    enemies = Array.from(netEnemyMap.values());
  }

  if (snapshot.boss && typeof snapshot.boss === 'object') {
    const s = snapshot.boss;
    if (!currentBoss) currentBoss = new Boss(Number(s.level) || 1, s.attackType || 'rain');
    currentBoss.id = String(s.id || 'boss');
    if (Number.isFinite(s.x)) currentBoss.x = s.x;
    if (Number.isFinite(s.y)) currentBoss.y = s.y;
    if (Number.isFinite(s.width)) currentBoss.width = s.width;
    if (Number.isFinite(s.height)) currentBoss.height = s.height;
    if (typeof s.color === 'string') currentBoss.color = s.color;
    if (Number.isFinite(s.maxHealth)) currentBoss.maxHealth = s.maxHealth;
    if (Number.isFinite(s.health)) currentBoss.health = s.health;
    if (Array.isArray(s.healthBars)) currentBoss.healthBars = s.healthBars;
    if (Number.isFinite(s.defense)) currentBoss.defense = s.defense;
    if (Number.isFinite(s.moveSpeed)) currentBoss.moveSpeed = s.moveSpeed;
    if (Number.isFinite(s.lastAttackTime)) currentBoss.lastAttackTime = s.lastAttackTime;
    if (Number.isFinite(s.attackInterval)) currentBoss.attackInterval = s.attackInterval;
    if (Number.isFinite(s.moveDirection)) currentBoss.moveDirection = s.moveDirection;
    if (Number.isFinite(s.bossShield)) currentBoss.bossShield = s.bossShield;
    if (Number.isFinite(s.maxBossShield)) currentBoss.maxBossShield = s.maxBossShield;
    if (Number.isFinite(s.lastShieldTime)) currentBoss.lastShieldTime = s.lastShieldTime;
    if (Number.isFinite(s.shieldInterval)) currentBoss.shieldInterval = s.shieldInterval;
    if (Number.isFinite(s.damage)) currentBoss.damage = s.damage;
  } else {
    currentBoss = null;
  }

  if (Array.isArray(snapshot.bossBullets)) {
    const next = new Map();
    for (const s of snapshot.bossBullets) {
      if (!s || typeof s !== 'object') continue;
      const id = String(s.id ?? '');
      if (!id) continue;
      let bb = next.get(id) || netBossBulletMap.get(id);
      if (!bb) bb = createBossBullet(Number(s.x) || 0, Number(s.y) || 0, Number(s.angle) || 0, Number(s.damage) || 1, Number(s.speed) || 4, !!s.isLaser, id);
      if (Number.isFinite(s.x)) bb.x = s.x;
      if (Number.isFinite(s.y)) bb.y = s.y;
      if (Number.isFinite(s.angle)) bb.angle = s.angle;
      if (Number.isFinite(s.speed)) bb.speed = s.speed;
      if (Number.isFinite(s.damage)) bb.damage = s.damage;
      bb.isLaser = !!s.isLaser;
      next.set(id, bb);
    }
    netBossBulletMap = next;
    bossBullets = Array.from(netBossBulletMap.values());
  }
}

function netQueueEvent(evt) {
  if (!useDeterministicNet) return;
  if (!props.isMultiplayer || !isHost) return;
  if (!evt || typeof evt !== 'object') return;
  hostEvtBuffer.push(evt);
}

function netQueueBossBullet(bullet) {
  if (!useDeterministicNet) return;
  if (!props.isMultiplayer || !isHost) return;
  if (!bullet || typeof bullet !== 'object') return;
  if (!hostEvtBuffer) hostEvtBuffer = [];
  hostEvtBuffer.push({ type: 'spawn_boss_bullet', tick: simTick, bullet });
}

function netFlushHost(socket) {
  if (!socket || !props.roomData?.roomId) return;
  if (!useDeterministicNet || !props.isMultiplayer || !isHost) return;

  if (hostEvtBuffer.length > 0) {
    socket.emit('plane_evt', { roomId: props.roomData.roomId, payload: { tick: simTick, events: hostEvtBuffer } });
    hostEvtBuffer = [];
  }

  if (simTick - lastTickSyncSentAtTick >= 15) {
    lastTickSyncSentAtTick = simTick;
    socket.emit('plane_tick_sync', { roomId: props.roomData.roomId, payload: { tick: simTick } });
  }

  if (simTick - lastHashSentAtTick >= 60) {
    lastHashSentAtTick = simTick;
    const hash = buildNetStateHash();
    const snap = buildNetStateSnapshot();
    hostSnapshotsByTick.set(simTick, snap);
    if (hostSnapshotsByTick.size > 10) {
      const keys = Array.from(hostSnapshotsByTick.keys()).sort((a, b) => a - b);
      for (let i = 0; i < keys.length - 10; i++) hostSnapshotsByTick.delete(keys[i]);
    }
    socket.emit('plane_state_hash', { roomId: props.roomData.roomId, payload: { tick: simTick, hash } });
  }
}

function fastForwardEnemy(enemy, ticks) {
  const n = Math.max(0, Math.floor(Number(ticks) || 0));
  if (!enemy || !n) return;
  const baseTime = simNowMs - n * SIM_TICK_MS;
  for (let i = 0; i < n; i++) {
    enemy.update(baseTime + (i + 1) * SIM_TICK_MS, { shoot: false });
  }
}

function fastForwardBoss(boss, ticks) {
  const n = Math.max(0, Math.floor(Number(ticks) || 0));
  if (!boss || !n) return;
  const baseTime = simNowMs - n * SIM_TICK_MS;
  for (let i = 0; i < n; i++) {
    boss.update(baseTime + (i + 1) * SIM_TICK_MS, { attack: false });
  }
}

function fastForwardBossBullet(bb, ticks) {
  const n = Math.max(0, Math.floor(Number(ticks) || 0));
  if (!bb || !n) return;
  for (let i = 0; i < n; i++) bb.update();
}

function applyPlaneEvtPayload(payload) {
  if (!useDeterministicNet) return;
  if (!payload || typeof payload !== 'object') return;
  const tick = Number.isFinite(payload.tick) ? payload.tick : null;
  const events = Array.isArray(payload.events) ? payload.events : [];
  if (tick === null) return;
  if (tick > simTick + 120) return;
  if (tick > simTick) {
    const prev = netPendingEventsByTick.get(tick) || [];
    netPendingEventsByTick.set(tick, prev.concat(events));
    return;
  }
  for (const evt of events) applyPlaneEvt(evt, tick);
  lastAppliedEvtTick = Math.max(lastAppliedEvtTick, tick);
}

function drainPlaneEventsForTick(tick) {
  if (!useDeterministicNet) return;
  const list = netPendingEventsByTick.get(tick);
  if (!list || list.length === 0) return;
  netPendingEventsByTick.delete(tick);
  for (const evt of list) applyPlaneEvt(evt, tick);
  lastAppliedEvtTick = Math.max(lastAppliedEvtTick, tick);
}

function applyPlaneEvt(evt, evtTick) {
  if (!evt || typeof evt !== 'object') return;
  const type = String(evt.type || '');
  const lateBy = Math.max(0, simTick - (Number(evtTick) || 0));

  if (type === 'spawn_enemy') {
    const s = evt.enemy && typeof evt.enemy === 'object' ? evt.enemy : null;
    if (!s) return;
    const id = String(s.id ?? '');
    if (!id) return;
    let enemy = netEnemyMap.get(id);
    if (!enemy) {
      enemy = new Enemy(Number(s.level) || 1);
      enemy.id = id;
    }
    if (Number.isFinite(s.x)) enemy.x = s.x;
    if (Number.isFinite(s.y)) enemy.y = s.y;
    if (Number.isFinite(s.maxHealth)) enemy.maxHealth = s.maxHealth;
    if (Number.isFinite(s.health)) enemy.health = s.health;
    if (Number.isFinite(s.defense)) enemy.defense = s.defense;
    if (Number.isFinite(s.speed)) enemy.speed = s.speed;
    if (Number.isFinite(s.horizontalSpeed)) enemy.horizontalSpeed = s.horizontalSpeed;
    if (typeof s.pattern === 'string') enemy.pattern = s.pattern;
    if (typeof s.type === 'string') enemy.type = s.type;
    if (typeof s.color === 'string') enemy.color = s.color;
    enemy.canShoot = !!s.canShoot;
    if (typeof s.shootPattern === 'string') enemy.shootPattern = s.shootPattern;
    enemy.lastShootTime = Number.isFinite(s.lastShootTime) ? s.lastShootTime : (enemy.lastShootTime || 0);
    enemy.startY = Number.isFinite(s.startY) ? s.startY : (enemy.startY || enemy.y);
    netEnemyMap.set(id, enemy);
    enemies = Array.from(netEnemyMap.values());
    if (lateBy) fastForwardEnemy(enemy, lateBy);
    return;
  }

  if (type === 'remove_enemy') {
    const id = String(evt.enemyId ?? '');
    if (!id) return;
    netEnemyMap.delete(id);
    enemies = Array.from(netEnemyMap.values());
    return;
  }

  if (type === 'spawn_boss') {
    const s = evt.boss && typeof evt.boss === 'object' ? evt.boss : null;
    if (!s) return;
    if (!currentBoss) currentBoss = new Boss(Number(s.level) || 1, s.attackType || 'rain');
    currentBoss.id = String(s.id || 'boss');
    if (Number.isFinite(s.x)) currentBoss.x = s.x;
    if (Number.isFinite(s.y)) currentBoss.y = s.y;
    if (Number.isFinite(s.width)) currentBoss.width = s.width;
    if (Number.isFinite(s.height)) currentBoss.height = s.height;
    if (typeof s.color === 'string') currentBoss.color = s.color;
    if (Number.isFinite(s.maxHealth)) currentBoss.maxHealth = s.maxHealth;
    if (Number.isFinite(s.health)) currentBoss.health = s.health;
    if (Array.isArray(s.healthBars)) currentBoss.healthBars = s.healthBars;
    if (Number.isFinite(s.defense)) currentBoss.defense = s.defense;
    if (Number.isFinite(s.moveSpeed)) currentBoss.moveSpeed = s.moveSpeed;
    if (Number.isFinite(s.lastAttackTime)) currentBoss.lastAttackTime = s.lastAttackTime;
    if (Number.isFinite(s.attackInterval)) currentBoss.attackInterval = s.attackInterval;
    if (Number.isFinite(s.moveDirection)) currentBoss.moveDirection = s.moveDirection;
    if (Number.isFinite(s.bossShield)) currentBoss.bossShield = s.bossShield;
    if (Number.isFinite(s.maxBossShield)) currentBoss.maxBossShield = s.maxBossShield;
    if (Number.isFinite(s.lastShieldTime)) currentBoss.lastShieldTime = s.lastShieldTime;
    if (Number.isFinite(s.shieldInterval)) currentBoss.shieldInterval = s.shieldInterval;
    if (Number.isFinite(s.damage)) currentBoss.damage = s.damage;
    if (Number.isFinite(evt.bossLevel)) bossLevel = evt.bossLevel;
    if (lateBy) fastForwardBoss(currentBoss, lateBy);
    return;
  }

  if (type === 'remove_boss') {
    currentBoss = null;
    return;
  }

  if (type === 'spawn_boss_bullet') {
    const s = evt.bullet && typeof evt.bullet === 'object' ? evt.bullet : null;
    if (!s) return;
    const id = String(s.id ?? '');
    if (!id) return;
    let bb = netBossBulletMap.get(id);
    if (!bb) {
      bb = createBossBullet(Number(s.x) || 0, Number(s.y) || 0, Number(s.angle) || 0, Number(s.damage) || 1, Number(s.speed) || 4, !!s.isLaser, id);
      netBossBulletMap.set(id, bb);
    }
    if (Number.isFinite(s.x)) bb.x = s.x;
    if (Number.isFinite(s.y)) bb.y = s.y;
    if (Number.isFinite(s.angle)) bb.angle = s.angle;
    if (Number.isFinite(s.speed)) bb.speed = s.speed;
    if (Number.isFinite(s.damage)) bb.damage = s.damage;
    bb.isLaser = !!s.isLaser;
    bossBullets = Array.from(netBossBulletMap.values());
    if (lateBy) fastForwardBossBullet(bb, lateBy);
    return;
  }

  if (type === 'remove_boss_bullet') {
    const id = String(evt.bulletId ?? '');
    if (!id) return;
    netBossBulletMap.delete(id);
    bossBullets = Array.from(netBossBulletMap.values());
    return;
  }

  if (type === 'env_effect') {
    const effect = String(evt.effect || '');
    if (!effect) return;
    activateEnvironmentEffect(effect, { broadcast: false });
    return;
  }

  if (type === 'lightning') {
    applyLightningStrike({ broadcast: false });
    return;
  }

  if (type === 'damage') {
    const targetType = String(evt.targetType || '');
    const amount = Number(evt.amount) || 0;
    if (amount <= 0) return;
    if (targetType === 'enemy') {
      const id = String(evt.targetId ?? '');
      const enemy = netEnemyMap.get(id);
      if (!enemy) return;
      enemy.health = Math.max(0, (Number(enemy.health) || 0) - amount);
      if (enemy.health <= 0) {
        netEnemyMap.delete(id);
        enemies = Array.from(netEnemyMap.values());
      }
      return;
    }
    if (targetType === 'boss' && currentBoss) {
      currentBoss.health = Math.max(0, (Number(currentBoss.health) || 0) - amount);
      if (currentBoss.health <= 0) currentBoss = null;
      return;
    }
  }
}

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
  return b;
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
  missilePodLevel: 0,
  missilePodLastFire: 0,
  
  // 强攻属性
  damageBoost: 0, // 攻击力叠加 0-3
  damageBoostEndTime: 0,
  
  // 弹道类（互斥）
  bulletType: 'normal',
  bulletLevel: 0,
  
  maxWeaponLevel: 10,
  maxFireRate: 5
});

const teammateWeapon = ref({
  spreadLevel: 0,
  pierceLevel: 0,
  fireRate: 1,
  missilePodLevel: 0,
  damageBoost: 0,
  bulletType: 'normal',
  bulletLevel: 0
});

let hudSyncInterval = null;
function syncHUDState() {
  updatePlayerHUD(1, {
    returnButton: !props.isMultiplayer || isHost,
    gameTime: gameTime.value,
    score: score.value,
    bulletType: playerWeapon.value.bulletType,
    bulletLevel: playerWeapon.value.bulletLevel,
    attackPower: computeAttackPower(playerWeapon.value),
    spreadLevel: playerWeapon.value.spreadLevel,
    pierceLevel: playerWeapon.value.pierceLevel,
    pierceReductionPct: Math.round(computePierceDefenseIgnore(playerWeapon.value.pierceLevel) * 100),
    fireRate: playerWeapon.value.fireRate,
    missilePodLevel: playerWeapon.value.missilePodLevel,
    damageBoost: playerWeapon.value.damageBoost,
    health: health.value,
    pauseButton: true
  });
  if (props.isMultiplayer) {
    updatePlayerHUD(2, {
      returnButton: false,
      gameTime: gameTime.value,
      score: score.value,
      bulletType: teammateWeapon.value.bulletType,
      bulletLevel: teammateWeapon.value.bulletLevel,
      attackPower: computeAttackPower(teammateWeapon.value),
      spreadLevel: teammateWeapon.value.spreadLevel,
      pierceLevel: teammateWeapon.value.pierceLevel,
      pierceReductionPct: Math.round(computePierceDefenseIgnore(teammateWeapon.value.pierceLevel) * 100),
      fireRate: teammateWeapon.value.fireRate,
      missilePodLevel: teammateWeapon.value.missilePodLevel,
      damageBoost: teammateWeapon.value.damageBoost,
      health: teammateHealth.value,
      pauseButton: true
    });
  } else {
    updatePlayerHUD(2, { returnButton: false, gameTime: gameTime.value, score: 0, bulletType: 'normal', bulletLevel: 0, attackPower: 0, spreadLevel: 0, pierceLevel: 0, pierceReductionPct: 0, fireRate: 1, missilePodLevel: 0, damageBoost: 0, health: 0, pauseButton: false });
  }
}

// 计算总战机等级
function getTotalLevel() {
  const w = playerWeapon.value;
  return w.spreadLevel + w.pierceLevel + w.fireRate + w.bulletLevel;
}

// 道具类型
const POWERUP_COLOR_BULLET = '#7e57c2';
const POWERUP_COLOR_ATTR = '#26a69a';
const POWERUP_COLOR_ENV = '#90a4ae';

const POWERUP_TYPES = {
  // 属性类 - 最高权重 (约 45%)
  RAPID: { color: POWERUP_COLOR_ATTR, symbol: '射速', name: '射速', weight: 10 },
  SPREAD: { color: POWERUP_COLOR_ATTR, symbol: '散弹', name: '散弹', weight: 10 },
  PIERCE: { color: POWERUP_COLOR_ATTR, symbol: '破甲', name: '破甲', weight: 10 },
  MISSILE_PODS: { color: POWERUP_COLOR_ATTR, symbol: '导弹', name: '导弹', weight: 10 },
  
  // 特效型导弹（子弹类和特别道具） - 中等权重 (约 30%)
  EXPLOSIVE: { color: POWERUP_COLOR_BULLET, symbol: '爆炸', name: '爆炸', weight: 6 },
  LASER: { color: POWERUP_COLOR_BULLET, symbol: '激光', name: '激光', weight: 6 },
  BURST: { color: POWERUP_COLOR_BULLET, symbol: '弹幕', name: '弹幕', weight: 6 },
  PULSE: { color: POWERUP_COLOR_BULLET, symbol: '脉冲', name: '脉冲', weight: 4 },
  NEEDLE: { color: POWERUP_COLOR_BULLET, symbol: '针刺', name: '针刺', weight: 4 },
  ION: { color: POWERUP_COLOR_BULLET, symbol: '离子', name: '离子', weight: 6 },
  
  // 防护性与恢复类 - 较低权重 (约 25%)
  BOOST: { color: POWERUP_COLOR_ATTR, symbol: '攻击', name: '攻击', weight: 6 },
  HEALTH: { color: POWERUP_COLOR_ATTR, symbol: '回血', name: '回血', weight: 5 },
  SHIELD: { color: POWERUP_COLOR_ATTR, symbol: '护盾', name: '护盾', weight: 5 },
  BARRIER: { color: POWERUP_COLOR_ATTR, symbol: '护罩', name: '护罩', weight: 5 },
  
  // 环境型与全屏大招 - 最低权重 (极小概率)
  GRAVITY_WELL: { color: POWERUP_COLOR_ENV, symbol: '重井', name: '重力井', weight: 2 },
  EMP: { color: POWERUP_COLOR_ENV, symbol: '电磁', name: '电磁', weight: 2 },
  UPDRAFT: { color: POWERUP_COLOR_ENV, symbol: '气流', name: '气流', weight: 2 },
  SHRAPNEL_STORM: { color: POWERUP_COLOR_ENV, symbol: '破片', name: '破片', weight: 2 },
  LIGHTNING: { color: POWERUP_COLOR_ENV, symbol: '毁灭', name: '毁灭', weight: 1 },
  PLANE: { color: POWERUP_COLOR_ATTR, symbol: '强化', name: '强化', weight: 1 }
};

function pickOnlineLikeDropType() {
  const dropChance = 0.06;
  const r = getSeededRandom();
  if (r > dropChance) return null;
  const weightR = r / dropChance;
  if (weightR < 0.1) return 'RAPID';
  if (weightR < 0.2) return 'SPREAD';
  if (weightR < 0.3) return 'PIERCE';
  if (weightR < 0.4) return 'MISSILE_PODS';
  if (weightR < 0.46) return 'EXPLOSIVE';
  if (weightR < 0.52) return 'LASER';
  if (weightR < 0.58) return 'BURST';
  if (weightR < 0.62) return 'PULSE';
  if (weightR < 0.66) return 'NEEDLE';
  if (weightR < 0.72) return 'ION';
  if (weightR < 0.76) return 'BOOST';
  if (weightR < 0.8) return 'HEALTH';
  if (weightR < 0.85) return 'SHIELD';
  if (weightR < 0.9) return 'BARRIER';
  if (weightR < 0.91) return 'PLANE';
  if (weightR < 0.92) return 'LIGHTNING';
  if (weightR < 0.94) return 'GRAVITY_WELL';
  if (weightR < 0.96) return 'EMP';
  if (weightR < 0.98) return 'UPDRAFT';
  return 'SHRAPNEL_STORM';
}

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
  if (particles.length >= getParticleCap()) return;
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
    
    const weapon = this.isOther ? teammateWeapon.value : playerWeapon.value;
    const bulletType = weapon.bulletType;
    let wingColor = '#6bb6ff';
    if (bulletType === 'laser') wingColor = '#9c27b0';
    if (bulletType === 'explosive') wingColor = '#ff9800';
    if (bulletType === 'burst') wingColor = '#00bcd4';
    if (bulletType === 'pulse') wingColor = '#3f51b5';
    if (bulletType === 'needle') wingColor = '#8bc34a';
    if (bulletType === 'ion') wingColor = '#9fa8da';
    if (weapon.spreadLevel > 0) wingColor = '#2196f3';
    
    ctx.fillStyle = wingColor;
    ctx.fillRect(this.x - 20, this.y, 40, 8);

    if (!this.isOther && weapon.missilePodLevel > 0) {
      ctx.fillStyle = 'rgba(0, 230, 118, 0.95)';
      ctx.fillRect(this.x - 28, this.y + 6, 10, 6);
      ctx.fillRect(this.x + 18, this.y + 6, 10, 6);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(this.x - 27, this.y + 7, 8, 4);
      ctx.fillRect(this.x + 19, this.y + 7, 8, 4);
    }
    
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y - 5, 6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }

  moveTo(targetX, targetY) {
    this.x = targetX;
    this.y = targetY;
    this.x = Math.max(20, Math.min(canvas.value.width - 20, this.x));
    this.y = Math.max(30, Math.min(canvas.value.height - 30, this.y));
  }
}

function clampValue(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function normalizeAngleRad(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function aimAngle(fromX, fromY, toX, toY) {
  return Math.atan2(toX - fromX, -(toY - fromY));
}

function resolveEnemyById(id) {
  const key = String(id ?? '');
  if (!key) return null;
  if (netEnemyMap && typeof netEnemyMap.get === 'function') {
    const m = netEnemyMap.get(key);
    if (m) return m;
  }
  for (const e of enemies) {
    if (!e) continue;
    if (String(e.id ?? '') === key) return e;
  }
  return null;
}

function getNearestTarget(fromX, fromY) {
  let best = null;
  let bestD2 = Infinity;
  if (currentBoss && currentBoss.x !== undefined && currentBoss.y !== undefined) {
    const dx = currentBoss.x - fromX;
    const dy = currentBoss.y - fromY;
    const d2 = dx * dx + dy * dy;
    best = { type: 'boss', id: 'boss', x: currentBoss.x, y: currentBoss.y };
    bestD2 = d2;
  }
  for (const e of enemies) {
    if (!e || e.x === undefined || e.y === undefined) continue;
    const dx = e.x - fromX;
    const dy = e.y - fromY;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = { type: 'enemy', id: String(e.id ?? ''), x: e.x, y: e.y };
    }
  }
  return best;
}

function resolveHomingTarget(bullet) {
  if (!bullet || bullet.bulletType !== 'homing') return null;
  const t = String(bullet.homingTargetType || '');
  if (t === 'boss') {
    if (currentBoss && currentBoss.x !== undefined && currentBoss.y !== undefined) {
      return { x: currentBoss.x, y: currentBoss.y };
    }
  } else if (t === 'enemy') {
    const e = resolveEnemyById(bullet.homingTargetId);
    if (e && e.x !== undefined && e.y !== undefined) return { x: e.x, y: e.y };
  }
  const near = getNearestTarget(bullet.x, bullet.y);
  return near ? { x: near.x, y: near.y } : null;
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
      this.gravity = 0.17;
      const v = this.speed * 1.25;
      this.vx = Math.sin(angle) * v;
      this.vy = -Math.cos(angle) * v;
    } else if (bulletType === 'explosive') {
      this.width = 10;
      this.height = 14;
      this.damage = 2 + bulletLevel;
      this.hitRadius = 7;
      this.swayFreq = 3; // 摇摆频率
      this.swayAmp = 10; // 摇摆振幅
    } else if (bulletType === 'pulse') {
      this.width = 8;
      this.height = 20;
      this.damage = 2 + bulletLevel;
      this.hitRadius = 7;
      this.speed = config.bulletSpeed * 1.35;
    } else if (bulletType === 'needle') {
      this.width = 3;
      this.height = 24;
      this.damage = 1 + bulletLevel;
      this.hitRadius = 5;
      this.speed = config.bulletSpeed * 1.6;
    } else if (bulletType === 'ion') {
      this.width = 14;
      this.height = 14;
      this.damage = 3 + Math.floor(bulletLevel * 0.5);
      this.hitRadius = 9;
      this.speed = config.bulletSpeed * 0.9;
    } else if (bulletType === 'homing') {
      this.width = 8;
      this.height = 18;
      this.damage = 1;
      this.hitRadius = 9;
      this.speed = config.bulletSpeed * 1.15;
      this.turnRate = 7;
      this.maxLife = 5;
    } else {
      this.width = 5;
      this.height = 15;
      this.damage = 1;
      this.hitRadius = 5;
    }
    
    this.pierce = pierceLevel > 0;
    this.pierceCount = 0;
    this.maxPierce = Math.min(3 + pierceLevel, 6); // max 6
    this.defenseIgnore = computePierceDefenseIgnore(pierceLevel);
    this.active = true;
  }

  // 对象池重置方法
  reset(x, y, bulletType, bulletLevel, spreadLevel, pierceLevel, angle) {
    this.x = x;
    this.y = y;
    this.startX = x;
    this.startY = y;
    this.bulletType = bulletType;
    this.bulletLevel = Math.min(bulletLevel, 10);
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
      this.gravity = 0.17;
      const v = this.speed * 1.25;
      this.vx = Math.sin(angle) * v;
      this.vy = -Math.cos(angle) * v;
    } else if (bulletType === 'explosive') {
      this.width = 10;
      this.height = 14;
      this.damage = 2 + this.bulletLevel;
      this.hitRadius = 7;
      this.swayFreq = 3;
      this.swayAmp = 10;
    } else if (bulletType === 'pulse') {
      this.width = 8;
      this.height = 20;
      this.damage = 2 + this.bulletLevel;
      this.hitRadius = 7;
      this.speed = config.bulletSpeed * 1.35;
    } else if (bulletType === 'needle') {
      this.width = 3;
      this.height = 24;
      this.damage = 1 + this.bulletLevel;
      this.hitRadius = 5;
      this.speed = config.bulletSpeed * 1.6;
    } else if (bulletType === 'ion') {
      this.width = 14;
      this.height = 14;
      this.damage = 3 + Math.floor(this.bulletLevel * 0.5);
      this.hitRadius = 9;
      this.speed = config.bulletSpeed * 0.9;
    } else if (bulletType === 'homing') {
      this.width = 8;
      this.height = 18;
      this.damage = 1;
      this.hitRadius = 9;
      this.speed = config.bulletSpeed * 1.15;
      this.turnRate = 7;
      this.maxLife = 5;
    } else {
      this.width = 5;
      this.height = 15;
      this.damage = 1;
      this.hitRadius = 5;
    }
    
    this.pierce = this.pierceLevel > 0;
    this.pierceCount = 0;
    this.maxPierce = Math.min(3 + this.pierceLevel, 6); // max 6
    this.defenseIgnore = computePierceDefenseIgnore(this.pierceLevel);
  }

  update(delta) {
    this.time += delta / 1000;
    
    if (this.bulletType === 'homing') {
      const target = resolveHomingTarget(this);
      if (target) {
        const desired = aimAngle(this.x, this.y, target.x, target.y);
        const diff = normalizeAngleRad(desired - (this.angle || 0));
        const maxTurn = (Number(this.turnRate) || 6) * (delta / 1000);
        this.angle = (this.angle || 0) + clampValue(diff, -maxTurn, maxTurn);
      }
      this.x += Math.sin(this.angle || 0) * this.speed * 1.6;
      this.y -= Math.cos(this.angle || 0) * this.speed * 1.6;
      const maxLife = Number(this.maxLife) || 5;
      if (this.time > maxLife) this.active = false;
    } else if (this.bulletType === 'burst') {
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
    } else if (this.bulletType === 'pulse') {
      this.x += Math.sin(this.angle) * this.speed * 0.5;
      this.y -= Math.cos(this.angle) * this.speed * 1.35;
    } else if (this.bulletType === 'needle') {
      this.x += Math.sin(this.angle) * this.speed * 0.2;
      this.y -= Math.cos(this.angle) * this.speed * 1.7;
    } else if (this.bulletType === 'ion') {
      this.x += Math.sin(this.time * 9 + this.startX * 0.01) * 0.7;
      this.y -= Math.cos(this.angle) * this.speed * 0.95;
    } else {
      if (this.angle !== 0) {
        this.x += Math.sin(this.angle) * this.speed * 0.3;
      }
      this.y -= Math.cos(this.angle) * this.speed;
    }

    let trailChance = perfTier >= 2 ? 0.06 : (perfTier === 1 ? 0.12 : 0.22);
    if (props.isMultiplayer) trailChance *= 0.7;
    if (particles.length < getParticleCap() - 30 && getSeededRandom() < trailChance) {
      const color = this.bulletType === 'burst' ? '#5c6bc0' :
                   (this.bulletType === 'laser' ? '#00FFFF' :
                   (this.bulletType === 'pulse' ? '#3f51b5' :
                   (this.bulletType === 'needle' ? '#8bc34a' :
                   (this.bulletType === 'ion' ? '#9fa8da' :
                   (this.bulletType === 'homing' ? '#00e676' : '#FFFFFF')))));
      createParticle(this.x, this.y, color, 0.5, 'trail');
    }
  }

  draw() {
    ctx.save();
    if (this.isOther) {
      ctx.globalAlpha = 0.5;
    }
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    if (this.bulletType === 'homing') {
      ctx.fillStyle = 'rgba(0, 230, 118, 0.95)';
      ctx.beginPath();
      ctx.moveTo(0, -this.height / 2);
      ctx.lineTo(-this.width / 2, this.height / 2);
      ctx.lineTo(this.width / 2, this.height / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(-1, -2, 2, 6);
      if (perfTier === 0) {
        ctx.fillStyle = 'rgba(255, 165, 0, 0.7)';
        ctx.fillRect(-2, this.height / 2 - 2, 4, 6);
      }
    } else if (this.bulletType === 'laser') {
      if (perfTier >= 1) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0, 255, 255, 0.7)';
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
      } else {
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00FFFF';
        
        const grad = ctx.createLinearGradient(0, -this.height / 2, 0, this.height / 2);
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.2, '#00FFFF');
        grad.addColorStop(1, 'rgba(0, 255, 255, 0.2)');
        
        ctx.fillStyle = grad;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-this.width / 4, -this.height / 2, this.width / 2, this.height / 3);
      }
    } else if (this.bulletType === 'burst') {
      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, this.width / 2);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.4, '#5c6bc0');
      grad.addColorStop(1, 'rgba(92, 107, 192, 0)');
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
    } else if (this.bulletType === 'pulse') {
      ctx.fillStyle = '#3f51b5';
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
      ctx.fillStyle = '#c5cae9';
      ctx.fillRect(-1, -this.height / 2, 2, this.height);
    } else if (this.bulletType === 'needle') {
      ctx.fillStyle = '#8bc34a';
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
      ctx.fillStyle = '#f1f8e9';
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, 4);
    } else if (this.bulletType === 'ion') {
      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, this.width / 2);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, '#9fa8da');
      grad.addColorStop(1, 'rgba(159, 168, 218, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, this.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = this.pierce ? '#ffeb3b' : '#4caf50';
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
    }
    ctx.restore();
  }

  // 注意：之前的无参数 update() 方法被重命名合并到 update(delta) 中了。
  
  // 检查是否击中目标
  checkHit(targetX, targetY, targetRadius = 20) {
    const dist = Math.sqrt((this.x - targetX) ** 2 + (this.y - targetY) ** 2);
    return dist < (this.hitRadius + targetRadius);
  }
  
  explode(excludeTarget) {
    try {
      if (this.bulletType === 'explosive') {
        const excludeRef = excludeTarget || null;
        // 创建敌机数组的副本，避免在遍历时修改
        const enemiesCopy = [...enemies];
        const explosionRadius = 60 + this.bulletLevel * 10; // 爆炸半径随等级增加
        
        enemiesCopy.forEach(enemy => {
          if (excludeRef && enemy === excludeRef) return;
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
    
    let healthMultiplier = 1;
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
      this.defense = Math.min(0.3 + (level - 4) * 0.05, 0.5);
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

  update(currentTime, opts = {}) {
    const speedMultiplier = getEnemyMoveMultiplier();
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
    
    const shootInterval = getEnemyShootIntervalBase();
    const allowShoot = opts?.shoot !== false;
    if (allowShoot && this.canShoot && currentTime - this.lastShootTime > shootInterval && this.y > 50 && this.y < canvas.value.height - 100) {
      this.shoot();
      this.lastShootTime = currentTime;
    }
  }
  
  shoot() {
    if (bossBullets.length >= MAX_BOSS_BULLETS) return;
    
    if (this.shootPattern === 'single') {
      // 单发
      spawnBossBullet(this.x, this.y + 15, Math.PI / 2, 5, 4);
    } else if (this.shootPattern === 'double') {
      // 双发
      spawnBossBullet(this.x - 10, this.y + 15, Math.PI / 2, 5, 4);
      spawnBossBullet(this.x + 10, this.y + 15, Math.PI / 2, 5, 4);
    } else if (this.shootPattern === 'triple') {
      // 三发
      spawnBossBullet(this.x - 12, this.y + 15, Math.PI / 2, 5, 4);
      spawnBossBullet(this.x, this.y + 15, Math.PI / 2, 5, 4);
      spawnBossBullet(this.x + 12, this.y + 15, Math.PI / 2, 5, 4);
    } else if (this.shootPattern === 'spread') {
      // 扇形
      for (let i = -1; i <= 1; i++) {
        const angle = Math.PI / 2 + (i * Math.PI / 12);
        spawnBossBullet(this.x, this.y + 15, angle, 5, 4);
      }
    }
  }
  
  checkHit(bulletX, bulletY, bulletRadius = 5) {
    const distX = Math.abs(this.x - bulletX);
    const distY = Math.abs(this.y - bulletY);
    
    // 如果敌机是重型或精英型（通常更大）
    const hitBoxWidth = this.type === 'heavy' ? 20 : (this.type === 'elite' ? 18 : 15);
    const hitBoxHeight = this.type === 'heavy' ? 20 : 15;
    
    return distX < (hitBoxWidth + bulletRadius) && distY < (hitBoxHeight + bulletRadius);
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
    
    const totalBars = Math.max(1, Math.floor(Number(this.healthBars) || 1));
    if (totalBars > 1) {
      const unit = 2000;
      const hp = Math.max(0, Number(this.health) || 0);
      const seg = hp > 0 ? Math.floor((hp - 1) / unit) : 0;
      const barHealth = hp > 0 ? Math.max(0, Math.min(unit, hp - seg * unit)) : 0;
      const barHealthPercent = barHealth / unit;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(barX, barY, barWidth, barHeight);

      const barColor = barHealthPercent > 0.5 ? '#4caf50' : barHealthPercent > 0.25 ? '#ff9800' : '#f44336';
      ctx.fillStyle = barColor;
      ctx.fillRect(barX, barY, barWidth * barHealthPercent, barHeight);

      const badgeText = `×${totalBars}`;
      ctx.save();
      ctx.font = 'bold 14px Arial';
      const tw = ctx.measureText(badgeText).width;
      const padX = 8;
      const bx = barX + barWidth + 10;
      const by = barY + barHeight / 2;
      const bw = tw + padX * 2;
      const bh = 18;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      const br = 9;
      const ry = by - bh / 2;
      ctx.beginPath();
      ctx.moveTo(bx + br, ry);
      ctx.lineTo(bx + bw - br, ry);
      ctx.quadraticCurveTo(bx + bw, ry, bx + bw, ry + br);
      ctx.lineTo(bx + bw, ry + bh - br);
      ctx.quadraticCurveTo(bx + bw, ry + bh, bx + bw - br, ry + bh);
      ctx.lineTo(bx + br, ry + bh);
      ctx.quadraticCurveTo(bx, ry + bh, bx, ry + bh - br);
      ctx.lineTo(bx, ry + br);
      ctx.quadraticCurveTo(bx, ry, bx + br, ry);
      ctx.fill();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#ffd700';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bx + padX, by);
      ctx.restore();
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

  update(currentTime, opts = {}) {
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
    
    const allowAttack = opts?.attack !== false;
    if (allowAttack && currentTime - this.lastAttackTime > this.attackInterval * getBossAttackIntervalMultiplier()) {
      this.attack(currentTime);
      this.lastAttackTime = currentTime;
    }
  }

  attack(currentTime) {
    if (sounds.bossSkill) sounds.bossSkill();
    
    if (this.attackType === 'spiral') {
      // Boss 1: 螺旋 - 增加到12发
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + Number(currentTime || 0) * 0.005;
        spawnBossBullet(this.x, this.y + 20, angle, this.damage);
      }
    } else if (this.attackType === 'spread') {
      // Boss 2: 扇形 - 增加到9发
      for (let i = -4; i <= 4; i++) {
        const angle = Math.PI / 2 + (i * Math.PI / 10);
        spawnBossBullet(this.x, this.y + 20, angle, this.damage);
      }
    } else if (this.attackType === 'circle') {
      // Boss 3: 圆形 - 增加到16发
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        spawnBossBullet(this.x, this.y + 20, angle, this.damage);
      }
    } else if (this.attackType === 'shield-gen') {
      // Boss 4: 护盾生成 - 普通扇形攻击
      for (let i = -3; i <= 3; i++) {
        const angle = Math.PI / 2 + (i * Math.PI / 12);
        spawnBossBullet(this.x, this.y + 20, angle, this.damage, 5);
      }
    } else if (this.attackType === 'rain') {
      // Boss 5: 全屏子弹雨 - 减少一半覆盖面积
      const bulletCount = 10 + this.level; // 子弹数量减半
      const centerX = canvas.value.width / 2;
      const spreadWidth = canvas.value.width / 2; // 覆盖屏幕一半宽度
      for (let i = 0; i < bulletCount; i++) {
        const randomX = centerX + (getSeededRandom() - 0.5) * spreadWidth;
        const randomAngle = Math.PI / 2 + (getSeededRandom() - 0.5) * Math.PI / 6; // 大致向下，略有偏移
        spawnBossBullet(randomX, -20, randomAngle, this.damage, 6);
      }
    } else if (this.attackType === 'small-fast') {
      // Boss 6: 小而快，快速连射
      for (let i = 0; i < 5; i++) {
        const angle = Math.PI / 2 + (i - 2) * Math.PI / 12;
        spawnBossBullet(this.x, this.y + 20, angle, this.damage, 7);
      }
    } else if (this.attackType === 'big-spread') {
      // Boss 7: 超大弹幕 - 增加到13发
      for (let i = -6; i <= 6; i++) {
        const angle = Math.PI / 2 + (i * Math.PI / 8);
        spawnBossBullet(this.x, this.y + 20, angle, this.damage);
      }
    } else if (this.attackType === 'laser-line') {
      // Boss 8: 激光线 - 增加到5条
      for (let i = -2; i <= 2; i++) {
        spawnBossBullet(this.x + i * 25, this.y + 20, Math.PI / 2, this.damage, 12, true);
      }
    } else if (this.attackType === 'buff') {
      // Boss 9: buff boss，双重攻击
      for (let i = -3; i <= 3; i++) {
        const angle = Math.PI / 2 + (i * Math.PI / 14);
        spawnBossBullet(this.x, this.y + 20, angle, this.damage);
      }
      // 额外圆形弹幕
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        spawnBossBullet(this.x, this.y + 20, angle, this.damage, 3);
      }
    }
  }
}

class BossBullet {
  constructor(x, y, angle, damage, speed = 4, isLaser = false, id = null) {
    this.id = id || `bb_${++bossBulletIdSeq}`;
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

function createBossBullet(x, y, angle, damage, speed = 4, isLaser = false, id = null) {
  return new BossBullet(x, y, angle, damage, speed, isLaser, id);
}

function spawnBossBullet(x, y, angle, damage, speed = 4, isLaser = false, id = null) {
  let bulletId = id;
  if (!bulletId && props.isMultiplayer && isHost && useDeterministicNet) {
    if (netBossBulletSeqTick !== simTick) {
      netBossBulletSeqTick = simTick;
      netBossBulletSeq = 0;
    }
    netBossBulletSeq += 1;
    bulletId = `bb_${simTick}_${netBossBulletSeq}`;
  }
  const bb = createBossBullet(x, y, angle, damage, speed, isLaser, bulletId);
  bossBullets.push(bb);
  if (props.isMultiplayer && useDeterministicNet) {
    netBossBulletMap.set(String(bb.id || ''), bb);
  }
  if (props.isMultiplayer && isHost && useDeterministicNet) {
    netQueueBossBullet({ id: String(bb.id || ''), x, y, angle, damage, speed, isLaser: !!isLaser });
  }
  return bb;
}

class PowerUp {
  constructor(type, x, y) {
    this.x = typeof x === 'number' ? x : (getSeededRandom() * (canvas.value.width - 40) + 20);
    this.y = typeof y === 'number' ? y : -30;
    const normalizedType = type === 'HEAL' ? 'HEALTH' : type;
    this.type = normalizedType;
    this.speed = 2;
    this.size = 25;
    this.config = POWERUP_TYPES[normalizedType] || POWERUP_TYPES.HEALTH;
  }

  draw() {
    if (!this.config) return;
    ctx.fillStyle = this.config.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.fillStyle = '#fff';
    const sym = String(this.config.symbol || '');
    const fontSize = sym.length >= 2 ? 13 : 16;
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sym, this.x, this.y);
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

function drawEnvironmentEffects(currentTime) {
  if (environmentEffects.gravityWell.active) {
    const g = environmentEffects.gravityWell;
    const gradient = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.radius);
    gradient.addColorStop(0, 'rgba(156, 39, 176, 0.34)');
    gradient.addColorStop(1, 'rgba(156, 39, 176, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  if (environmentEffects.emp.active) {
    ctx.fillStyle = 'rgba(103, 58, 183, 0.14)';
    ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);
  }
  if (environmentEffects.updraft.active) {
    const h = canvas.value.height;
    const lineAlpha = 0.18 + 0.08 * Math.sin(currentTime * 0.015);
    ctx.strokeStyle = `rgba(0, 188, 212, ${lineAlpha})`;
    for (let i = 0; i < 12; i++) {
      const x = (canvas.value.width / 12) * i + ((currentTime * 0.06 + i * 11) % 16);
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x, h - 110);
      ctx.stroke();
    }
  }
  if (environmentEffects.shrapnelStorm.active) {
    for (let i = 0; i < 6; i++) {
      const x = (getSeededRandom() * canvas.value.width);
      const y = (getSeededRandom() * 90);
      ctx.fillStyle = 'rgba(255, 235, 59, 0.55)';
      ctx.fillRect(x, y, 2, 7);
    }
  }
}

function updateEnvironmentEffects(currentTime, delta, simulateWorld, socket) {
  if (environmentEffects.gravityWell.active && currentTime > environmentEffects.gravityWell.endTime) environmentEffects.gravityWell.active = false;
  if (environmentEffects.emp.active && currentTime > environmentEffects.emp.endTime) environmentEffects.emp.active = false;
  if (environmentEffects.updraft.active && currentTime > environmentEffects.updraft.endTime) environmentEffects.updraft.active = false;
  if (environmentEffects.shrapnelStorm.active && currentTime > environmentEffects.shrapnelStorm.endTime) environmentEffects.shrapnelStorm.active = false;
  if (!simulateWorld) return;
  const frameScale = Math.max(0.5, Math.min(2, delta / 16.67));
  if (environmentEffects.updraft.active) {
    const up = environmentEffects.updraft;
    const bandY = canvas.value.height * up.liftBandRatio;
    for (const enemy of enemies) {
      if (!enemy) continue;
      if (enemy.y > bandY) enemy.y -= up.liftPerFrame * frameScale;
    }
  }
  if (environmentEffects.gravityWell.active) {
    const g = environmentEffects.gravityWell;
    for (const enemy of enemies) {
      if (!enemy) continue;
      const dx = g.x - enemy.x;
      const dy = g.y - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (!dist || dist > g.radius) continue;
      const k = (1 - dist / g.radius) * g.pull * frameScale;
      enemy.x += (dx / dist) * k;
      enemy.y += (dy / dist) * k * 0.75;
    }
  }
  if (!environmentEffects.shrapnelStorm.active) return;
  const s = environmentEffects.shrapnelStorm;
  if (currentTime < s.nextWaveAt) return;
  s.nextWaveAt = currentTime + s.intervalMs;
  const waveCount = Math.floor(s.minCount + getSeededRandom() * (s.maxCount - s.minCount + 1));
  for (let i = 0; i < waveCount; i++) {
    if (enemies.length <= 0 && !currentBoss) break;
    if (enemies.length > 0) {
      const idx = Math.max(0, Math.min(enemies.length - 1, Math.floor(getSeededRandom() * enemies.length)));
      const target = enemies[idx];
      if (target) {
        target.health = Math.max(0, (Number(target.health) || 0) - s.damage);
        createExplosion(target.x, target.y, '#ffee58');
        damageIndicators.push(new DamageIndicator(target.x, target.y, s.damage, false));
        if (target.health <= 0) {
          const enemyScore = Math.floor((10 + target.level * 10) * getScoreMultiplier());
          score.value += enemyScore;
          if (!props.isMultiplayer) {
            const dropType = pickOnlineLikeDropType();
            if (dropType) powerUps.push(new PowerUp(dropType, target.x, target.y));
          }
          if (socket && props.roomData?.roomId && target.id) {
            socket.emit('plane_enemy_killed', { roomId: props.roomData.roomId, enemyId: target.id, x: target.x, y: target.y, difficulty: props.difficulty });
          }
          if (props.isMultiplayer && isHost && useDeterministicNet && target.id) {
            netQueueEvent({ type: 'remove_enemy', tick: simTick, enemyId: String(target.id) });
            netEnemyMap.delete(String(target.id));
          } else if (socket && props.roomData?.roomId && target.id) {
            socket.emit('plane_enemy_remove', { roomId: props.roomData.roomId, enemyId: target.id });
          }
          enemies.splice(idx, 1);
        }
      }
    } else if (currentBoss) {
      const dmg = s.damage;
      currentBoss.health = Math.max(1, (Number(currentBoss.health) || 0) - dmg);
      createExplosion(currentBoss.x, currentBoss.y, '#ffee58');
      damageIndicators.push(new DamageIndicator(currentBoss.x, currentBoss.y, dmg, false));
      if (props.isMultiplayer && isHost && useDeterministicNet) {
        netQueueEvent({ type: 'damage', tick: simTick, targetType: 'boss', targetId: 'boss', amount: dmg });
      } else if (socket && props.roomData?.roomId) {
        socket.emit('plane_damage', { roomId: props.roomData.roomId, damage: { targetType: 'boss', amount: dmg } });
      }
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

function applyLightningStrike(options = {}) {
  const shouldBroadcast = options.broadcast !== false;

  for (const enemy of enemies) {
    if (!enemy) continue;
    const enemyScore = Math.floor((10 + (Number(enemy.level) || 0) * 10) * getScoreMultiplier());
    score.value += enemyScore;
    createExplosion(enemy.x, enemy.y, '#ffeb3b');
  }

  enemies = [];
  if (props.isMultiplayer && useDeterministicNet) netEnemyMap = new Map();

  if (props.isMultiplayer && isHost && useDeterministicNet && shouldBroadcast) {
    netQueueEvent({ type: 'lightning', tick: simTick });
  }
}

function applyPowerUp(type) {
  const spreadMax = 6;
  const pierceMax = 6;
  const bulletMax = props.isMultiplayer ? playerWeapon.value.maxWeaponLevel : 10;
  if (type === 'HEALTH') {
    healPlayer(30);
  } else if (type === 'BOOST') {
    // 强攻：增加伤害叠加，最多3层，持续10秒
    playerWeapon.value.damageBoost = Math.min(3, playerWeapon.value.damageBoost + 1);
    playerWeapon.value.damageBoostEndTime = getGameNowMs() + 10000;
  } else if (type === 'PLANE') {
    // 战机强化：所有等级+1
    playerWeapon.value.bulletLevel = Math.min(bulletMax, playerWeapon.value.bulletLevel + 1);
    playerWeapon.value.spreadLevel = Math.min(spreadMax, playerWeapon.value.spreadLevel + 1);
    playerWeapon.value.pierceLevel = Math.min(pierceMax, playerWeapon.value.pierceLevel + 1);
  } else if (type === 'SPREAD') {
    playerWeapon.value.spreadLevel = Math.min(spreadMax, playerWeapon.value.spreadLevel + 1);
  } else if (type === 'PIERCE') {
    playerWeapon.value.pierceLevel = Math.min(pierceMax, playerWeapon.value.pierceLevel + 1);
  } else if (type === 'MISSILE_PODS') {
    playerWeapon.value.missilePodLevel = Math.min(8, (playerWeapon.value.missilePodLevel || 0) + 1);
  } else if (type === 'EXPLOSIVE' || type === 'LASER' || type === 'BURST' || type === 'PULSE' || type === 'NEEDLE' || type === 'ION') {
    const bulletType = type.toLowerCase();
    const currentLevel = Math.min(bulletMax, Math.max(1, playerWeapon.value.bulletLevel));
    if (playerWeapon.value.bulletType !== bulletType) {
      playerWeapon.value.bulletType = bulletType;
      playerWeapon.value.bulletLevel = currentLevel;
    } else {
      playerWeapon.value.bulletLevel = Math.min(bulletMax, playerWeapon.value.bulletLevel + 1);
    }
  } else if (type === 'RAPID') {
    playerWeapon.value.fireRate = Math.min(playerWeapon.value.maxFireRate, playerWeapon.value.fireRate + 1);
  } else if (type === 'SHIELD') {
    if (player) player.shield = Math.min(5, player.shield + 3);
  } else if (type === 'LIGHTNING') {
    if (props.isMultiplayer && useDeterministicNet && !isHost) {
      const socket = getSocket();
      if (socket && props.roomData?.roomId) {
        socket.emit('game_action', { roomId: props.roomData.roomId, action: { type: 'env_powerup', powerUp: type } });
      }
      return;
    }
    applyLightningStrike();
  } else if (type === 'GRAVITY_WELL' || type === 'EMP' || type === 'UPDRAFT' || type === 'SHRAPNEL_STORM') {
    if (props.isMultiplayer && useDeterministicNet && !isHost) {
      const socket = getSocket();
      if (socket && props.roomData?.roomId) {
        socket.emit('game_action', {
          roomId: props.roomData.roomId,
          action: { type: 'env_powerup', powerUp: type }
        });
      }
    } else {
      activateEnvironmentEffect(type);
    }
  } else if (type === 'BARRIER') {
    wallCount.value = applyWallPickup(4);
    if (props.isMultiplayer) {
      const socket = getSocket();
      if (socket && props.roomData?.roomId) {
        socket.emit('plane_player_snapshot', { roomId: props.roomData.roomId, snapshot: { wallCount: wallCount.value } });
      }
    }
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
  if (particles.length >= getParticleCap()) return;
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

function toCanvasXY(clientX, clientY) {
  if (!canvas.value) return { x: 0, y: 0 };
  const rect = canvas.value.getBoundingClientRect();
  const scaleX = canvas.value.width / rect.width;
  const scaleY = canvas.value.height / rect.height;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

// 暂停功能
const isPaused = ref(false);
let pausedAt = 0; // 记录暂停时的时间

function togglePause() {
  if (!isPaused.value) {
    // 暂停游戏
    isPaused.value = true;
    pausedAt = performance.now();
  } else {
    if (!useDeterministicNet) {
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
    }
    isPaused.value = false;
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
  if (useDeterministicNet) {
    simTick = 0;
    simNowMs = 0;
    lastTime = 0;
    startTime = 0;
  } else {
    startTime = performance.now();
  }
  
  // 清空所有数组
  bullets = [];
  enemies = [];
  particles = [];
  bossBullets = [];
  powerUps = [];
  netEnemyMap = new Map();
  netBossBulletMap = new Map();
  netPendingEventsByTick = new Map();
  hostEvtBuffer = [];
  hostSnapshotsByTick = new Map();
  followerHashesByTick = new Map();
  
  // 重置防护罩和效果
  wallCount.value = 0;
  environmentEffects.gravityWell.active = false;
  environmentEffects.emp.active = false;
  environmentEffects.updraft.active = false;
  environmentEffects.shrapnelStorm.active = false;
  
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
    missilePodLevel: 0,
    missilePodLastFire: 0,
    damageBoost: 0,
    damageBoostEndTime: 0,
    bulletType: 'normal',
    bulletLevel: 0,
    maxWeaponLevel: 10,
    maxFireRate: 5
  };
  
  // 触发开始特效
  gameStartEffect.active = true;
  gameStartEffect.startTime = useDeterministicNet ? 0 : performance.now();
  gameStartEffect.phase = 1;
  
  isPaused.value = false;
}

function handleCanvasClick(e) {
  if (!isPaused.value || !canvas.value) return;
  const p = toCanvasXY(e.clientX, e.clientY);
  checkPauseButtonClick(p.x, p.y);
}

function handlePauseTouch(e) {
  if (!isPaused.value || !canvas.value) return;
  e.preventDefault();
  const touch = e.changedTouches[0];
  const p = toCanvasXY(touch.clientX, touch.clientY);
  checkPauseButtonClick(p.x, p.y);
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
    const p = toCanvasXY(touch.clientX, touch.clientY);
    touchX = p.x;
    touchY = p.y;
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
    const p = toCanvasXY(touch.clientX, touch.clientY);
    touchX = p.x;
    touchY = p.y;
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
    const p = toCanvasXY(e.clientX, e.clientY);
    touchX = p.x;
    touchY = p.y;
  } catch (err) {
    // 静默处理错误
  }
}

function handleMouseMove(e) {
  if (!canvas.value || !gameRunning) return;
  try {
    if (!isTouching) return;
    const p = toCanvasXY(e.clientX, e.clientY);
    touchX = p.x;
    touchY = p.y;
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
  const deviceWidth = Math.floor(window.visualViewport?.width || window.innerWidth);
  const deviceHeight = Math.floor(window.visualViewport?.height || window.innerHeight);

  // 单人、双人模式均使用相同的竖屏计算方式
  const { worldWidth, worldHeight } = computeSoloWorldSize(deviceWidth, deviceHeight);
  canvas.value.width = worldWidth;
  canvas.value.height = worldHeight;
  canvas.value.style.width = `${deviceWidth}px`;
  canvas.value.style.height = `${deviceHeight}px`;
  hudWidth.value = deviceWidth;
  hudScale.value = deviceWidth / worldWidth;
  canvas.value.style.transform = 'translate(-50%, -50%)';

  if (player) {
    const p = clampInCanvas(player.x, player.y, 20, 30);
    player.x = p.x;
    player.y = p.y;
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
      const progress = Math.min(elapsed / 900, 1);
      const p = 1 - Math.pow(1 - progress, 3);
      const cx = canvas.value.width / 2;
      const cy = canvas.value.height * 0.42;
      const glow = 20 + 30 * p;
      const glitchX = Math.sin(elapsed * 0.045) * (1 - p) * 10;
      const glitchY = Math.cos(elapsed * 0.06) * (1 - p) * 6;

      ctx.save();
      ctx.globalAlpha = 0.85 * p;

      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(canvas.value.width, canvas.value.height) * 0.75);
      bg.addColorStop(0, 'rgba(28, 48, 110, 0.55)');
      bg.addColorStop(0.55, 'rgba(12, 16, 35, 0.6)');
      bg.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);

      const scanAlpha = 0.08 + 0.06 * Math.sin(elapsed * 0.02);
      ctx.strokeStyle = `rgba(255, 255, 255, ${scanAlpha})`;
      ctx.lineWidth = 1;
      const step = 18;
      const shift = (elapsed * 0.06) % step;
      for (let y = -step; y < canvas.value.height + step; y += step) {
        const yy = y + shift;
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(canvas.value.width, yy);
        ctx.stroke();
      }

      ctx.translate(cx, cy);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = glow;
      ctx.shadowColor = 'rgba(0, 230, 255, 0.55)';
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 56px Arial';
      ctx.globalAlpha = 0.95 * p;
      ctx.fillText('MISSION START', glitchX, glitchY);

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.55 * p;
      ctx.fillStyle = 'rgba(0, 230, 255, 0.7)';
      ctx.fillText('MISSION START', glitchX - 3, glitchY + 1);
      ctx.fillStyle = 'rgba(255, 64, 129, 0.6)';
      ctx.fillText('MISSION START', glitchX + 3, glitchY - 1);

      ctx.globalAlpha = 0.85 * p;
      ctx.shadowBlur = 18;
      ctx.shadowColor = 'rgba(255, 64, 129, 0.28)';
      ctx.fillStyle = '#cfd8ff';
      ctx.font = '700 18px Arial';
      const pilot = String(props.playerName || 'PILOT');
      ctx.fillText(`PILOT · ${pilot}`, 0, 56);

      ctx.restore();

      if (progress >= 1) {
        gameStartEffect.phase = 2;
        gameStartEffect.startTime = currentTime;
      }
    } else if (gameStartEffect.phase === 2) {
      const progress = Math.min(elapsed / 900, 1);
      const p = 1 - Math.pow(1 - progress, 3);
      const cx = canvas.value.width / 2;
      const cy = canvas.value.height * 0.52;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(0.96 + 0.06 * p, 0.96 + 0.06 * p);
      ctx.globalAlpha = 0.88 * p;

      const pulse = 0.6 + 0.4 * Math.sin((elapsed + 140) * 0.02);
      ctx.shadowBlur = 26 * pulse;
      ctx.shadowColor = 'rgba(0, 230, 255, 0.45)';
      ctx.fillStyle = '#e3f2fd';
      ctx.font = '800 42px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LOCKED IN', 0, 0);

      ctx.shadowBlur = 18 * pulse;
      ctx.shadowColor = 'rgba(255, 64, 129, 0.35)';
      ctx.fillStyle = '#b3e5fc';
      ctx.font = '700 18px Arial';
      ctx.fillText('AIRSPACE · CLEARANCE', 0, 44);

      ctx.restore();

      if (elapsed > 1100) {
        gameStartEffect.phase = 3;
        gameStartEffect.startTime = currentTime;
      }
    } else if (gameStartEffect.phase === 3) {
      const progress = Math.min(elapsed / 650, 1);
      const p = 1 - Math.pow(1 - progress, 3);
      const cx = canvas.value.width / 2;
      const cy = canvas.value.height * 0.62;

      ctx.save();
      ctx.globalAlpha = 0.95 * p;

      const flash = Math.max(0, 1 - elapsed / 220);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.22 * flash})`;
        ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);
      }

      ctx.translate(cx, cy);
      const scale = 0.92 + 0.18 * p + 0.03 * Math.sin(elapsed * 0.05);
      ctx.scale(scale, scale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const s = Math.sin(elapsed * 0.08);
      ctx.shadowBlur = 34;
      ctx.shadowColor = 'rgba(0, 230, 255, 0.55)';
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 62px Arial';
      ctx.fillText('ENGAGE', s * 2, -s * 1);

      ctx.shadowBlur = 16;
      ctx.shadowColor = 'rgba(255, 64, 129, 0.35)';
      ctx.globalAlpha = 0.65 * p;
      ctx.fillStyle = '#b2ebf2';
      ctx.font = '700 16px Arial';
      ctx.fillText('HOLD · DRAG TO MOVE', 0, 56);

      ctx.restore();

      if (elapsed > 900) {
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
let moveSeq = 0;
let player2TargetX = 0;
let player2TargetY = 0;
let player2LastSeq = -1;

function getMissilePodIntervalMs(level) {
  const lv = Math.max(0, Math.min(8, Math.floor(Number(level) || 0)));
  return Math.max(2600, 5000 - lv * 300);
}

function getMissilePodDamageMultiplier(level) {
  const lv = Math.max(0, Math.min(8, Math.floor(Number(level) || 0)));
  return 0.5 + lv * 0.05;
}

function getTopTargets(fromX, fromY) {
  const list = [];
  if (currentBoss && currentBoss.x !== undefined && currentBoss.y !== undefined) {
    const dx = currentBoss.x - fromX;
    const dy = currentBoss.y - fromY;
    list.push({ type: 'boss', id: 'boss', x: currentBoss.x, y: currentBoss.y, d2: dx * dx + dy * dy });
  }
  for (const e of enemies) {
    if (!e || e.x === undefined || e.y === undefined) continue;
    const id = String(e.id ?? '');
    if (!id) continue;
    const dx = e.x - fromX;
    const dy = e.y - fromY;
    list.push({ type: 'enemy', id, x: e.x, y: e.y, d2: dx * dx + dy * dy });
  }
  list.sort((a, b) => a.d2 - b.d2);
  return list;
}

function spawnHomingBullet({ x, y, target, damage, isOther }) {
  const angle = target ? aimAngle(x, y, target.x, target.y) : 0;
  if (isOther) {
    const b = new Bullet(x, y, 'homing', 0, 0, 0, angle);
    b.isOther = true;
    b.damage = damage;
    b.homingTargetType = target?.type || '';
    b.homingTargetId = target?.id || '';
    otherPlayerBullets.push(b);
    return b;
  }
  const b = createBullet(x, y, 'homing', 0, 0, 0, angle);
  b.damage = damage;
  b.homingTargetType = target?.type || '';
  b.homingTargetId = target?.id || '';
  return b;
}

function tryFireMissilePods(currentTime) {
  const lv = Math.max(0, Math.min(8, Math.floor(Number(playerWeapon.value.missilePodLevel) || 0)));
  if (lv <= 0) return;
  const last = Number(playerWeapon.value.missilePodLastFire) || 0;
  const interval = getMissilePodIntervalMs(lv);
  if (currentTime - last < interval) return;

  const targets = getTopTargets(player.x, player.y);
  if (targets.length <= 0) return;
  if (bullets.length + 2 > MAX_BULLETS) return;

  const atk = computeAttackPower(playerWeapon.value);
  const dmg = Math.max(0, atk * getMissilePodDamageMultiplier(lv));
  const y = player.y - 8;
  const t1 = targets[0];
  const t2 = targets[1] || targets[0];
  spawnHomingBullet({ x: player.x - 18, y, target: t1, damage: dmg, isOther: false });
  spawnHomingBullet({ x: player.x + 18, y, target: t2, damage: dmg, isOther: false });

  playerWeapon.value.missilePodLastFire = currentTime;

  if (props.isMultiplayer) {
    const socket = getSocket();
    if (socket) {
      socket.emit('game_action', {
        roomId: props.roomData.roomId,
        action: {
          type: 'missile_pod_shoot',
          level: lv,
          attackPower: atk,
          x: Math.round(player.x),
          y: Math.round(y)
        }
      });
    }
  }
}

function autoShoot(currentTime) {
  if (!player) return;
  
  const baseInterval = config.initialFireRate;
  const fireRateBonus = (playerWeapon.value.fireRate - 1) * 20;
  const shootInterval = Math.max(50, baseInterval - fireRateBonus);
  
  if (currentTime - lastShootTime > shootInterval) {
    const bulletType = playerWeapon.value.bulletType;
    const bulletLevel = playerWeapon.value.bulletLevel;
    const spreadLevel = playerWeapon.value.spreadLevel;
    const pierceLevel = playerWeapon.value.pierceLevel;
    
    if (bullets.length >= MAX_BULLETS) return;
    
    if (spreadLevel > 0) {
      // 散弹优化：2级显示2条(夹角15°)，3级显示3条(夹角10°)
      const spreadLv = Math.max(0, Math.min(6, Math.floor(Number(spreadLevel) || 0)));
      let spreadCount = Math.min(7, spreadLv + 1);
      if (perfTier === 1) spreadCount = Math.min(spreadCount, 3);
      if (perfTier >= 2) spreadCount = Math.min(spreadCount, 2);
      const angleBetween = (spreadCount === 2 ? 15 : 10) * (2 / 3);
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
          action: { type: 'shoot', bulletType, bulletLevel, spreadLevel, pierceLevel, damageBoost: Math.max(0, Math.floor(Number(playerWeapon.value.damageBoost) || 0)) }
        });
      }
    }
  }
  
  tryFireMissilePods(currentTime);
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
  if (type === 'pulse') return '🟦';
  if (type === 'needle') return '🟩';
  if (type === 'ion') return '🟣';
  return '🔫';
}

function getWeaponName() {
  const type = playerWeapon.value.bulletType;
  if (type === 'burst') return '弹幕弹';
  if (type === 'explosive') return '爆炸弹';
  if (type === 'laser') return '激光束';
  if (type === 'pulse') return '脉冲弹';
  if (type === 'needle') return '针刺弹';
  if (type === 'ion') return '离子弹';
  return '标准弹';
}

function getWeaponDisplay() {
  try {
    const w = playerWeapon.value;
    const parts = [];
    
    // 弹道类型
    if (w.bulletType === 'laser' && w.bulletLevel > 0) {
      parts.push(`激光${w.bulletLevel}`);
    } else if (w.bulletType === 'burst' && w.bulletLevel > 0) {
      parts.push(`弹幕${w.bulletLevel}`);
    } else if (w.bulletType === 'explosive' && w.bulletLevel > 0) {
      parts.push(`爆炸${w.bulletLevel}`);
    } else if (w.bulletType === 'pulse' && w.bulletLevel > 0) {
      parts.push(`脉冲${w.bulletLevel}`);
    } else if (w.bulletType === 'needle' && w.bulletLevel > 0) {
      parts.push(`针刺${w.bulletLevel}`);
    } else if (w.bulletType === 'ion' && w.bulletLevel > 0) {
      parts.push(`离子${w.bulletLevel}`);
    }
    
    // 属性类型
    if (w.spreadLevel > 0) parts.push(`散弹${w.spreadLevel}`);
    if (w.pierceLevel > 0) parts.push(`破甲${w.pierceLevel}`);
    
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
    return `射速${rate}`;
  } catch (e) {
    return '射速1';
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
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);
  
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('游戏暂停', canvas.value.width / 2, canvas.value.height / 2 - 120);
  
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(canvas.value.width / 2 - 100, canvas.value.height / 2 - 70);
  ctx.lineTo(canvas.value.width / 2 + 100, canvas.value.height / 2 - 70);
  ctx.stroke();
  
  const btnWidth = 180;
  const btnHeight = 50;
  const btnX = canvas.value.width / 2 - btnWidth / 2;
  
  const w = playerWeapon.value || {};
  const pierceIgnore = computePierceDefenseIgnore(w.pierceLevel);
  const infoLines = [
    `攻击：${computeAttackPower(w)}`,
    `子弹：${bulletTypeLabel(w.bulletType)} ${bulletLevelLabel(w.bulletLevel)}`,
    `散弹：Lv.${Math.max(0, Math.floor(Number(w.spreadLevel) || 0))}/6`,
    `破甲：Lv.${Math.max(0, Math.floor(Number(w.pierceLevel) || 0))}（减防${Math.round(pierceIgnore * 100)}%）`,
    `射速：Lv.${Math.max(1, Math.floor(Number(w.fireRate) || 1))}`,
    `导弹：Lv.${Math.max(0, Math.floor(Number(w.missilePodLevel) || 0))}`,
    `攻击增益：${Math.max(0, Math.floor(Number(w.damageBoost) || 0))}`
  ];
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = '18px Arial';
  const infoStartY = canvas.value.height / 2 - 25;
  for (let i = 0; i < infoLines.length; i++) {
    ctx.fillText(infoLines[i], canvas.value.width / 2, infoStartY + i * 24);
  }
  
  const btnStartY = infoStartY + infoLines.length * 24 + 20;
  const buttons = [
    { text: '继续游戏', color: '#4caf50', y: btnStartY },
    { text: '重新开始', color: '#ff9800', y: btnStartY + 70 },
    { text: '返回菜单', color: '#f44336', y: btnStartY + 140 }
  ];

  buttons.forEach(btn => {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    
    ctx.fillStyle = btn.color;
    ctx.fillRect(btnX, btn.y, btnWidth, btnHeight);
    
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
  if (isPaused.value) {
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

  const frameTime = currentTime;
  if (useDeterministicNet) {
    simTick += 1;
    simNowMs = simTick * SIM_TICK_MS;
    currentTime = simNowMs;
    drainPlaneEventsForTick(simTick);
    if (props.isMultiplayer && !isHost && simTick % 60 === 0) {
      followerHashesByTick.set(simTick, buildNetStateHash());
      if (followerHashesByTick.size > 12) {
        const keys = Array.from(followerHashesByTick.keys()).sort((a, b) => a - b);
        for (let i = 0; i < keys.length - 12; i++) followerHashesByTick.delete(keys[i]);
      }
    }
  }

  const delta = useDeterministicNet ? SIM_TICK_MS : (currentTime - lastTime);
  lastTime = currentTime;
  gameTime.value = Math.floor((currentTime - startTime) / 1000);
  const simulateWorld = !props.isMultiplayer || isHost;
  const netFollowerSim = props.isMultiplayer && !isHost && useDeterministicNet;
  const socket = props.isMultiplayer ? getSocket() : null;
  if (!perfLastTs) perfLastTs = frameTime;
  perfFrames += 1;
  const perfDt = frameTime - perfLastTs;
  if (perfDt >= 1000) {
    const fps = (perfFrames * 1000) / perfDt;
    perfTier = fps < 30 ? 2 : (fps < 45 ? 1 : 0);
    perfFrames = 0;
    perfLastTs = frameTime;
  }
  
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
    const beforeX = player.x;
    const beforeY = player.y;
    player.moveTo(touchX, touchY);
    
    // 根据模式计算Y轴边界，单人和双人都保留10%底部边距
    const marginYBottom = canvas.value.height * 0.1;
    const clampedX = Math.max(20, Math.min(canvas.value.width - 20, player.x));
    const clampedY = Math.max(30, Math.min(canvas.value.height - marginYBottom, player.y));
    
    player.x = clampedX;
    player.y = clampedY;
    const corrected = clampedX !== beforeX || clampedY !== beforeY;
    
    // Multiplayer sync move
    if (props.isMultiplayer && (currentTime - lastMoveSyncTime) > 33) {
      const socket = getSocket();
      if (socket) {
        socket.emit('game_action', {
          roomId: props.roomData.roomId,
          action: { type: 'move', x: Math.round(player.x), y: Math.round(player.y), seq: moveSeq++ }
        });
        lastMoveSyncTime = currentTime;
      }
    }
    if (props.isMultiplayer && corrected) {
      const socket = getSocket();
      if (socket) {
        socket.emit('game_action', {
          roomId: props.roomData.roomId,
          action: { type: 'move', x: Math.round(player.x), y: Math.round(player.y), seq: moveSeq++ }
        });
      }
    }
  }

  if (player2) {
    const dx = player2TargetX - player2.x;
    const dy = player2TargetY - player2.y;
    const dist2 = dx * dx + dy * dy;
    
    // 如果距离太远（比如刚连上），直接瞬移过去
    if (dist2 > 40000) { 
      player2.x = player2TargetX;
      player2.y = player2TargetY;
    } else {
      // 增加平滑系数，确保移动不抖动，并且要乘上 delta 使其不受帧率影响
      // 这里的插值逻辑：在16.6ms内，移动剩余距离的 15%
      const alpha = Math.min(0.8, 1 - Math.pow(0.85, delta / 16.67));
      player2.x += dx * alpha;
      player2.y += dy * alpha;
    }
    player2.draw();
  }
  
  if (wallCount.value > 0) {
    ctx.save();
    const alpha = 0.18 + 0.12 * Math.sin(currentTime * 0.01);
    ctx.fillStyle = `rgba(0, 188, 212, ${alpha})`;
    ctx.fillRect(0, canvas.value.height - 18, canvas.value.width, 18);
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, canvas.value.height - 18);
    ctx.lineTo(canvas.value.width, canvas.value.height - 18);
    ctx.stroke();
    ctx.restore();
  }
  
  // 游戏开始特效期间不绘制玩家
  if (player && !gameStartEffect.active) {
    player.draw();
    autoShoot(currentTime);
  }
  drawEnvironmentEffects(currentTime);
  updateEnvironmentEffects(currentTime, delta, simulateWorld, socket);

  // 性能优化：限制子弹数量并使用对象池
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.update(delta);
    bullet.draw();
    // 修复：对于有重力的子弹（burst），y值可能会变大（往下掉），此时不应作为回收条件
    // 改为：超出上边界，或者超出下边界，或者标记为不活跃时回收
    if (bullet.x <= -40 || bullet.x >= canvas.value.width + 40 || bullet.y <= -20 || bullet.y >= canvas.value.height + 20 || !bullet.active) {
      freeBullet(bullet);
      bullets.splice(i, 1);
    }
  }

  // 其他玩家子弹
  for (let i = otherPlayerBullets.length - 1; i >= 0; i--) {
    const bullet = otherPlayerBullets[i];
    bullet.update(delta);
    bullet.draw();
    if (bullet.x <= -40 || bullet.x >= canvas.value.width + 40 || bullet.y <= -20 || bullet.y >= canvas.value.height + 20 || !bullet.active) {
      otherPlayerBullets.splice(i, 1);
    }
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

  if (simulateWorld && gameOfficiallyStarted && !currentBoss && timeSinceLastBoss > nextBossTime) {
    const attackTypes = ['spiral', 'spread', 'circle', 'shield-gen', 'rain', 'small-fast', 'big-spread', 'laser-line', 'buff'];
    let attackType;
    if (bossLevel <= 9) {
      attackType = attackTypes[bossLevel - 1];
    } else {
      // 9 关后随机，但难度递增
      attackType = attackTypes[Math.floor(getSeededRandom() * attackTypes.length)];
    }
    currentBoss = new Boss(bossLevel, attackType);
    if (props.isMultiplayer && isHost && useDeterministicNet) {
      netQueueEvent({ type: 'spawn_boss', tick: simTick, bossLevel, boss: buildNetStateSnapshot().boss });
    }
    
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
    if (simulateWorld) {
      currentBoss.update(currentTime);
    } else if (netFollowerSim) {
      currentBoss.update(currentTime, { attack: false });
    } else {
      updateNetEntity(currentBoss, delta);
    }
    currentBoss.draw();

    if (!simulateWorld) {
      if (currentBoss && currentBoss.health <= 0) currentBoss = null;
    }

    // 不论是否是房主，都应该检测自己发出的子弹是否击中Boss，以便渲染伤害数字和特效
    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      if (!bullet || !currentBoss) continue; 
      
      if (bullet.checkHit(currentBoss.x, currentBoss.y, 40)) {
        
        // 先执行爆炸效果 (包括自己的子弹和队友的子弹)
        if (typeof bullet.explode === 'function') {
          bullet.explode();
        }
        
        // 护盾Boss：先消耗护盾
        if (currentBoss.attackType === 'shield-gen' && currentBoss.bossShield > 0) {
          if (simulateWorld) {
            currentBoss.bossShield--;
          }
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
        const boostDamage = Math.max(0, Math.floor(Number(playerWeapon.value.damageBoost) || 0));
        const baseDamage = (bullet.damage || 5) + boostDamage;
        const critMultiplier = isCrit ? 2 : 1;
        
        const effectiveDefense = Math.max(0, currentBoss.defense - (bullet.defenseIgnore || 0));
        const actualDamage = Math.ceil(baseDamage * critMultiplier * (1 - effectiveDefense));
        
        // 添加伤害指示
        damageIndicators.push(new DamageIndicator(bullet.x, bullet.y, actualDamage, isCrit));
        createExplosion(currentBoss.x, currentBoss.y, isCrit ? '#FF8000' : '#ffeb3b');
        
        // 处理子弹穿透/移除
        if (bullet.pierce && bullet.pierceCount < bullet.maxPierce) {
          bullet.pierceCount++;
        } else {
          bullet.active = false; // instead of splice
        }

        if (simulateWorld) {
          currentBoss.health -= actualDamage;
          if (props.isMultiplayer && isHost && useDeterministicNet) {
            netQueueEvent({ type: 'damage', tick: simTick, targetType: 'boss', targetId: 'boss', amount: actualDamage });
          } else if (socket && props.roomData?.roomId) {
            socket.emit('plane_damage', { roomId: props.roomData.roomId, damage: { targetType: 'boss', amount: actualDamage } });
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
            const particleCount = Math.min(30, getParticleCap() - particles.length);
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
            
            if (props.isMultiplayer && isHost && useDeterministicNet) {
              netQueueEvent({ type: 'remove_boss', tick: simTick });
            }
            currentBoss = null;
            break; // 立即退出循环，不再处理其他子弹
          }
        }
      }
    }

    if (simulateWorld && currentBoss) for (let i = otherPlayerBullets.length - 1; i >= 0; i--) {
      const bullet = otherPlayerBullets[i];
      if (!bullet || !currentBoss) continue;

      if (bullet.checkHit(currentBoss.x, currentBoss.y, 40)) {
        if (typeof bullet.explode === 'function') {
          bullet.explode();
        }

        if (currentBoss.attackType === 'shield-gen' && currentBoss.bossShield > 0) {
          currentBoss.bossShield--;
          createExplosion(currentBoss.x, currentBoss.y, '#00bcd4');
          bullet.active = false;
          continue;
        }

        const isCrit = getSeededRandom() < 0.15;
        const boostDamage = Math.max(0, Math.floor(Number(teammateWeapon.value.damageBoost) || 0));
        const baseDamage = (bullet.damage || 5) + boostDamage;
        const critMultiplier = isCrit ? 2 : 1;

        const effectiveDefense = Math.max(0, currentBoss.defense - (bullet.defenseIgnore || 0));
        const actualDamage = Math.ceil(baseDamage * critMultiplier * (1 - effectiveDefense));
        currentBoss.health -= actualDamage;
        if (props.isMultiplayer && isHost && useDeterministicNet) {
          netQueueEvent({ type: 'damage', tick: simTick, targetType: 'boss', targetId: 'boss', amount: actualDamage });
        } else if (socket && props.roomData?.roomId) {
          socket.emit('plane_damage', { roomId: props.roomData.roomId, damage: { targetType: 'boss', amount: actualDamage } });
        }

        damageIndicators.push(new DamageIndicator(bullet.x, bullet.y, actualDamage, isCrit));
        createExplosion(currentBoss.x, currentBoss.y, isCrit ? '#FF8000' : '#ffeb3b');

        bullet.active = false;

        if (currentBoss && currentBoss.health <= 0) {
          const bossScore = Math.floor((100 + currentBoss.level * 50) * getScoreMultiplier());
          score.value += bossScore;
          healPlayer(config.bossHealPercent);
          if (currentBoss.attackType === 'buff') {
            config.enemySpawnRate /= 1.5;
          }
          if (sounds.bossDefeat) sounds.bossDefeat();
          createExplosion(currentBoss.x, currentBoss.y, currentBoss.color);
          const particleCount = Math.min(30, getParticleCap() - particles.length);
          for (let j = 0; j < particleCount; j++) {
            createParticle(currentBoss.x, currentBoss.y, '#ffeb3b');
          }
          lastBossDefeatedTime = currentTime;
          if (bossLevel > MAX_BOSS_COUNT && !gameCompleted) {
            gameCompleted = true;
            if (sounds.victory) sounds.victory();
            victoryEffect.active = true;
            victoryEffect.startTime = currentTime;
            endGame(true);
            return;
          }
          if (props.isMultiplayer && isHost && useDeterministicNet) {
            netQueueEvent({ type: 'remove_boss', tick: simTick });
          }
          currentBoss = null;
          break;
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
  
  if (simulateWorld && gameOfficiallyStarted && enemies.length < MAX_ENEMIES && getSeededRandom() < effectiveSpawnRate) {
    const enemyLevel = getEnemyLevel();
    const newEnemy = new Enemy(enemyLevel);
    if (props.isMultiplayer && isHost && useDeterministicNet) {
      if (netEnemySpawnSeqTick !== simTick) {
        netEnemySpawnSeqTick = simTick;
        netEnemySpawnSeq = 0;
      }
      netEnemySpawnSeq += 1;
      newEnemy.id = `e_${simTick}_${netEnemySpawnSeq}`;
    } else {
      newEnemy.id = `e_${++enemyIdSeq}`;
    }
    
    // 新敌机警告：只在高等级敌机（4 级+）或特殊类型第一次出现时提示
    const enemyType = newEnemy.type;
    if (enemyLevel >= 4 && !notifiedEnemyTypes.has(enemyType)) {
      notifiedEnemyTypes.add(enemyType);
      newEnemyWarning.active = true;
      newEnemyWarning.startTime = currentTime;
      newEnemyWarning.enemyType = enemyType;
    }
    
    enemies.push(newEnemy);
    if (props.isMultiplayer && useDeterministicNet && newEnemy.id) {
      netEnemyMap.set(String(newEnemy.id), newEnemy);
    }
    if (props.isMultiplayer && isHost && useDeterministicNet && newEnemy.id) {
      netQueueEvent({
        type: 'spawn_enemy',
        tick: simTick,
        enemy: {
          id: String(newEnemy.id),
          x: newEnemy.x,
          y: newEnemy.y,
          level: newEnemy.level,
          type: newEnemy.type,
          color: newEnemy.color,
          maxHealth: newEnemy.maxHealth,
          health: newEnemy.health,
          defense: newEnemy.defense,
          speed: newEnemy.speed,
          horizontalSpeed: newEnemy.horizontalSpeed,
          pattern: newEnemy.pattern,
          canShoot: newEnemy.canShoot,
          shootPattern: newEnemy.shootPattern,
          lastShootTime: newEnemy.lastShootTime,
          startY: newEnemy.startY
        }
      });
    }
  }

  enemies = enemies.filter(enemy => {
    if (simulateWorld) {
      enemy.update(currentTime);
    } else if (netFollowerSim) {
      enemy.update(currentTime, { shoot: false });
    } else {
      updateNetEntity(enemy, delta);
    }
    enemy.draw();

    // 不论是否是房主，都应该检测本地自己发出的子弹是否击中敌机，以便渲染伤害数字和特效
    // 但是扣血同步还是应该只有房主(simulateWorld)负责，或者由房主广播
    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      if (!bullet) continue;
      
      if (enemy.checkHit(bullet.x, bullet.y, bullet.hitRadius || 5)) {
        if (typeof bullet.explode === 'function') {
          bullet.explode(enemy);
        }
        
        const isCrit = getSeededRandom() < 0.15;
        const boostDamage = Math.max(0, Math.floor(Number(playerWeapon.value.damageBoost) || 0));
        const baseDamage = (bullet.damage || 1) + boostDamage;
        const critMultiplier = isCrit ? 2 : 1;
        const effectiveDefense = Math.max(0, enemy.defense - (bullet.defenseIgnore || 0));
        const actualDamage = Math.ceil(baseDamage * critMultiplier * (1 - effectiveDefense));

        damageIndicators.push(new DamageIndicator(bullet.x, bullet.y, actualDamage, isCrit));
        
        if (bullet.pierce && bullet.pierceCount < bullet.maxPierce) {
            bullet.pierceCount++;
        } else {
            bullet.active = false;
        }

        if (simulateWorld) {
          enemy.health -= actualDamage;
          if (props.isMultiplayer && isHost && useDeterministicNet && enemy.id) {
            netQueueEvent({ type: 'damage', tick: simTick, targetType: 'enemy', targetId: String(enemy.id), amount: actualDamage });
          } else if (socket && props.roomData?.roomId && enemy.id) {
            socket.emit('plane_damage', { roomId: props.roomData.roomId, damage: { targetType: 'enemy', targetId: enemy.id, amount: actualDamage } });
          }
          if (enemy.health <= 0) {
            const enemyScore = Math.floor((10 + enemy.level * 10) * getScoreMultiplier());
            score.value += enemyScore;
            createExplosion(enemy.x, enemy.y, enemy.color);
            if (sounds.explosion) sounds.explosion();
            if (!props.isMultiplayer) {
              const dropType = pickOnlineLikeDropType();
              if (dropType) powerUps.push(new PowerUp(dropType, enemy.x, enemy.y));
            }
            if (socket && props.roomData?.roomId && enemy.id) {
              socket.emit('plane_enemy_killed', { roomId: props.roomData.roomId, enemyId: enemy.id, x: enemy.x, y: enemy.y, difficulty: props.difficulty });
            }
            if (props.isMultiplayer && isHost && useDeterministicNet && enemy.id) {
              netQueueEvent({ type: 'remove_enemy', tick: simTick, enemyId: String(enemy.id) });
              netEnemyMap.delete(String(enemy.id));
            }
            return false;
          } else {
            createExplosion(enemy.x, enemy.y, '#ffeb3b');
          }
        } else {
          // 客机只负责渲染击中特效，不扣血，不加分
          createExplosion(enemy.x, enemy.y, '#ffeb3b');
        }
      }
    }

    if (simulateWorld) for (let i = otherPlayerBullets.length - 1; i >= 0; i--) {
      const bullet = otherPlayerBullets[i];
      if (!bullet) continue;

      if (enemy.checkHit(bullet.x, bullet.y, bullet.hitRadius || 5)) {
        if (typeof bullet.explode === 'function') {
          bullet.explode(enemy);
        }

        const isCrit = getSeededRandom() < 0.15;
        const boostDamage = Math.max(0, Math.floor(Number(teammateWeapon.value.damageBoost) || 0));
        const baseDamage = (bullet.damage || 1) + boostDamage;
        const critMultiplier = isCrit ? 2 : 1;

        const effectiveDefense = Math.max(0, enemy.defense - (bullet.defenseIgnore || 0));
        const actualDamage = Math.ceil(baseDamage * critMultiplier * (1 - effectiveDefense));
        enemy.health -= actualDamage;
        if (props.isMultiplayer && isHost && useDeterministicNet && enemy.id) {
          netQueueEvent({ type: 'damage', tick: simTick, targetType: 'enemy', targetId: String(enemy.id), amount: actualDamage });
        } else if (socket && props.roomData?.roomId && enemy.id) {
          socket.emit('plane_damage', { roomId: props.roomData.roomId, damage: { targetType: 'enemy', targetId: enemy.id, amount: actualDamage } });
        }

        damageIndicators.push(new DamageIndicator(bullet.x, bullet.y, actualDamage, isCrit));

        bullet.active = false;

        if (enemy.health <= 0) {
          const enemyScore = Math.floor((10 + enemy.level * 10) * getScoreMultiplier());
          score.value += enemyScore;
          createExplosion(enemy.x, enemy.y, enemy.color);
          if (sounds.explosion) sounds.explosion();
          if (!props.isMultiplayer) {
            const dropType = pickOnlineLikeDropType();
            if (dropType) powerUps.push(new PowerUp(dropType, enemy.x, enemy.y));
          }
          if (socket && props.roomData?.roomId && enemy.id) {
            socket.emit('plane_enemy_killed', { roomId: props.roomData.roomId, enemyId: enemy.id, x: enemy.x, y: enemy.y, difficulty: props.difficulty });
          }
          if (props.isMultiplayer && isHost && useDeterministicNet && enemy.id) {
            netQueueEvent({ type: 'remove_enemy', tick: simTick, enemyId: String(enemy.id) });
            netEnemyMap.delete(String(enemy.id));
          }
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
      if (props.isMultiplayer && isHost && useDeterministicNet && enemy.id) {
        netQueueEvent({ type: 'remove_enemy', tick: simTick, enemyId: String(enemy.id) });
        netEnemyMap.delete(String(enemy.id));
      } else if (socket && props.roomData?.roomId && enemy.id) {
        socket.emit('plane_enemy_remove', { roomId: props.roomData.roomId, enemyId: enemy.id });
      }
      return false;
    }

    if (enemy.y > canvas.value.height) {
      const wallRes = consumeWallOnCross({ wallCount: wallCount.value });
      if (wallRes.consumed) {
        wallCount.value = wallRes.wallCount;
        createExplosion(enemy.x, canvas.value.height - 12, '#00bcd4');
        triggerShake(6, 150);
        if (navigator?.vibrate) navigator.vibrate(150);
        if (props.isMultiplayer) {
          const socket = getSocket();
          if (socket && props.roomData?.roomId) {
            socket.emit('plane_player_snapshot', { roomId: props.roomData.roomId, snapshot: { wallCount: wallCount.value } });
          }
        }
        if (props.isMultiplayer && isHost && useDeterministicNet && enemy.id) {
          netQueueEvent({ type: 'remove_enemy', tick: simTick, enemyId: String(enemy.id) });
          netEnemyMap.delete(String(enemy.id));
        } else if (socket && props.roomData?.roomId && enemy.id) {
          socket.emit('plane_enemy_remove', { roomId: props.roomData.roomId, enemyId: enemy.id });
        }
        return false;
      }

      const penalty = Math.floor(5 * getScoreMultiplier());
      score.value = Math.max(0, score.value - penalty);
      if (takeDamage(5)) return false;
      if (props.isMultiplayer && isHost && useDeterministicNet && enemy.id) {
        netQueueEvent({ type: 'remove_enemy', tick: simTick, enemyId: String(enemy.id) });
        netEnemyMap.delete(String(enemy.id));
      } else if (socket && props.roomData?.roomId && enemy.id) {
        socket.emit('plane_enemy_remove', { roomId: props.roomData.roomId, enemyId: enemy.id });
      }
      return false;
    }

    return enemy.y < canvas.value.height + 30;
  });

  // 性能优化：限制Boss子弹数量
  if (bossBullets.length > MAX_BOSS_BULLETS) {
    bossBullets = bossBullets.slice(-MAX_BOSS_BULLETS);
    if (props.isMultiplayer && useDeterministicNet) {
      netBossBulletMap = new Map(bossBullets.map((b) => [String(b?.id || ''), b]).filter(([id]) => !!id));
    }
  }

  bossBullets = bossBullets.filter(bullet => {
    // 只有房主模拟boss子弹的物理轨迹，客机仅做渲染和碰撞检测
    const bulletId = String(bullet?.id || '');
    if (simulateWorld || netFollowerSim) {
      bullet.update();
    } else {
      updateNetEntity(bullet, delta);
    }
    bullet.draw();

    if (player && Math.abs(player.x - bullet.x) < 20 && Math.abs(player.y - bullet.y) < 20) {
      if (player.shield > 0) {
        player.shield--;
        createExplosion(bullet.x, bullet.y, '#00bcd4');
      } else {
        createExplosion(bullet.x, bullet.y, '#ff0066');
        if (takeDamage(bullet.damage)) {
          if (props.isMultiplayer && useDeterministicNet && bulletId) netBossBulletMap.delete(bulletId);
          return false;
        }
      }
      if (props.isMultiplayer && useDeterministicNet && bulletId) netBossBulletMap.delete(bulletId);
      return false;
    }

    const alive = bullet.x > -20 && bullet.x < canvas.value.width + 20 && bullet.y > -20 && bullet.y < canvas.value.height + 20;
    if (!alive && props.isMultiplayer && useDeterministicNet && bulletId) netBossBulletMap.delete(bulletId);
    return alive;
  });

  const particleCap = getParticleCap();
  if (particles.length > particleCap) {
    particles = particles.slice(-particleCap);
  }

  particles = particles.filter(particle => {
    particle.update();
    particle.draw();
    return particle.life > 0;
  });

  if (screenShake.active) {
    ctx.restore();
  }

  if (socket && props.isMultiplayer && isHost) {
    netFlushHost(socket);
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
      if (props.roomData?.roomId) {
        socket.emit('game_action', {
          roomId: props.roomData.roomId,
          action: { type: 'game_over', score: score.value }
        });
        socket.emit('leave_room', { roomId: props.roomData.roomId });
      }
      socket.off('game_action');
      socket.off('plane_drop');
      socket.off('plane_evt');
      socket.off('plane_tick_sync');
      socket.off('plane_state_hash');
      socket.off('plane_state_correct');
      socket.off('plane_state_mismatch');
    }
  }

  if (!victory) {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    const finalScoreValue = Math.floor(score.value * (1 + gameTime.value * 0.01));
    emit('gameOver', finalScoreValue, victory, {
      gameType: 'plane-war',
      mode: props.isMultiplayer ? 'coop' : 'solo',
      teammateScore: props.isMultiplayer ? Number(GameState.player2.score || 0) : 0
    });
  } else {
    // 通关时继续运行以显示特效，5 秒后再结束
    setTimeout(() => {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      const finalScoreValue = Math.floor(score.value * (1 + gameTime.value * 0.01));
      emit('gameOver', finalScoreValue, victory, {
        gameType: 'plane-war',
        mode: props.isMultiplayer ? 'coop' : 'solo',
        teammateScore: props.isMultiplayer ? Number(GameState.player2.score || 0) : 0
      });
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
  syncHUDState();
  hudSyncInterval = setInterval(syncHUDState, 120);
  window.addEventListener('resize', setCanvasSize);
  window.addEventListener('resize', updateOrientationState);
  window.addEventListener('orientationchange', updateOrientationState);
  document.addEventListener('visibilitychange', updateOrientationState);
  updateOrientationState();

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
    player2TargetX = player2.x;
    player2TargetY = player2.y;
    
    if (props.roomData && props.roomData.seed) {
      rngSeed = props.roomData.seed;
    }
    
    const socket = getSocket();
    if (socket) {
      if (props.roomData?.roomId) {
        socket.emit('rejoin_room', { roomId: props.roomData.roomId });
      }

      socket.on('game_action', (data) => {
        if (!player2) return;
        const { action } = data;
        if (action.type === 'game_over') {
          if (typeof action.score === 'number') {
            // 在组队模式中，可以将对方分数加到自己分数上，或者直接结束
            // App.vue在game-over里并没有分别展示两个人的分数，而是存了一个总分或单人分
            // 根据rank/service.js: mode === 'coop' return score + partnerScore; 
            // 如果我们在这里将score加上对方的score？ 或者保持不变，由后端去加
            // 先只做处理: 被邀请者收到 game_over，直接结束游戏，并更新对方分数状态（如果需要）
            // 在PlaneGame里对方的分数其实也通过socket同步更新
          }
          endGame();
        } else if (action.type === 'move') {
          if (typeof action.seq === 'number' && action.seq <= player2LastSeq) return;
          if (typeof action.seq === 'number') player2LastSeq = action.seq;
          if (typeof action.x === 'number' && typeof action.y === 'number') {
            const p = clampInCanvas(action.x, action.y, 20, 30);
            player2TargetX = p.x;
            player2TargetY = p.y;
          } else {
            if (typeof action.x === 'number') player2TargetX = clampInCanvas(action.x, player2TargetY, 20, 30).x;
            if (typeof action.y === 'number') player2TargetY = clampInCanvas(player2TargetX, action.y, 20, 30).y;
          }
        } else if (action.type === 'shoot') {
          // 创建对方的子弹
          const { bulletType, bulletLevel, spreadLevel, pierceLevel, damageBoost } = action;
          const spreadLv = Math.max(0, Math.min(6, Math.floor(Number(spreadLevel) || 0)));
          const pierceLv = Math.max(0, Math.min(6, Math.floor(Number(pierceLevel) || 0)));
          teammateWeapon.value = {
            ...teammateWeapon.value,
            bulletType: bulletType || teammateWeapon.value.bulletType,
            bulletLevel: typeof bulletLevel === 'number' ? bulletLevel : teammateWeapon.value.bulletLevel,
            spreadLevel: spreadLv,
            pierceLevel: pierceLv,
            damageBoost: typeof damageBoost === 'number' ? Math.max(0, Math.floor(damageBoost)) : teammateWeapon.value.damageBoost
          };
          let spreadCount = spreadLv > 0 ? Math.min(7, spreadLv + 1) : 1;
          if (perfTier === 1) spreadCount = Math.min(spreadCount, 3);
          if (perfTier >= 2) spreadCount = Math.min(spreadCount, 2);
          
          if (spreadCount > 1) {
            const angleBetween = (spreadCount === 2 ? 15 : 10) * (2 / 3);
            const totalAngle = (spreadCount - 1) * angleBetween * (Math.PI / 180);
            
            for (let i = 0; i < spreadCount; i++) {
              const angle = spreadCount === 1 ? 0 : (-totalAngle / 2 + (totalAngle / (spreadCount - 1)) * i);
              const b = new Bullet(player2.x, player2.y - 20, bulletType, bulletLevel, spreadLv, pierceLv, angle);
              b.isOther = true;
              otherPlayerBullets.push(b);
            }
          } else {
            const b = new Bullet(player2.x, player2.y - 20, bulletType, bulletLevel, spreadLv, pierceLv, 0);
            b.isOther = true;
            otherPlayerBullets.push(b);
          }
        } else if (action.type === 'missile_pod_shoot') {
          const lv = Math.max(0, Math.min(8, Math.floor(Number(action.level) || 0)));
          const atk = Number(action.attackPower) || 0;
          if (lv <= 0 || atk <= 0) return;
          teammateWeapon.value = { ...teammateWeapon.value, missilePodLevel: lv };
          const x = typeof action.x === 'number' ? action.x : player2.x;
          const y = typeof action.y === 'number' ? action.y : (player2.y - 8);
          const targets = getTopTargets(x, y);
          if (targets.length <= 0) return;
          const t1 = targets[0];
          const t2 = targets[1] || targets[0];
          const dmg = Math.max(0, atk * getMissilePodDamageMultiplier(lv));
          spawnHomingBullet({ x: x - 18, y, target: t1, damage: dmg, isOther: true });
          spawnHomingBullet({ x: x + 18, y, target: t2, damage: dmg, isOther: true });
        } else if (action.type === 'health_sync') {
          // Teammate sent their state
          // Their 'health' is our 'teammateHealth'
          // Their 'teammateHealth' is our 'health'
          teammateHealth.value = action.health;
          health.value = action.teammateHealth;
          
          if (health.value <= 0 && teammateHealth.value <= 0) {
            endGame();
          }
        } else if (action.type === 'env_powerup') {
          if (!isHost) return;
          const t = String(action.powerUp || '');
          if (t === 'LIGHTNING') {
            applyLightningStrike();
          } else {
            activateEnvironmentEffect(t);
          }
        }
      });

      socket.on('plane_evt', (data) => {
        const payload = data && typeof data === 'object' ? (data.payload || data) : null;
        applyPlaneEvtPayload(payload);
      });

      socket.on('plane_tick_sync', (data) => {
        const payload = data && typeof data === 'object' ? (data.payload || data) : null;
        if (!payload || typeof payload !== 'object') return;
        if (!Number.isFinite(payload.tick)) return;
        hostTick = payload.tick;
        lastHostTickSeen = Math.max(lastHostTickSeen, hostTick);
        if (!isHost) {
          followerTargetTick = Math.max(0, hostTick - 1);
        }
      });

      socket.on('plane_state_hash', (data) => {
        const payload = data && typeof data === 'object' ? (data.payload || data) : null;
        if (!payload || typeof payload !== 'object') return;
        if (!Number.isFinite(payload.tick) || !Number.isFinite(payload.hash)) return;
        if (isHost) return;
        const localHash = followerHashesByTick.get(payload.tick);
        if (!Number.isFinite(localHash)) return;
        if (localHash !== payload.hash) {
          socket.emit('plane_state_mismatch', { roomId: props.roomData.roomId, payload: { tick: payload.tick, localHash, remoteHash: payload.hash } });
        }
      });

      socket.on('plane_state_correct', (data) => {
        const payload = data && typeof data === 'object' ? (data.payload || data) : null;
        if (!payload || typeof payload !== 'object') return;
        const snapshot = payload.snapshot && typeof payload.snapshot === 'object' ? payload.snapshot : null;
        if (!snapshot) return;
        applyNetStateSnapshot(snapshot);
      });

      socket.on('plane_state_mismatch', (data) => {
        if (!isHost) return;
        const payload = data && typeof data === 'object' ? (data.payload || data) : null;
        if (!payload || typeof payload !== 'object') return;
        if (!Number.isFinite(payload.tick)) return;
        const snap = hostSnapshotsByTick.get(payload.tick);
        if (!snap) return;
        socket.emit('plane_state_correct', { roomId: props.roomData.roomId, toUserId: data?.fromUserId, payload: { tick: payload.tick, snapshot: snap } });
      });

      socket.on('plane_drop', (drop) => {
        if (!drop || typeof drop !== 'object') return;
        if (typeof drop.type !== 'string') return;
        const type = drop.type === 'HEAL' ? 'HEALTH' : drop.type;
        powerUps.push(new PowerUp(type, drop.x, drop.y));
      });
    }
  }

  gameRunning = true;
  updateOrientationState();
  if (useDeterministicNet) {
    simTick = 0;
    simNowMs = 0;
    lastTime = 0;
    startTime = 0;
  } else {
    startTime = performance.now();
  }
  
  // 触发游戏开始特效
  gameStartEffect.active = true;
  gameStartEffect.startTime = useDeterministicNet ? 0 : performance.now();
  gameStartEffect.phase = 1;
  
  animationId = requestAnimationFrame(gameLoop);
});

onUnmounted(() => {
  gameRunning = false;
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  if (hudSyncInterval) {
    clearInterval(hudSyncInterval);
    hudSyncInterval = null;
  }
  
  window.removeEventListener('resize', setCanvasSize);
  window.removeEventListener('resize', updateOrientationState);
  window.removeEventListener('orientationchange', updateOrientationState);
  document.removeEventListener('visibilitychange', updateOrientationState);
  
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
      socket.off('plane_drop');
      socket.off('plane_evt');
      socket.off('plane_tick_sync');
      socket.off('plane_state_hash');
      socket.off('plane_state_correct');
      socket.off('plane_state_mismatch');
    }
  }
});
</script>

<template>
  <div class="game-container">
    <div v-if="orientationTransitioning" class="fade-overlay"></div>
    <div v-if="showOrientationPrompt && orientationMismatch" class="orientation-overlay">
      <div class="orientation-card">
        <div class="orientation-title">即将改变屏幕方向</div>
        <div class="orientation-desc">当前为 {{ getOrientationLabel(currentOrientation) }}，需要 {{ getOrientationLabel(desiredOrientation) }}</div>
        <div class="orientation-actions">
          <button class="btn ghost" @click="goBackToHub">返回</button>
          <button class="btn primary" @click="performOrientationTransition">确认</button>
        </div>
      </div>
    </div>
    <div class="hud-layer" :style="{ width: hudWidth ? `${hudWidth}px` : '95%' }">
      <div v-if="!isMultiplayer" class="hud-solo" :class="{ 'is-paused': isPaused }">
        <div class="hud-bar">
          <button class="hud-btn" @click="goBackToHub">←</button>
          
          <!-- 始终可见的中间信息流（血量+攻击） -->
          <div class="hud-center-info" v-show="!isPaused">
            <div class="hud-health-mini">
              <div class="hud-health-bar" :class="{ danger: GameState.player1.health <= 20 }">
                <div class="hud-health-fill" :style="{ width: Math.max(0, Math.min(100, GameState.player1.health)) + '%' }"></div>
              </div>
            </div>
            <div class="hud-attack-mini">
              攻 {{ GameState.player1.attackPower }}
            </div>
            <div class="hud-attack-mini">
              破 {{ GameState.player1.pierceLevel }} -{{ GameState.player1.pierceReductionPct }}%
            </div>
          </div>
          
          <div class="hud-time" v-show="isPaused">{{ hudTimeText }}</div>
          
          <div class="hud-actions">
            <button class="hud-btn" @click="togglePause">{{ isPaused ? '▶' : '⏸' }}</button>
          </div>
        </div>

        <div class="hud-drawer" :class="{ 'drawer-open': isPaused }">
          <div class="hud-panel">
            <div class="hud-row">
              <div class="hud-item">分数 <span class="hud-strong">{{ GameState.player1.score }}</span></div>
              <div class="hud-item">子弹 <span class="hud-strong">{{ bulletTypeLabel(GameState.player1.bulletType) }} {{ bulletLevelLabel(GameState.player1.bulletLevel) }}</span></div>
              <div class="hud-item">攻击 <span class="hud-strong">{{ GameState.player1.attackPower }}</span></div>
            </div>
            <div class="hud-row">
              <div class="hud-item">散弹 <span class="hud-strong">Lv.{{ GameState.player1.spreadLevel }}/6</span></div>
              <div class="hud-item">破甲 <span class="hud-strong">Lv.{{ GameState.player1.pierceLevel }} (-{{ GameState.player1.pierceReductionPct }}%)</span></div>
              <div class="hud-item">射速 <span class="hud-strong">Lv.{{ GameState.player1.fireRate }}</span></div>
            </div>
            <div class="hud-row">
              <div class="hud-item">导弹 <span class="hud-strong">Lv.{{ GameState.player1.missilePodLevel }}</span></div>
              <div class="hud-item">增益 <span class="hud-strong">{{ GameState.player1.damageBoost }}</span></div>
              <div class="hud-item"></div>
            </div>
            <!-- 展开时显示完整血量信息 -->
            <div class="hud-health-row">
              <div class="hud-health-label">血量</div>
              <div class="hud-health-bar" :class="{ danger: GameState.player1.health <= 20 }">
                <div class="hud-health-fill" :style="{ width: Math.max(0, Math.min(100, GameState.player1.health)) + '%' }"></div>
              </div>
              <div class="hud-health-num">{{ Math.max(0, Math.round(GameState.player1.health)) }}%</div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="hud-multi">
        <div class="hud-multi-top">
          <!-- 玩家 1 信息 -->
          <div class="hud-player-info p1-info">
            <div class="hud-score-row">
              <span class="hud-name">P1 分数</span>
              <span class="hud-score-val">{{ GameState.player1.score }}</span>
            </div>
            <div class="hud-weapon-row">
              <span>{{ bulletTypeLabel(GameState.player1.bulletType) }} {{ bulletLevelLabel(GameState.player1.bulletLevel) }}</span>
              <span class="hud-atk">攻 {{ GameState.player1.attackPower }}</span>
            </div>
            <div class="hud-health-mini">
              <div class="hud-health-bar" :class="{ danger: GameState.player1.health <= 20 }">
                <div class="hud-health-fill" :style="{ width: Math.max(0, Math.min(100, GameState.player1.health)) + '%' }"></div>
              </div>
            </div>
          </div>
          
          <!-- 时间 -->
          <div class="hud-center-time">{{ hudTimeText }}</div>
          
          <!-- 玩家 2 信息 -->
          <div class="hud-player-info p2-info">
            <div class="hud-score-row">
              <span class="hud-name">P2 分数</span>
              <span class="hud-score-val">{{ GameState.player2.score }}</span>
            </div>
            <div class="hud-weapon-row">
              <span>{{ bulletTypeLabel(GameState.player2.bulletType) }} {{ bulletLevelLabel(GameState.player2.bulletLevel) }}</span>
              <span class="hud-atk">攻 {{ GameState.player2.attackPower }}</span>
            </div>
            <div class="hud-health-mini">
              <div class="hud-health-bar" :class="{ danger: GameState.player2.health <= 20 }">
                <div class="hud-health-fill p2" :style="{ width: Math.max(0, Math.min(100, GameState.player2.health)) + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 全屏 Canvas -->
    <canvas ref="canvas" @click="handleCanvasClick" @touchend="handlePauseTouch"></canvas>

    <div v-if="wallCount > 0" class="wall-hud">
      <div class="wall-hud-icon">护罩</div>
      <div class="wall-hud-count">{{ wallCount }}</div>
    </div>
  </div>
</template>

<style scoped>
.game-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: #000;
}

.fade-overlay {
  position: absolute;
  inset: 0;
  background: #000;
  opacity: 0.92;
  z-index: 200;
  transition: opacity 0.3s ease;
}

.orientation-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.72);
  display: grid;
  place-items: center;
  z-index: 210;
}

.orientation-card {
  width: min(520px, calc(100vw - 36px));
  border-radius: 18px;
  padding: 16px;
  background: rgba(10, 14, 39, 0.9);
  border: 1px solid rgba(255,255,255,0.18);
}

.orientation-title {
  color: rgba(255,255,255,0.95);
  font-weight: 900;
  font-size: 16px;
}

.orientation-desc {
  margin-top: 10px;
  color: rgba(255,255,255,0.78);
  font-size: 13px;
  line-height: 1.5;
}

.orientation-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn {
  border-radius: 14px;
  padding: 10px 14px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.95);
}

.btn.ghost {
  background: rgba(0,0,0,0.22);
}

.btn.primary {
  background: linear-gradient(135deg, rgba(255,210,60,0.95), rgba(255,140,60,0.95));
  border: none;
  color: #2a0f00;
  font-weight: 900;
}

.hud-layer {
  position: absolute;
  top: calc(12px + var(--safe-area-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: 120;
  display: grid;
  gap: 10px;
  pointer-events: none;
}

.hud-layer > * {
  pointer-events: auto;
}

.hud-solo {
  transition: opacity 0.3s ease;
  opacity: 0.4;
}

.hud-solo.is-paused {
  opacity: 1;
}

.hud-drawer {
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease, margin-top 0.3s ease;
}

.hud-drawer.drawer-open {
  max-height: 200px;
  opacity: 1;
  margin-top: 10px;
}

.hud-center-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  justify-content: center;
  padding: 0 10px;
}

.hud-health-mini {
  width: 80px;
  flex-shrink: 0;
}

.hud-attack-mini {
  color: #FFD700;
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}

.hud-bar {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 12px;
  background: rgba(10, 14, 39, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.hud-btn {
  height: 34px;
  min-width: 34px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hud-time {
  font-size: 14px;
  font-weight: 900;
  color: rgba(255,255,255,0.95);
  font-family: 'Monaco', monospace;
}

.hud-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.hud-panel {
  padding: 12px;
  background: rgba(10, 14, 39, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.hud-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: rgba(255,255,255,0.9);
}

.hud-item { white-space: nowrap; }
.hud-strong { color: #FFD700; font-weight: 900; }

.hud-health-row {
  margin-top: 10px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
}

.hud-health-label { color: rgba(255,255,255,0.75); font-size: 12px; }
.hud-health-num { color: rgba(255,255,255,0.85); font-size: 12px; font-family: 'Monaco', monospace; }

.hud-health-bar {
  height: 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.18);
  overflow: hidden;
}

.hud-health-fill {
  height: 100%;
  width: 0%;
  background: rgba(0,255,180,0.85);
  transition: width 0.2s linear, background-color 0.2s linear;
}

.hud-health-bar.danger .hud-health-fill { background: rgba(255,70,120,0.95); }
.hud-health-fill.p2 { background: rgba(120,180,255,0.9); }
.hud-health-bar.danger .hud-health-fill.p2 { background: rgba(255,70,120,0.95); }

.hud-multi-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(10, 14, 39, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.hud-player-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.hud-player-info.p2-info {
  align-items: flex-end;
}

.hud-score-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.hud-name {
  color: rgba(255, 255, 255, 0.7);
  font-size: 10px;
  font-weight: bold;
}

.hud-score-val {
  color: #FFD700;
  font-weight: 900;
  font-family: 'Monaco', monospace;
  font-size: 14px;
}

.hud-weapon-row {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 11px;
}

.hud-atk {
  color: #FFD700;
  font-weight: bold;
}

.hud-center-time {
  font-size: 16px;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.95);
  font-family: 'Monaco', monospace;
  padding-top: 2px;
}

.hud-hp-block {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
}

.hud-hp-name { color: rgba(255,255,255,0.75); font-size: 12px; font-weight: 900; }
.hud-hp-num { color: rgba(255,255,255,0.85); font-size: 12px; font-family: 'Monaco', monospace; }

canvas {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: #0a0e27;
  touch-action: none;
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

.wall-hud {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 14px;
  background: rgba(10, 14, 39, 0.55);
  border: 1px solid rgba(0, 255, 255, 0.25);
  color: #fff;
  z-index: 120;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.wall-hud-icon {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 188, 212, 0.22);
  border: 1px solid rgba(0, 255, 255, 0.35);
  color: #00e5ff;
  font-weight: 800;
  font-size: 14px;
  line-height: 1;
}

.wall-hud-count {
  min-width: 18px;
  text-align: center;
  font-weight: 800;
  color: #fff;
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
