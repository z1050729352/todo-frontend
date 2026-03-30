<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
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

let rngSeed = Date.now();
function seededRandom() {
  rngSeed = (rngSeed * 9301 + 49297) % 233280;
  return rngSeed / 233280;
}
const random = seededRandom;

const emit = defineEmits(['gameOver', 'backToHub']);

const canvas = ref(null);
let ctx = null;
let animationId = null;
let gameRunning = false;
const isPaused = ref(false); // 修复：必须是ref才能响应式更新UI

// 游戏状态
const score = ref(0);
const opponentScore = ref(0); // Multiplayer
const linesCleared = ref(0);
const level = ref(1);
const gameTime = ref(0);
const multiplayerTimeLimit = ref(0); // in seconds
let startTime = 0;
let lastTime = 0;

const MAX_LEVEL = 12; // 12级通关
const LINES_PER_LEVEL = 10;

// 道具库存
const inventory = ref({
  bomb: 1,
  slowdown: 1,
  starClear: 1,
  transform: 1
});

// 道具获取动画状态
const propEffects = ref({
  bomb: false,
  slowdown: false,
  starClear: false,
  transform: false
});

// 状态效果
let slowdownEndTime = 0;
let isBombNext = false; 

// 紧张系统
const isTense = ref(false);
let lastHeartbeatTime = 0;

// 音频系统 - 替换为可用的免费素材或取消外链
const volume = ref(parseFloat(localStorage.getItem('tetris_volume') || '0.5'));
const isMuted = ref(localStorage.getItem('tetris_muted') === 'true');

// 为了避免跨域和403问题，我们使用更稳定的免费音频API生成BGM，或者暂时只保留音效
const bgmUrls = {
  warm: 'https://cdn.freesound.org/previews/573/573609_12836264-lq.mp3', // 替换为可用的稳定链接
  cyberpunk: 'https://cdn.freesound.org/previews/612/612053_11861866-lq.mp3', 
  ink: 'https://cdn.freesound.org/previews/608/608930_1015240-lq.mp3', 
  fashion: 'https://cdn.freesound.org/previews/611/611685_12836264-lq.mp3', 
  animal: 'https://cdn.freesound.org/previews/568/568585_12396340-lq.mp3' 
};

let currentBgm = null;
let audioContext = null;

// 风格系统
const currentStyle = ref(localStorage.getItem('tetris_style') || 'warm');
const STYLES = {
  warm: {
    name: '温馨暖色',
    bg: '#fff5f5',
    grid: 'rgba(255, 182, 193, 0.2)',
    border: 'rgba(255, 182, 193, 0.8)',
    colors: ['', '#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff', '#cbaacb', '#fcc2d7'],
    drawBlock: (ctx, px, py, size, color, isGhost, isBomb) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(px, py, size, size, 8);
      ctx.fill();
      if (!isGhost && !isBomb) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.roundRect(px + 2, py + 2, size - 4, size / 3, 4);
        ctx.fill();
      }
    }
  },
  cyberpunk: {
    name: '赛博朋克',
    bg: '#0a0a1a',
    grid: 'rgba(0, 255, 255, 0.1)',
    border: '#00ffff',
    colors: ['', '#0ff', '#f0f', '#ff0', '#0f0', '#00f', '#f00', '#f80'],
    drawBlock: (ctx, px, py, size, color, isGhost, isBomb) => {
      ctx.fillStyle = isGhost ? 'transparent' : 'rgba(0,0,0,0.8)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillRect(px, py, size, size);
      ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
      if (!isGhost && !isBomb) {
        ctx.fillStyle = color;
        ctx.fillRect(px + size/4, py + size/4, size/2, size/2);
      }
    }
  },
  ink: {
    name: '武侠黑墨',
    bg: '#e8e8e8',
    grid: 'rgba(0, 0, 0, 0.05)',
    border: '#333',
    colors: ['', '#222', '#444', '#666', '#888', '#aaa', '#ccc', '#111'],
    drawBlock: (ctx, px, py, size, color, isGhost, isBomb) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(px + 2, py + 2);
      ctx.lineTo(px + size - 4, py + 4);
      ctx.lineTo(px + size - 2, py + size - 2);
      ctx.lineTo(px + 4, py + size - 4);
      ctx.closePath();
      ctx.fill();
    }
  },
  fashion: {
    name: '时尚丽人',
    bg: '#f5f5f0',
    grid: 'rgba(217, 208, 193, 0.3)',
    border: '#b8c4c1',
    colors: ['', '#d9d0c1', '#b8c4c1', '#d4c4b7', '#e2d3cd', '#c1cbd7', '#b5c4b1', '#d5caba'],
    drawBlock: (ctx, px, py, size, color, isGhost, isBomb) => {
      ctx.fillStyle = color;
      ctx.fillRect(px, py, size, size);
      if (!isGhost && !isBomb) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1, py + 1, size - 2, size - 2);
      }
    }
  },
  animal: {
    name: '动物自然',
    bg: '#e8f5e9',
    grid: 'rgba(76, 175, 80, 0.1)',
    border: '#4caf50',
    colors: ['', '#81c784', '#aed581', '#a1887f', '#ffb74d', '#4dd0e1', '#ff8a65', '#90a4ae'],
    drawBlock: (ctx, px, py, size, color, isGhost, isBomb) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px + size/2, py + size/2, size/2 - 2, 0, Math.PI * 2);
      ctx.fill();
      if (!isGhost && !isBomb) {
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(px + size/3, py + size/3, 2, 0, Math.PI*2);
        ctx.arc(px + size*2/3, py + size/3, 2, 0, Math.PI*2);
        ctx.fill();
      }
    }
  }
};

// 棋盘配置
const COLS = 10;
const ROWS = 20;
let BLOCK_SIZE = 30; 
let offsetX = 0;
let offsetY = 0;

let board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

const SHAPES = [
  [],
  [[1, 1, 1, 1]], // I
  [[2, 2], [2, 2]], // O
  [[0, 3, 0], [3, 3, 3]], // T
  [[4, 0, 0], [4, 4, 4]], // L
  [[0, 0, 5], [5, 5, 5]], // J
  [[0, 6, 6], [6, 6, 0]], // S
  [[7, 7, 0], [0, 7, 7]]  // Z
];

let currentPiece = null;
let nextPieceShape = null;

let dropCounter = 0;
let dropInterval = 1000;
let isFastDropping = false;

// 粒子特效
let particles = [];
let floatingTexts = [];

class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.vx = (random() - 0.5) * 8;
    this.vy = (random() - 0.5) * 8;
    this.life = 1;
    this.color = color;
    this.size = random() * 4 + 2;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.2; 
    this.life -= 0.02;
  }
  draw(ctx) {
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.size, this.size);
    ctx.globalAlpha = 1;
  }
}

class FloatingText {
  constructor(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.life = 1.0;
  }
  update() {
    this.y -= 1;
    this.life -= 0.02;
  }
  draw(ctx) {
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1;
  }
}

function createExplosion(x, y, color, count = 20) {
  for (let i = 0; i < count; i++) {
    particles.push(new Particle(x, y, color));
  }
}

function initAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  playBGM();
}

function playBGM() {
  if (currentBgm) {
    currentBgm.pause();
    currentBgm.removeAttribute('src'); // 彻底释放旧音频资源
    currentBgm.load();
  }
  
  if (isMuted.value) return; // 静音状态下不加载

  // 添加错误处理，避免控制台红海
  currentBgm = new Audio(bgmUrls[currentStyle.value]);
  currentBgm.loop = true;
  currentBgm.volume = volume.value;
  
  const playPromise = currentBgm.play();
  if (playPromise !== undefined) {
    playPromise.catch(error => {
      console.warn('BGM Auto-play was prevented or failed to load. Please interact with the screen first or check network.', error.message);
    });
  }
}

function updateVolume() {
  if (currentBgm) {
    currentBgm.volume = isMuted.value ? 0 : volume.value;
  }
  localStorage.setItem('tetris_volume', volume.value);
  localStorage.setItem('tetris_muted', isMuted.value);
}

function toggleMute() {
  isMuted.value = !isMuted.value;
  updateVolume();
}

function playSFX(type) {
  if (isMuted.value || !audioContext) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);
  
  if (type === 'clear') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, audioContext.currentTime + 0.1);
    gain.gain.setValueAtTime(volume.value, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    osc.start();
    osc.stop(audioContext.currentTime + 0.1);
  } else if (type === 'drop') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.1);
    gain.gain.setValueAtTime(volume.value * 0.5, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    osc.start();
    osc.stop(audioContext.currentTime + 0.1);
  } else if (type === 'heartbeat') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioContext.currentTime + 0.3);
    gain.gain.setValueAtTime(volume.value, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    osc.start();
    osc.stop(audioContext.currentTime + 0.3);
  }
}

function getRandomShape() {
  const index = Math.floor(random() * 7) + 1;
  return {
    matrix: JSON.parse(JSON.stringify(SHAPES[index])),
    x: Math.floor(COLS / 2) - Math.floor(SHAPES[index][0].length / 2),
    y: 0,
    isBomb: false
  };
}

function rotate(matrix) {
  const N = matrix.length;
  const M = matrix[0].length;
  const result = Array.from({ length: M }, () => Array(N).fill(0));
  for (let y = 0; y < N; ++y) {
    for (let x = 0; x < M; ++x) {
      result[x][N - 1 - y] = matrix[y][x];
    }
  }
  return result;
}

function collide(board, piece) {
  const m = piece.matrix;
  for (let y = 0; y < m.length; ++y) {
    for (let x = 0; x < m[y].length; ++x) {
      if (m[y][x] !== 0 &&
         (board[y + piece.y] && board[y + piece.y][x + piece.x]) !== 0) {
        return true;
      }
    }
  }
  return false;
}

function merge(board, piece) {
  piece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        board[y + piece.y][x + piece.x] = value;
      }
    });
  });
  checkTension();
}

function checkTension() {
  // 检查距离顶部3行内是否有方块
  let tension = false;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x] !== 0) {
        tension = true;
        break;
      }
    }
    if (tension) break;
  }
  isTense.value = tension;
}

function sweep() {
  let rowCount = 0;
  outer: for (let y = board.length - 1; y >= 0; --y) {
    for (let x = 0; x < board[y].length; ++x) {
      if (board[y][x] === 0) {
        continue outer;
      }
    }
    const row = board.splice(y, 1)[0].fill(0);
    board.unshift(row);
    ++y;
    rowCount++;
    
    for (let x = 0; x < COLS; x++) {
      createExplosion(offsetX + x * BLOCK_SIZE + BLOCK_SIZE/2, offsetY + y * BLOCK_SIZE + BLOCK_SIZE/2, STYLES[currentStyle.value].colors[1], 5);
    }
  }

  if (rowCount > 0) {
    playSFX('clear');
    linesCleared.value += rowCount;
    const points = [0, 100, 300, 500, 800];
    score.value += (points[rowCount] || 1000) * level.value;
    
    // Multiplayer sync score
    if (props.isMultiplayer) {
      const socket = getSocket();
      if (socket) {
        socket.emit('game_action', {
          roomId: props.roomData.roomId,
          action: { type: 'score_update', score: score.value }
        });
      }
    }
    
    const propChance = rowCount > 1 ? 1 : 0.25;
    if (random() < propChance) {
      const propKeys = Object.keys(inventory.value);
      const randomProp = propKeys[Math.floor(random() * propKeys.length)];
      inventory.value[randomProp]++;
      
      // 触发UI动画特效
      propEffects.value[randomProp] = true;
      setTimeout(() => { propEffects.value[randomProp] = false; }, 500);
      
      floatingTexts.push(new FloatingText(canvas.value.width / 2, canvas.value.height / 2, `+1 道具`, '#ffeb3b'));
    }

    if (linesCleared.value >= level.value * LINES_PER_LEVEL) {
      level.value++;
      if (level.value > MAX_LEVEL) {
        endGame(true); 
      } else {
        updateDropInterval();
      }
    }
  }
  checkTension();
}

function updateDropInterval() {
  let baseSpeed = props.difficulty === 'hard' ? 500 : (props.difficulty === 'easy' ? 1200 : 1000);
  const timeMultiplier = Math.pow(0.95, Math.floor(gameTime.value / 60)); 
  dropInterval = baseSpeed * Math.pow(0.85, level.value - 1) * timeMultiplier;
}

function playerDrop() {
  currentPiece.y++;
  if (collide(board, currentPiece)) {
    currentPiece.y--;
    
    if (currentPiece.isBomb) {
      explodeBomb(currentPiece);
    } else {
      merge(board, currentPiece);
      sweep();
    }
    
    resetPiece();
  }
  dropCounter = 0;
}

function playerHardDrop() {
  playSFX('drop');
  while (!collide(board, currentPiece)) {
    currentPiece.y++;
  }
  currentPiece.y--;
  
  if (currentPiece.isBomb) {
    explodeBomb(currentPiece);
  } else {
    merge(board, currentPiece);
    sweep();
  }
  
  resetPiece();
  dropCounter = 0;
}

function playerMove(dir) {
  currentPiece.x += dir;
  if (collide(board, currentPiece)) {
    currentPiece.x -= dir;
  }
}

function playerRotate() {
  const pos = currentPiece.x;
  let offset = 1;
  const matrix = currentPiece.matrix;
  currentPiece.matrix = rotate(currentPiece.matrix);
  
  while (collide(board, currentPiece)) {
    currentPiece.x += offset;
    offset = -(offset + (offset > 0 ? 1 : -1));
    if (offset > matrix[0].length) {
      currentPiece.matrix = matrix; 
      currentPiece.x = pos;
      return;
    }
  }
}

function explodeBomb(piece) {
  const cx = piece.x + Math.floor(piece.matrix[0].length / 2);
  const cy = piece.y + Math.floor(piece.matrix.length / 2);
  
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
        if (board[y][x] !== 0) {
          createExplosion(offsetX + x * BLOCK_SIZE + BLOCK_SIZE/2, offsetY + y * BLOCK_SIZE + BLOCK_SIZE/2, '#ff4757');
          board[y][x] = 0;
        }
      }
    }
  }
  checkTension();
  if (navigator.vibrate) navigator.vibrate(200);
}

function useProp(type) {
  if (inventory.value[type] <= 0 || isPaused.value) return;
  
  inventory.value[type]--;
  
  if (type === 'bomb') {
    currentPiece.isBomb = true;
    currentPiece.matrix = currentPiece.matrix.map(row => row.map(val => val ? 8 : 0)); 
  } else if (type === 'slowdown') {
    slowdownEndTime = performance.now() + 5000; 
  } else if (type === 'starClear') {
    for (let y = ROWS - 1; y >= 0; y--) {
      let hasBlock = false;
      for (let x = 0; x < COLS; x++) {
        if (board[y][x] !== 0) {
          hasBlock = true;
          createExplosion(offsetX + x * BLOCK_SIZE + BLOCK_SIZE/2, offsetY + y * BLOCK_SIZE + BLOCK_SIZE/2, STYLES[currentStyle.value].colors[board[y][x]]);
        }
      }
      if (hasBlock) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(0));
        score.value += 200 * level.value; 
        break;
      }
    }
    checkTension();
  } else if (type === 'transform') {
    const newShape = getRandomShape();
    currentPiece.matrix = newShape.matrix;
    currentPiece.isBomb = false;
    while (collide(board, currentPiece) && currentPiece.y > 0) {
      currentPiece.y--;
    }
  }
}

// 侧边栏预览逻辑
const nextPieceShapeRef = ref(null);

function isPreviewBlock(x, y) {
  if (!nextPieceShapeRef.value || !nextPieceShapeRef.value.matrix) return false;
  const matrix = nextPieceShapeRef.value.matrix;
  
  // 居中偏移计算
  const offsetY = Math.floor((4 - matrix.length) / 2);
  const offsetX = Math.floor((4 - matrix[0].length) / 2);
  
  if (y >= offsetY && y < offsetY + matrix.length && 
      x >= offsetX && x < offsetX + matrix[0].length) {
    return matrix[y - offsetY][x - offsetX] !== 0;
  }
  return false;
}

function getPreviewBlockStyle(piece) {
  if (!piece || !piece.matrix) return {};
  
  // 找到矩阵中第一个非零元素的值，以此确定颜色
  let colorValue = 0;
  for(let y=0; y<piece.matrix.length; y++) {
    for(let x=0; x<piece.matrix[y].length; x++) {
      if(piece.matrix[y][x] !== 0) {
        colorValue = piece.matrix[y][x];
        break;
      }
    }
    if(colorValue !== 0) break;
  }
  
  const style = STYLES[currentStyle.value];
  const color = style.colors[colorValue] || '#fff';
  
  // 根据不同风格返回不同的CSS，这里做简单处理，统一用背景色和圆角
  return {
    backgroundColor: color,
    borderRadius: currentStyle.value === 'warm' ? '4px' : 
                  currentStyle.value === 'animal' ? '50%' : '2px',
    boxShadow: currentStyle.value === 'cyberpunk' ? `0 0 5px ${color}` : 'none'
  };
}

function resetPiece() {
  currentPiece = nextPieceShape;
  nextPieceShape = getRandomShape();
  nextPieceShapeRef.value = nextPieceShape; // 同步给Vue模板
  
  if (isBombNext) {
    currentPiece.isBomb = true;
    currentPiece.matrix = currentPiece.matrix.map(row => row.map(val => val ? 8 : 0));
    isBombNext = false;
  }
  
  if (collide(board, currentPiece)) {
    endGame(false);
  }
}

function drawMatrix(matrix, offsetPos, isGhost = false, isBomb = false) {
  const style = STYLES[currentStyle.value];
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        const px = offsetX + (x + offsetPos.x) * BLOCK_SIZE;
        const py = offsetY + (y + offsetPos.y) * BLOCK_SIZE;
        
        const color = isBomb ? '#ff4757' : (value === 8 ? '#ff4757' : style.colors[value]);
        
        ctx.globalAlpha = isGhost ? 0.3 : 1.0;
        style.drawBlock(ctx, px, py, BLOCK_SIZE, color, isGhost, isBomb || value === 8);
        ctx.globalAlpha = 1.0;

        if (!isGhost && (isBomb || value === 8)) {
          ctx.fillStyle = '#fff';
          ctx.font = `${BLOCK_SIZE*0.6}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('💣', px + BLOCK_SIZE/2, py + BLOCK_SIZE/2);
        }
      }
    });
  });
}

function draw() {
  const style = STYLES[currentStyle.value];
  
  // 背景
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);
  
  // 修正坐标系统：由于 game-area 变为 flex 布局，canvas 的宽高需要仅为棋盘大小
  const canvasWidth = COLS * BLOCK_SIZE;
  const canvasHeight = ROWS * BLOCK_SIZE;
  
  // 调整 Canvas 实际大小
  if (canvas.value.width !== canvasWidth || canvas.value.height !== canvasHeight) {
    canvas.value.width = canvasWidth;
    canvas.value.height = canvasHeight;
  }
  
  offsetX = 0;
  offsetY = 0;
  
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
    if (isTense.value) {
      const pulse = (Math.sin(performance.now() * 0.005) + 1) / 2;
      ctx.fillStyle = `rgba(255, 0, 0, ${pulse * 0.15})`;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      
      ctx.strokeStyle = `rgba(255, 0, 0, ${pulse * 0.8})`;
      ctx.lineWidth = 10;
      ctx.strokeRect(0, 0, canvasWidth, canvasHeight);
    }
  
  // 绘制棋盘网格
  ctx.strokeStyle = style.grid;
  ctx.lineWidth = 1;
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY + y * BLOCK_SIZE);
    ctx.lineTo(offsetX + COLS * BLOCK_SIZE, offsetY + y * BLOCK_SIZE);
    ctx.stroke();
  }
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(offsetX + x * BLOCK_SIZE, offsetY);
    ctx.lineTo(offsetX + x * BLOCK_SIZE, offsetY + ROWS * BLOCK_SIZE);
    ctx.stroke();
  }
  
  // 棋盘边框
  ctx.strokeStyle = style.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX, offsetY, COLS * BLOCK_SIZE, ROWS * BLOCK_SIZE);
  
  drawMatrix(board, {x: 0, y: 0});
  
  if (currentPiece) {
    const ghost = { ...currentPiece, y: currentPiece.y };
    while (!collide(board, ghost)) {
      ghost.y++;
    }
    ghost.y--;
    drawMatrix(ghost.matrix, ghost, true);
    
    drawMatrix(currentPiece.matrix, currentPiece, false, currentPiece.isBomb);
  }
  
  // 粒子特效
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.update();
    p.draw(ctx);
  });
  
  floatingTexts = floatingTexts.filter(t => t.life > 0);
  floatingTexts.forEach(t => {
    t.update();
    t.draw(ctx);
  });
  
  if (slowdownEndTime > performance.now()) {
    ctx.fillStyle = 'rgba(46, 213, 115, 0.1)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.shadowColor = '#2ed573';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#2ed573';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvasWidth, canvasHeight);
    ctx.shadowBlur = 0;
  }
}

function update(time = 0) {
  if (!gameRunning || isPaused.value) {
    lastTime = time;
    animationId = requestAnimationFrame(update);
    return;
  }
  
  const deltaTime = time - lastTime;
  lastTime = time;
  
  gameTime.value = Math.floor((performance.now() - startTime) / 1000);
  
  if (gameTime.value > 0 && gameTime.value % 60 === 0) {
    updateDropInterval();
  }
  
  if (props.isMultiplayer && multiplayerTimeLimit.value > 0) {
    if (gameTime.value >= multiplayerTimeLimit.value) {
      endMultiplayerGame();
      return;
    }
  }
  
  dropCounter += deltaTime;
  
  let currentInterval = isFastDropping ? 50 : dropInterval; 
  if (slowdownEndTime > performance.now() && !isFastDropping) {
    currentInterval *= 2.5; 
  }
  
  if (dropCounter > currentInterval) {
    playerDrop();
  }
  
  // 紧张系统心跳音效
  if (isTense.value && performance.now() - lastHeartbeatTime > 800) {
    playSFX('heartbeat');
    lastHeartbeatTime = performance.now();
  }
  
  draw();
  animationId = requestAnimationFrame(update);
}

let touchStartX = 0;
let touchStartY = 0;
let lastTouchX = 0;
let lastTouchY = 0;
let touchMoved = false;

function handleTouchStart(e) {
  if (isPaused.value) return;
  e.preventDefault();
  initAudio(); // 用户交互时初始化音频
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  lastTouchX = touchStartX;
  lastTouchY = touchStartY;
  touchMoved = false;
}

function handleTouchMove(e) {
  if (isPaused.value) return;
  e.preventDefault();
  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  
  const dx = currentX - lastTouchX;
  const dy = currentY - lastTouchY;
  
  if (Math.abs(dx) > BLOCK_SIZE * 0.8 && Math.abs(dx) > Math.abs(dy)) {
    playerMove(dx > 0 ? 1 : -1);
    lastTouchX = currentX;
    touchMoved = true;
  }
  
  const totalDy = currentY - touchStartY;
  
  if (totalDy > BLOCK_SIZE * 1.5) {
    isFastDropping = true;
    touchMoved = true;
  } 
  else if (dy < -5 && isFastDropping) { 
    isFastDropping = false;
    touchStartY = currentY; 
    touchMoved = true;
  }
  
  lastTouchY = currentY;
}

function handleTouchEnd(e) {
  if (isPaused.value) return;
  e.preventDefault();
  
  isFastDropping = false;
  
  const totalDx = e.changedTouches[0].clientX - touchStartX;
  const totalDy = e.changedTouches[0].clientY - touchStartY;
  
  if (Math.abs(totalDx) < 10 && Math.abs(totalDy) < 10 && !touchMoved) {
    playerRotate();
  } 
  else if (totalDy > 80 && Math.abs(totalDx) < 30 && e.timeStamp - startTime < 300) {
    playerHardDrop();
  }
}

function handleKeyDown(e) {
  if (isPaused.value) return;
  initAudio(); // 初始化音频
  switch(e.key) {
    case 'ArrowLeft': playerMove(-1); break;
    case 'ArrowRight': playerMove(1); break;
    case 'ArrowDown': isFastDropping = true; break;
    case 'ArrowUp': playerRotate(); break;
    case ' ': playerHardDrop(); break;
  }
}

function handleKeyUp(e) {
  if (isPaused.value) return;
  if (e.key === 'ArrowDown') {
    isFastDropping = false;
  }
}

function setCanvasSize() {
  if (!canvas.value) return;
  
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.value.width = width;
  canvas.value.height = height;
  
  // 留出侧边栏 (约100px) 和底部道具栏 (100px) 的空间
  const availableHeight = height - 180; 
  const availableWidth = width - 120; // 为右侧预览留出空间
  
  BLOCK_SIZE = Math.min(Math.floor(availableWidth / COLS), Math.floor(availableHeight / ROWS));
  
  // 居中稍微偏左，给右侧预览留空间
  offsetX = Math.floor((width - COLS * BLOCK_SIZE - 90) / 2);
  offsetY = 10; // 取消了HUD硬编码高度，交由CSS flex处理
}

function togglePause() {
  isPaused.value = !isPaused.value;
  if (isPaused.value && currentBgm) {
    currentBgm.pause();
  } else if (!isPaused.value && currentBgm && !isMuted.value) {
    currentBgm.play();
  }
}

function changeStyle(styleKey) {
  currentStyle.value = styleKey;
  localStorage.setItem('tetris_style', styleKey);
  playBGM(); // 切换音乐
}

function endGame(victory = false) {
  if (props.isMultiplayer) {
    endMultiplayerGame();
    return;
  }
  gameRunning = false;
  cancelAnimationFrame(animationId);
  if (currentBgm) currentBgm.pause();
  emit('gameOver', score.value, victory);
}

function endMultiplayerGame() {
  gameRunning = false;
  cancelAnimationFrame(animationId);
  if (currentBgm) currentBgm.pause();
  
  const socket = getSocket();
  if (socket) {
    socket.emit('game_action', {
      roomId: props.roomData.roomId,
      action: { type: 'game_over', score: score.value }
    });
  }
  
  const isVictory = score.value > opponentScore.value;
  alert(`比赛结束！你的得分: ${score.value}, 对方得分: ${opponentScore.value}。${isVictory ? '你赢了！' : (score.value === opponentScore.value ? '平局！' : '你输了！')}`);
  emit('gameOver', score.value, isVictory);
}

function backToHub() {
  if (window.confirm('确定要返回主菜单吗？当前进度将丢失。')) {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    if (currentBgm) currentBgm.pause();
    emit('backToHub');
  }
}

function restartGame() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  score.value = 0;
  linesCleared.value = 0;
  level.value = 1;
  gameTime.value = 0;
  startTime = performance.now();
  isTense.value = false;
  inventory.value = { bomb: 1, slowdown: 1, starClear: 1, transform: 1 };
  updateDropInterval();
  nextPieceShape = getRandomShape();
  resetPiece();
  isPaused.value = false;
  if (currentBgm && !isMuted.value) currentBgm.play();
}

onMounted(() => {
  ctx = canvas.value.getContext('2d');
  setCanvasSize();
  window.addEventListener('resize', setCanvasSize);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  
  canvas.value.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.value.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.value.addEventListener('touchend', handleTouchEnd, { passive: false });
  
  if (props.isMultiplayer && props.roomData && props.roomData.seed) {
    rngSeed = props.roomData.seed;
    
    // Multiplayer settings
    if (props.roomData.timeLimit) {
      multiplayerTimeLimit.value = props.roomData.timeLimit * 60; // in seconds
    }
    
    const socket = getSocket();
    if (socket) {
      socket.on('game_action', (data) => {
        if (data.action.type === 'score_update') {
          opponentScore.value = data.action.score;
        } else if (data.action.type === 'game_over') {
          // 对手结束了
          endMultiplayerGame();
        }
      });
    }
  }

  board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  updateDropInterval();
  nextPieceShape = getRandomShape();
  nextPieceShapeRef.value = nextPieceShape;
  resetPiece();
  
  gameRunning = true;
  startTime = performance.now();
  update();
});

onUnmounted(() => {
  gameRunning = false;
  cancelAnimationFrame(animationId);
  if (currentBgm) currentBgm.pause();
  window.removeEventListener('resize', setCanvasSize);
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
});
</script>

<template>
  <div class="game-container" :style="{ backgroundColor: STYLES[currentStyle].bg }">
    <!-- 顶部 HUD -->
    <div class="hud-top" :style="{ borderColor: STYLES[currentStyle].border }">
      <button class="back-btn" @click="backToHub">←</button>
      <div class="stats">
        <div class="stat-item">
          <span class="label">LEVEL</span>
          <span class="value">{{ level }} / {{ MAX_LEVEL }}</span>
        </div>
        <div class="stat-item">
          <span class="label">SCORE</span>
          <span class="value score-val">{{ score }}</span>
        </div>
        <div v-if="isMultiplayer" class="stat-item">
          <span class="label" style="color: #2196f3">VS</span>
          <span class="value score-val" style="color: #2196f3">{{ opponentScore }}</span>
        </div>
        <div v-if="isMultiplayer" class="stat-item">
          <span class="label">TIME</span>
          <span class="value">{{ Math.max(0, multiplayerTimeLimit - gameTime) }}s</span>
        </div>
      </div>
      <button v-if="!isMultiplayer" class="pause-btn" @click="togglePause">{{ isPaused ? '▶️' : '⏸️' }}</button>
    </div>
    
    <!-- 暂停遮罩与菜单 -->
    <div v-if="isPaused" class="pause-overlay">
      <div class="pause-menu">
        <h2>游戏暂停</h2>
        
        <div class="menu-section">
          <h3>🎮 操作</h3>
          <button class="menu-btn primary" @click="togglePause">继续游戏</button>
          <button class="menu-btn warning" @click="restartGame">重新开始</button>
          <button class="menu-btn danger" @click="backToHub">返回菜单</button>
        </div>

        <div class="menu-section">
          <h3>🎨 风格切换</h3>
          <div class="style-grid">
            <button 
              v-for="(style, key) in STYLES" 
              :key="key"
              class="style-btn"
              :class="{ active: currentStyle === key }"
              @click="changeStyle(key)"
            >
              {{ style.name }}
            </button>
          </div>
        </div>

        <div class="menu-section">
          <h3>🔊 音频设置</h3>
          <div class="audio-controls">
            <button class="mute-btn" @click="toggleMute">{{ isMuted ? '🔇' : '🔊' }}</button>
            <input type="range" min="0" max="1" step="0.1" v-model="volume" @input="updateVolume" :disabled="isMuted" />
          </div>
        </div>
      </div>
    </div>

    <!-- 游戏画布与下一个方块预览区 -->
    <div class="game-area">
      <canvas ref="canvas"></canvas>
      
      <!-- 侧边栏 -->
      <div class="side-panel" :style="{ borderColor: STYLES[currentStyle].border, background: STYLES[currentStyle].bg }">
        <div class="next-piece-box">
          <div class="panel-title">NEXT</div>
          <div class="preview-grid" :class="[currentStyle]">
            <div v-for="y in 4" :key="'y'+y" class="preview-row">
              <div v-for="x in 4" :key="'x'+x" class="preview-cell">
                <div v-if="isPreviewBlock(x-1, y-1)" 
                     class="preview-block"
                     :style="getPreviewBlockStyle(nextPieceShape)">
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部道具栏 -->
    <div class="props-bar">
      <div class="prop-btn" :class="{ disabled: inventory.bomb <= 0, 'prop-gained': propEffects.bomb }" @click="useProp('bomb')">
        <span class="icon">💣</span>
        <span class="count">{{ inventory.bomb }}</span>
      </div>
      <div class="prop-btn" :class="{ disabled: inventory.slowdown <= 0, 'prop-gained': propEffects.slowdown }" @click="useProp('slowdown')">
        <span class="icon">⏱️</span>
        <span class="count">{{ inventory.slowdown }}</span>
      </div>
      <div class="prop-btn" :class="{ disabled: inventory.starClear <= 0, 'prop-gained': propEffects.starClear }" @click="useProp('starClear')">
        <span class="icon">⭐</span>
        <span class="count">{{ inventory.starClear }}</span>
      </div>
      <div class="prop-btn" :class="{ disabled: inventory.transform <= 0, 'prop-gained': propEffects.transform }" @click="useProp('transform')">
        <span class="icon">🔄</span>
        <span class="count">{{ inventory.transform }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  transition: background-color 0.5s ease;
}

.game-area {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding-top: 80px; /* HUD高度 */
}

canvas {
  display: block;
}

/* 侧边栏及预览区 */
.side-panel {
  width: 80px;
  padding: 10px;
  border-radius: 10px;
  border: 2px solid;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 10px;
}

.panel-title {
  font-size: 0.8rem;
  font-weight: bold;
  color: #666;
  margin-bottom: 10px;
  text-align: center;
}

.preview-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.preview-row {
  display: flex;
  gap: 2px;
}

.preview-cell {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-block {
  width: 100%;
  height: 100%;
  background: #ccc; /* fallback */
}

/* 顶部 HUD */
.hud-top {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 500px;
  height: 60px;
  background: rgba(128, 128, 128, 0.2);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 15px;
  z-index: 10;
  transition: border-color 0.5s ease;
}

.back-btn, .pause-btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(128, 128, 128, 0.3);
  border: none;
  color: #fff;
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stats {
  display: flex;
  gap: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.label {
  font-size: 0.7rem;
  color: #666;
  letter-spacing: 1px;
  font-weight: bold;
}

.value {
  font-size: 1.2rem;
  font-weight: bold;
  color: #333;
}

.score-val {
  color: #ff4757;
  text-shadow: 0 0 5px rgba(255, 71, 87, 0.3);
}

/* 底部道具栏 */
.props-bar {
  position: absolute;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 400px;
  display: flex;
  justify-content: space-between;
  z-index: 10;
}

.prop-btn {
  width: 60px;
  height: 60px;
  background: rgba(255, 255, 255, 0.3);
  border: 2px solid rgba(128, 128, 128, 0.5);
  border-radius: 15px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  backdrop-filter: blur(5px);
}

.prop-btn:active {
  transform: scale(0.9);
}

.prop-btn.disabled {
  opacity: 0.5;
  filter: grayscale(1);
  pointer-events: none;
}

.prop-gained {
  animation: propPop 0.5s ease-out;
}

@keyframes propPop {
  0% { transform: scale(1); box-shadow: 0 0 0 rgba(255, 235, 59, 0); }
  50% { transform: scale(1.3); box-shadow: 0 0 20px rgba(255, 235, 59, 0.8); border-color: #ffeb3b; }
  100% { transform: scale(1); box-shadow: 0 0 0 rgba(255, 235, 59, 0); }
}

.icon {
  font-size: 1.8rem;
}

.count {
  position: absolute;
  top: -8px;
  right: -8px;
  background: #ff4757;
  color: white;
  font-size: 0.8rem;
  font-weight: bold;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 5px rgba(0,0,0,0.3);
}

/* 暂停遮罩与菜单 */
.pause-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(5px);
}

.pause-menu {
  background: rgba(255, 255, 255, 0.1);
  padding: 2rem;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  width: 90%;
  max-width: 400px;
  color: white;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}

.pause-menu h2 {
  text-align: center;
  margin: 0;
  font-size: 1.8rem;
  color: #fff;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5);
}

.menu-section h3 {
  font-size: 1rem;
  color: #ccc;
  margin-bottom: 0.8rem;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding-bottom: 0.3rem;
}

.menu-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  font-size: 1.1rem;
  font-weight: bold;
  color: white;
  cursor: pointer;
  margin-bottom: 0.5rem;
  transition: opacity 0.2s;
}

.menu-btn:hover { opacity: 0.9; }
.menu-btn.primary { background: #4caf50; }
.menu-btn.warning { background: #ff9800; }
.menu-btn.danger { background: #f44336; }

.style-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.style-btn {
  padding: 10px;
  border: 1px solid rgba(255,255,255,0.3);
  background: rgba(0,0,0,0.3);
  color: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.style-btn.active {
  background: #2196f3;
  border-color: #64b5f6;
  font-weight: bold;
}

.audio-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.mute-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: white;
}

input[type=range] {
  flex: 1;
  accent-color: #2196f3;
}
</style>