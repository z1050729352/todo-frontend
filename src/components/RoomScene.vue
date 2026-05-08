<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getAuthData } from '../utils/auth';
import { getSocket } from '../socket';
import { apiFetchJson } from '../utils/api';
import { showToast } from '../utils/toast';

// ── 局域网检测 ────────────────────────────────────────────────────────────────
// 通过 WebRTC ICE candidate 获取本机局域网 IP 前缀（如 192.168.1.x → 192.168.1）
// 两端前缀相同 → 同一局域网
async function getLocalIpPrefix() {
  return new Promise((resolve) => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('');
      const ips = new Set();
      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          pc.close();
          // 取第一个私有 IP 的 /24 前缀
          for (const ip of ips) {
            if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip)) {
              resolve(ip.split('.').slice(0, 3).join('.'));
              return;
            }
          }
          resolve(null);
          return;
        }
        const m = e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (m) ips.add(m[1]);
      };
      pc.createOffer().then((o) => pc.setLocalDescription(o));
      setTimeout(() => { pc.close(); resolve(null); }, 2000);
    } catch {
      resolve(null);
    }
  });
}

const props = defineProps({
  roomData: Object,
  playerName: String
});

const emit = defineEmits(['startGame', 'leaveRoom']);

const meId = getAuthData()?.user?.id;
const authToken = getAuthData()?.token;

const state = ref(null);
const isStarting = ref(false);
const highlight = ref(false);
const selectingGame = ref(false);
const selectingType = ref('');
const planeDifficulty = ref('medium');
const tetrisDifficulty = ref('medium');
const tetrisTimeLimit = ref(3);
const isSavingReady = ref(false);
const isSavingGame = ref(false);

let highlightTimer = null;
let disconnectTimer = null;
let startTimer = null;

const roomId = computed(() => String(props.roomData?.roomId || ''));
const isHost = computed(() => String(state.value?.hostId || '') === String(meId || ''));

const players = computed(() => Array.isArray(state.value?.players) ? state.value.players : []);
const hostPlayer = computed(() => players.value.find((p) => String(p?.id) === String(state.value?.hostId || '')) || null);
const guestPlayers = computed(() => players.value.filter((p) => String(p?.id) !== String(state.value?.hostId || '')));
const me = computed(() => players.value.find((p) => String(p?.id) === String(meId || '')) || null);

const canStart = computed(() => {
  if (!isHost.value) return false;
  if (!state.value?.gameType) return false;
  if (guestPlayers.value.length === 0) return false;
  return guestPlayers.value.every((p) => Boolean(p?.ready));
});

function cleanupTimers() {
  if (highlightTimer) clearTimeout(highlightTimer);
  if (disconnectTimer) clearTimeout(disconnectTimer);
  if (startTimer) clearTimeout(startTimer);
  highlightTimer = null;
  disconnectTimer = null;
  startTimer = null;
}

async function fetchRoomState() {
  if (!roomId.value || !authToken) return;
  const data = await apiFetchJson(`/room/state?roomId=${encodeURIComponent(roomId.value)}`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  state.value = data;
  if (data?.settings?.difficulty) {
    if (data?.settings?.gameType === 'tetris') {
      tetrisDifficulty.value = data.settings.difficulty;
    } else if (data?.settings?.gameType === 'plane-war') {
      planeDifficulty.value = data.settings.difficulty;
    }
  }
  if (data?.settings?.timeLimit && data?.settings?.gameType === 'tetris') {
    tetrisTimeLimit.value = data.settings.timeLimit;
  }
}

function pulseHighlight() {
  highlight.value = true;
  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    highlight.value = false;
  }, 1500);
}

async function setGame(config) {
  if (!isHost.value || !roomId.value || !authToken) return;
  if (isSavingGame.value) return;
  const gt = String(config?.gameType || '');
  if (!gt) return;
  const difficulty = String(config?.difficulty || '');
  const timeLimit = config?.timeLimit;
  const settings = gt === 'tetris'
    ? { gameType: gt, difficulty: difficulty || 'medium', timeLimit: Number(timeLimit || 3) }
    : { gameType: gt, difficulty: difficulty || 'medium' };
  isSavingGame.value = true;
  try {
    await apiFetchJson('/room/setGame', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: { roomId: roomId.value, gameType: gt, settings }
    });
    selectingGame.value = false;
    selectingType.value = '';
  } catch (e) {
    showToast(e?.message || '同步失败', 'error');
  } finally {
    isSavingGame.value = false;
  }
}

async function toggleReady() {
  if (!roomId.value || !authToken) return;
  if (isSavingReady.value) return;
  const next = !Boolean(me.value?.ready);
  isSavingReady.value = true;
  try {
    await apiFetchJson('/room/ready', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: { roomId: roomId.value, ready: next }
    });
    if (state.value && Array.isArray(state.value.players)) {
      state.value = {
        ...state.value,
        players: state.value.players.map((p) => {
          if (String(p?.id) !== String(meId || '')) return p;
          return { ...p, ready: next };
        })
      };
    }
  } catch (e) {
    showToast(e?.message || '操作失败', 'error');
  } finally {
    isSavingReady.value = false;
  }
}

async function startGame() {
  if (!canStart.value || !roomId.value || !authToken) return;
  await apiFetchJson('/room/start', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}` },
    body: { roomId: roomId.value }
  });
}

function leaveRoom() {
  const socket = getSocket();
  if (socket && roomId.value) socket.emit('leave_room', { roomId: roomId.value });
  emit('leaveRoom');
}

function scheduleStart(payload) {
  if (isStarting.value) return;
  isStarting.value = true;
  const gameType = payload?.gameType || payload?.settings?.gameType || state.value?.gameType;
  const settings = payload?.settings || state.value?.settings || { gameType };
  const seed = payload?.seed;
  const startAt = Number(payload?.startAt);
  const delay = Number.isFinite(startAt) ? Math.max(0, Math.min(10000, startAt - Date.now())) : 3000;
  startTimer = setTimeout(() => {
    emit('startGame', { ...settings, gameType, seed });
  }, delay);
}

function onDisconnect() {
  if (disconnectTimer) return;
  disconnectTimer = setTimeout(() => {
    showToast('网络异常', 'error', 5000);
    leaveRoom();
  }, 5000);
}

function onConnect() {
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }
  const socket = getSocket();
  if (socket && roomId.value) socket.emit('rejoin_room', { roomId: roomId.value });
  fetchRoomState().catch(() => {});
}

onMounted(() => {
  fetchRoomState().catch((e) => showToast(e?.message || '加载房间失败', 'error'));
  const socket = getSocket();
  if (!socket) return;

  if (roomId.value) socket.emit('rejoin_room', { roomId: roomId.value });

  socket.on('room_state', (next) => {
    if (String(next?.roomId || '') !== roomId.value) return;
    state.value = next;
    if (!selectingGame.value) {
      if (next?.settings?.difficulty) {
        if (next?.settings?.gameType === 'tetris') {
          tetrisDifficulty.value = next.settings.difficulty;
        } else if (next?.settings?.gameType === 'plane-war') {
          planeDifficulty.value = next.settings.difficulty;
        }
      }
      if (next?.settings?.timeLimit && next?.settings?.gameType === 'tetris') {
        tetrisTimeLimit.value = next.settings.timeLimit;
      }
    }
  });
  socket.on('room_game_changed', (p) => {
    if (String(p?.roomId || '') !== roomId.value) return;
    pulseHighlight();
  });
  socket.on('room_host_changed', (p) => {
    if (String(p?.roomId || '') !== roomId.value) return;
    pulseHighlight();
  });
  socket.on('room_disbanded', (p) => {
    if (String(p?.roomId || '') !== roomId.value) return;
    showToast('房间已解散', 'warning', 5000);
    emit('leaveRoom');
  });
  socket.on('room_game_start', (p) => {
    if (String(p?.roomId || '') !== roomId.value) return;
    scheduleStart(p);
  });
  socket.on('disconnect', onDisconnect);
  socket.on('connect', onConnect);
});

onUnmounted(() => {
  cleanupTimers();
  const socket = getSocket();
  if (!socket) return;
  socket.off('room_state');
  socket.off('room_game_changed');
  socket.off('room_host_changed');
  socket.off('room_disbanded');
  socket.off('room_game_start');
  socket.off('disconnect', onDisconnect);
  socket.off('connect', onConnect);
});
</script>

<template>
  <div class="room-root">
    <div class="cloud cloud-1"></div>
    <div class="cloud cloud-2"></div>
    <div class="cloud cloud-3"></div>

    <div class="top-bar">
      <button class="back" @click="leaveRoom">← 返回</button>
      <div class="title">温馨房间</div>
      <button v-if="isHost" class="game-select" @click="selectingGame = true">游戏选择</button>
      <div v-else></div>
    </div>

    <div class="avatars">
      <div class="avatar-card" :class="{ host: true }">
        <div class="avatar-ring" :class="{ online: hostPlayer?.online }">
          <div class="avatar">{{ (hostPlayer?.username || 'Host').slice(0, 1).toUpperCase() }}</div>
        </div>
        <div class="meta">
          <div class="name">{{ hostPlayer?.username || '房主' }}</div>
          <div class="badge">房主</div>
        </div>
      </div>

      <div class="avatar-card" v-for="p in guestPlayers" :key="p.id">
        <div class="avatar-ring" :class="{ online: p.online, ready: p.ready }">
          <div class="avatar">{{ (p.username || 'G').slice(0, 1).toUpperCase() }}</div>
          <div v-if="p.ready" class="check">✓</div>
        </div>
        <div class="meta">
          <div class="name">{{ p.username || '队友' }}</div>
          <div class="badge" :class="{ ready: p.ready }">{{ p.ready ? '已准备' : '等待中' }}</div>
        </div>
      </div>
    </div>

    <div class="table" :class="{ highlight }">
      <div class="table-inner">
        <div class="game-card">
          <div class="game-name">{{ state?.gameType ? (state?.gameType === 'tetris' ? '俄罗斯方块' : '飞机大战') : '等待房主选择' }}</div>
          <div class="game-desc" v-if="state?.settings?.difficulty">难度：{{ state.settings.difficulty }}</div>
          <div class="game-desc" v-if="state?.settings?.timeLimit && state?.settings?.gameType === 'tetris'">时间：{{ state.settings.timeLimit }} 分钟</div>
        </div>

        <div class="actions">
          <button v-if="!isHost" class="btn ghost" :disabled="true">等待房主选择</button>
          <button v-if="!isHost" class="btn primary" :class="{ ready: me?.ready }" :disabled="isSavingReady" @click="toggleReady">{{ me?.ready ? '取消准备' : '准备' }}</button>
          <button v-else class="btn start" :class="{ enabled: canStart }" :disabled="!canStart" @click="startGame">开始游戏</button>
        </div>
      </div>
    </div>

    <div v-if="selectingGame && isHost" class="modal-overlay" @click.self="selectingGame = false; selectingType = ''">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">选择游戏</div>
          <button class="modal-close" @click="selectingGame = false; selectingType = ''">×</button>
        </div>

        <div class="game-options">
          <div class="game-option" :class="{ active: selectingType === 'plane-war' }" @click="selectingType = selectingType === 'plane-war' ? '' : 'plane-war'">
            <div class="game-option-title">✈️ 飞机大战</div>
            <div class="game-option-sub">经典射击，挑战高分</div>
            <div v-if="selectingType === 'plane-war'" class="game-expand" @click.stop>
              <div class="field">
                <div class="label">难度</div>
                <select v-model="planeDifficulty">
                  <option value="easy">简单</option>
                  <option value="medium">普通</option>
                  <option value="hard">困难</option>
                </select>
              </div>
              <button class="btn primary" :disabled="isSavingGame" @click="setGame({ gameType: 'plane-war', difficulty: planeDifficulty })">确认</button>
            </div>
          </div>

          <div class="game-option" :class="{ active: selectingType === 'tetris' }" @click="selectingType = selectingType === 'tetris' ? '' : 'tetris'">
            <div class="game-option-title">🧱 俄罗斯方块</div>
            <div class="game-option-sub">限时对战，拼手速</div>
            <div v-if="selectingType === 'tetris'" class="game-expand" @click.stop>
              <div class="field">
                <div class="label">难度</div>
                <select v-model="tetrisDifficulty">
                  <option value="easy">简单</option>
                  <option value="medium">普通</option>
                  <option value="hard">困难</option>
                </select>
              </div>
              <div class="field">
                <div class="label">时长</div>
                <div class="radio-row">
                  <label class="radio">
                    <input v-model="tetrisTimeLimit" type="radio" :value="3" />
                    <span>3分钟</span>
                  </label>
                  <label class="radio">
                    <input v-model="tetrisTimeLimit" type="radio" :value="5" />
                    <span>5分钟</span>
                  </label>
                  <label class="radio">
                    <input v-model="tetrisTimeLimit" type="radio" :value="10" />
                    <span>10分钟</span>
                  </label>
                </div>
              </div>
              <button class="btn primary" :disabled="isSavingGame" @click="setGame({ gameType: 'tetris', difficulty: tetrisDifficulty, timeLimit: tetrisTimeLimit })">确认</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isStarting" class="starting">
      <div class="starting-card">
        <div class="starting-title">即将开始</div>
        <div class="bar"><div class="bar-inner"></div></div>
        <div class="starting-sub">同步加载中…</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.room-root {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: linear-gradient(135deg, #0b163a 0%, #1d2b64 40%, #764ba2 100%);
  /* 去掉 radial-gradient 叠加，减少 GPU 合成层 */
}

/* 去掉云朵动画，它会持续触发重绘 */
.cloud { display: none; }

.top-bar {
  position: absolute;
  top: calc(14px + var(--safe-area-top, 0px));
  left: 14px;
  right: 14px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  z-index: 10;
}

.back {
  justify-self: start;
  border: 1px solid rgba(255,255,255,0.25);
  background: rgba(0,0,0,0.25);
  color: #fff;
  padding: 10px 12px;
  border-radius: 14px;
}

.title {
  color: rgba(255,255,255,0.95);
  font-weight: 800;
  letter-spacing: 1px;
}

.game-select {
  justify-self: end;
  border: 1px solid rgba(255,255,255,0.25);
  background: rgba(0,0,0,0.25);
  color: #fff;
  padding: 10px 12px;
  border-radius: 14px;
}

.cloud {
  position: absolute;
  width: 220px;
  height: 90px;
  background: rgba(255,255,255,0.09);
  filter: blur(1px);
  border-radius: 60px;
  top: 18%;
  left: -240px;
  animation: drift 18s linear infinite;
}

.cloud::before, .cloud::after {
  content: '';
  position: absolute;
  background: rgba(255,255,255,0.09);
  border-radius: 60px;
}

.cloud::before {
  width: 110px;
  height: 80px;
  left: 30px;
  top: -30px;
}

.cloud::after {
  width: 140px;
  height: 90px;
  left: 90px;
  top: -20px;
}

.cloud-2 { top: 44%; animation-duration: 22s; opacity: 0.85; }
.cloud-3 { top: 70%; animation-duration: 28s; opacity: 0.75; }

@keyframes drift {
  0% { transform: translateX(0); }
  100% { transform: translateX(calc(100vw + 480px)); }
}

.avatars {
  position: absolute;
  top: calc(86px + var(--safe-area-top, 0px));
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 18px;
  padding: 0 18px;
  z-index: 10;
}

.avatar-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.16);
}

.avatar-ring {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.25);
  display: grid;
  place-items: center;
  position: relative;
}

.avatar-ring.online { border-color: rgba(0,255,180,0.65); box-shadow: 0 0 0 6px rgba(0,255,180,0.09); }
.avatar-ring.ready { border-color: rgba(255,210,60,0.75); box-shadow: 0 0 0 6px rgba(255,210,60,0.12); }

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255,255,255,0.12);
  color: #fff;
  font-weight: 900;
  display: grid;
  place-items: center;
}

.check {
  position: absolute;
  right: -6px;
  bottom: -6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(0,255,160,0.85);
  color: #06201a;
  font-weight: 900;
  display: grid;
  place-items: center;
  border: 2px solid rgba(0,0,0,0.25);
}

.meta .name { color: rgba(255,255,255,0.95); font-weight: 800; }
.meta .badge {
  margin-top: 4px;
  font-size: 12px;
  color: rgba(255,255,255,0.7);
}
.meta .badge.ready { color: rgba(0,255,180,0.9); }

.table {
  position: absolute;
  left: 50%;
  top: 52%;
  transform: translate(-50%, -50%);
  width: min(680px, calc(100vw - 36px));
  border-radius: 26px;
  padding: 18px;
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.16);
  z-index: 10;
}

.table.highlight {
  box-shadow: 0 0 0 6px rgba(255,255,255,0.08), 0 18px 55px rgba(0,0,0,0.45);
}

.table-inner {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.game-card {
  border-radius: 22px;
  padding: 16px;
  background: linear-gradient(135deg, rgba(0,255,180,0.12), rgba(255,255,255,0.05));
  border: 1px solid rgba(255,255,255,0.16);
}

.game-name { color: rgba(255,255,255,0.96); font-weight: 900; font-size: 18px; }
.game-desc { color: rgba(255,255,255,0.75); margin-top: 6px; }

.actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.btn {
  border-radius: 16px;
  padding: 12px 16px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.10);
  color: #fff;
}

.btn:disabled {
  opacity: 0.55;
}

.btn.primary {
  background: linear-gradient(135deg, rgba(255,210,60,0.95), rgba(255,140,60,0.95));
  border: none;
  color: #2a0f00;
  font-weight: 900;
}

.btn.primary.ready {
  background: linear-gradient(135deg, rgba(255,120,120,0.95), rgba(255,70,120,0.95));
  color: #fff;
}

.btn.start {
  background: rgba(255,255,255,0.10);
}

.btn.start.enabled {
  background: linear-gradient(135deg, rgba(255,210,60,0.95), rgba(255,140,60,0.95));
  border: none;
  color: #2a0f00;
  font-weight: 900;
}

.btn.ghost {
  background: rgba(0,0,0,0.20);
}

.modal-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: grid;
  place-items: center;
  z-index: 50;
}

.modal-card {
  width: min(560px, calc(100vw - 36px));
  border-radius: 24px;
  padding: 18px;
  background: rgba(10, 14, 39, 0.96);
  border: 1px solid rgba(255,255,255,0.18);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.modal-title { color: rgba(255,255,255,0.95); font-weight: 900; }

.modal-close {
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(0,0,0,0.25);
  color: rgba(255,255,255,0.95);
  width: 34px;
  height: 34px;
  border-radius: 12px;
}

.game-options { display: grid; gap: 12px; }

.game-option {
  border-radius: 20px;
  padding: 14px;
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(255,255,255,0.05);
}

.game-option.active {
  background: rgba(0,255,180,0.12);
  border-color: rgba(0,255,180,0.28);
}

.game-option-title { color: rgba(255,255,255,0.96); font-weight: 900; }
.game-option-sub { margin-top: 6px; color: rgba(255,255,255,0.72); font-size: 12px; }

.game-expand { margin-top: 12px; display: grid; gap: 12px; }
.field { display: grid; gap: 8px; }
.label { color: rgba(255,255,255,0.75); font-size: 12px; }
select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(0,0,0,0.25);
  color: rgba(255,255,255,0.92);
}

.radio-row { display: flex; gap: 12px; flex-wrap: wrap; }
.radio {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(0,0,0,0.18);
  color: rgba(255,255,255,0.92);
}

.radio input { accent-color: rgba(255,210,60,0.95); }

.starting {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: grid;
  place-items: center;
  z-index: 60;
}

.starting-card {
  width: min(420px, calc(100vw - 36px));
  border-radius: 24px;
  padding: 18px;
  background: rgba(10, 14, 39, 0.92);
  border: 1px solid rgba(255,255,255,0.18);
  text-align: center;
}

.starting-title { color: rgba(255,255,255,0.95); font-weight: 900; font-size: 18px; }
.starting-sub { margin-top: 10px; color: rgba(255,255,255,0.75); }
.bar { margin-top: 14px; height: 10px; border-radius: 999px; background: rgba(255,255,255,0.10); overflow: hidden; }
.bar-inner {
  height: 100%;
  width: 100%;
  background: linear-gradient(90deg, rgba(0,255,180,0.85), rgba(255,210,60,0.95));
  transform-origin: left;
  animation: fill 3s linear forwards;
}

@keyframes fill {
  0% { transform: scaleX(0); }
  100% { transform: scaleX(1); }
}

@media (max-width: 520px) {
  .avatars { flex-direction: column; align-items: center; top: calc(72px + var(--safe-area-top, 0px)); }
}
</style>
