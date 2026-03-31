<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { getAuthData } from '../utils/auth';
import { getSocket } from '../socket';
import { showToast } from '../utils/toast';
import { apiFetchJson } from '../utils/api';

const props = defineProps({
  isGuest: Boolean
});

const friends = ref([]);
const requests = ref([]);
const searchUsername = ref('');
const searchResult = ref(null);
const showModal = ref(false);
const onlineStatus = ref({});
const inviteCooldowns = ref({});

let inviteCooldownInterval = null;
let fallbackSyncInterval = null;
const lastOnlineToastAt = new Map();

const FRIENDS_CACHE_KEY = 'friends_cache_v1';
const FRIENDS_STATUS_CACHE_KEY = 'friends_status_cache_v1';

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function loadCache() {
  if (typeof window === 'undefined') return;
  const friendsRaw = window.localStorage.getItem(FRIENDS_CACHE_KEY);
  const statusRaw = window.localStorage.getItem(FRIENDS_STATUS_CACHE_KEY);
  const cachedFriends = friendsRaw ? safeParse(friendsRaw) : null;
  const cachedStatus = statusRaw ? safeParse(statusRaw) : null;
  if (Array.isArray(cachedFriends)) friends.value = cachedFriends;
  if (cachedStatus && typeof cachedStatus === 'object') onlineStatus.value = cachedStatus;
}

function persistCache() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FRIENDS_CACHE_KEY, JSON.stringify(friends.value || []));
    window.localStorage.setItem(FRIENDS_STATUS_CACHE_KEY, JSON.stringify(onlineStatus.value || {}));
  } catch {}
}

async function fetchFriends() {
  if (props.isGuest) return;
  const auth = getAuthData();
  if (!auth) return;
  
  try {
    const data = await apiFetchJson('/friends', {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    });
    friends.value = data.friends || [];
    requests.value = data.requests || [];
    subscribeOnlineStatus();
  } catch (err) {
    console.error(err);
  }
}

async function searchUser() {
  if (!searchUsername.value.trim()) return;
  const auth = getAuthData();
  try {
    const data = await apiFetchJson(`/friends/search?username=${encodeURIComponent(searchUsername.value)}`, {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    });
    searchResult.value = data;
  } catch (err) {
    console.error(err);
    showToast(err?.message || '搜索失败', 'error');
  }
}

async function sendRequest(userId) {
  const auth = getAuthData();
  try {
    await apiFetchJson('/friends/request', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${auth.token}`,
      },
      body: { targetUserId: userId }
    });
    showToast('请求已发送', 'success');
    searchResult.value.relation = 'pending';
  } catch (err) {
    console.error(err);
    showToast(err?.message || '发送请求失败', 'error');
  }
}

async function handleRequest(requestId, action) {
  const auth = getAuthData();
  try {
    await apiFetchJson('/friends/handle', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${auth.token}`,
      },
      body: { requestId, action }
    });
    requests.value = (requests.value || []).filter((r) => String(r?._id) !== String(requestId));
    if (action === 'accepted') {
      showToast('已接受好友请求', 'success');
    } else {
      showToast('已拒绝好友请求', 'info');
    }
  } catch (err) {
    console.error(err);
  }
}

function subscribeOnlineStatus() {
  const socket = getSocket();
  if (!socket) return;
  const ids = (friends.value || []).map((f) => f?.id).filter(Boolean);
  if (ids.length === 0) return;
  socket.emit('subscribe_friends_status', { friendIds: ids });
}

function getInviteKey(friendId, gameType) {
  return `${friendId}_${gameType}`;
}

function getInviteCooldown(friendId, gameType) {
  return inviteCooldowns.value[getInviteKey(friendId, gameType)] || 0;
}

function getInviteButtonText(friendId, gameType) {
  const cooldown = getInviteCooldown(friendId, gameType);
  if (cooldown > 0) return `${cooldown}s`;
  return gameType === 'plane-war' ? '✈️ 邀请' : '🧱 邀请';
}

function inviteFriend(friendId, gameType) {
  if (getInviteCooldown(friendId, gameType) > 0) return;
  const socket = getSocket();
  if (socket) {
    socket.emit('invite_friend', { friendId, gameType });
    inviteCooldowns.value[getInviteKey(friendId, gameType)] = 10;
    showToast('邀请已发送', 'success');
  }
}

onMounted(() => {
  loadCache();
  fetchFriends();
  const socket = getSocket();
  if (socket) {
    socket.on('online_status_update', (status) => {
      if (!status || typeof status !== 'object') return;
      onlineStatus.value = { ...(onlineStatus.value || {}), ...status };
      persistCache();
    });
    socket.on('friend_status_update', (payload) => {
      const friendId = String(payload?.friendId || '');
      if (!friendId) return;
      const online = Boolean(payload?.online);
      const prev = Boolean(onlineStatus.value?.[friendId]);
      onlineStatus.value = { ...(onlineStatus.value || {}), [friendId]: online };
      persistCache();
      if (!prev && online) {
        const now = Date.now();
        const lastAt = lastOnlineToastAt.get(friendId) || 0;
        if (now - lastAt >= 8000) {
          lastOnlineToastAt.set(friendId, now);
          const name = payload?.username || (friends.value || []).find((f) => f?.id === friendId)?.username || '好友';
          showToast(`您的好友${name}已上线`, 'info', 5000);
        }
      }
    });
    socket.on('friend_added', (payload) => {
      const friend = payload?.friend;
      const id = String(friend?.id || '');
      const username = String(friend?.username || '');
      if (!id || !username) return;
      const exists = (friends.value || []).some((f) => String(f?.id) === id);
      if (!exists) {
        friends.value = [...(friends.value || []), { id, username }];
        persistCache();
        subscribeOnlineStatus();
      }
    });
    socket.on('friend_request_created', (payload) => {
      const request = payload?.request;
      const requesterName = String(request?.requester?.username || '');
      if (requesterName) {
        showToast(`收到来自 ${requesterName} 的好友请求`, 'info', 5000);
      } else {
        showToast('收到新的好友请求', 'info', 5000);
      }
      fetchFriends();
    });
    socket.on('connect', () => {
      subscribeOnlineStatus();
    });
  }
  fallbackSyncInterval = setInterval(() => {
    const socket = getSocket();
    if (!socket) return;
    const ids = (friends.value || []).map((f) => f?.id).filter(Boolean);
    if (ids.length === 0) return;
    socket.emit('get_online_status', ids);
  }, 30000);
  inviteCooldownInterval = setInterval(() => {
    const next = {};
    Object.entries(inviteCooldowns.value).forEach(([key, value]) => {
      if (value > 1) next[key] = value - 1;
    });
    inviteCooldowns.value = next;
  }, 1000);
});

onUnmounted(() => {
  clearInterval(fallbackSyncInterval);
  clearInterval(inviteCooldownInterval);
  const socket = getSocket();
  if (socket) {
    socket.off('online_status_update');
    socket.off('friend_status_update');
    socket.off('friend_added');
    socket.off('friend_request_created');
    socket.off('connect');
  }
});

watch(friends, () => {
  persistCache();
  subscribeOnlineStatus();
}, { deep: true });

watch(showModal, (open) => {
  if (open) fetchFriends();
});

</script>

<template>
  <div v-if="!isGuest" class="friend-system">
    <button class="friends-btn" @click="showModal = true">👥 好友系统</button>
    
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h2>好友列表</h2>
          <button class="close-btn" @click="showModal = false">×</button>
        </div>
        
        <div class="search-section">
          <input v-model="searchUsername" placeholder="搜索玩家名..." @keyup.enter="searchUser" />
          <button @click="searchUser">搜索</button>
        </div>
        
        <div v-if="searchResult" class="search-result">
          <span>{{ searchResult.user.username }}</span>
          <button v-if="searchResult.relation === 'none'" @click="sendRequest(searchResult.user._id)">加好友</button>
          <span v-else class="status-badge">{{ searchResult.relation === 'accepted' ? '已是好友' : '请求中' }}</span>
        </div>
        
        <div v-if="requests.length > 0" class="requests-section">
          <h3>好友请求</h3>
          <div v-for="req in requests" :key="req._id" class="request-item">
            <span>{{ req.requester.username }}</span>
            <div class="actions">
              <button class="accept" @click="handleRequest(req._id, 'accepted')">接受</button>
              <button class="reject" @click="handleRequest(req._id, 'rejected')">拒绝</button>
            </div>
          </div>
        </div>
        
        <div class="friends-list">
          <h3>我的好友</h3>
          <p v-if="friends.length === 0" class="empty">暂无好友</p>
          <div v-for="friend in friends" :key="friend.id" class="friend-item">
            <div class="friend-info">
              <span class="status-dot" :class="{ online: onlineStatus[friend.id] }"></span>
              <span>{{ friend.username }}</span>
            </div>
            <div class="invite-actions" v-if="onlineStatus[friend.id]">
              <button :disabled="getInviteCooldown(friend.id, 'plane-war') > 0" :class="{ cooling: getInviteCooldown(friend.id, 'plane-war') > 0 }" @click="inviteFriend(friend.id, 'plane-war')">{{ getInviteButtonText(friend.id, 'plane-war') }}</button>
              <button :disabled="getInviteCooldown(friend.id, 'tetris') > 0" :class="{ cooling: getInviteCooldown(friend.id, 'tetris') > 0 }" @click="inviteFriend(friend.id, 'tetris')">{{ getInviteButtonText(friend.id, 'tetris') }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.friends-btn {
  position: absolute;
  top: calc(25px + var(--safe-area-top, 0px));
  left: 25px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255,255,255,0.3);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  cursor: pointer;
  z-index: 110;
}

@media (max-width: 420px) {
  .friends-btn {
    top: calc(12px + var(--safe-area-top, 0px));
    left: 12px;
    padding: 6px 12px;
    font-size: 0.85rem;
  }
}

.modal-overlay {
  position: fixed;
  top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.8);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #1a1a2e;
  border: 1px solid #f093fb;
  border-radius: 15px;
  padding: 20px;
  width: 90%;
  max-width: 400px;
  color: white;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 20px;
}

.close-btn {
  background: none; border: none; color: white; font-size: 24px; cursor: pointer;
}

.search-section {
  display: flex; gap: 10px; margin-bottom: 15px;
}

.search-section input {
  flex: 1; padding: 8px; border-radius: 8px; border: none; outline: none;
}

.search-section button {
  padding: 8px 15px; background: #2196f3; color: white; border: none; border-radius: 8px; cursor: pointer;
}

.search-result, .request-item, .friend-item {
  display: flex; justify-content: space-between; align-items: center;
  background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 10px;
}

.status-dot {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%;
  background: #666; margin-right: 8px;
}
.status-dot.online { background: #4caf50; box-shadow: 0 0 5px #4caf50; }

.invite-actions button {
  background: rgba(255,255,255,0.1); border: none; color: white; padding: 5px 10px;
  border-radius: 5px; cursor: pointer; margin-left: 5px;
}

.invite-actions button:disabled,
.invite-actions button.cooling {
  background: rgba(255,255,255,0.06);
  color: #b0b0b0;
  cursor: not-allowed;
}

.actions button {
  padding: 5px 10px; border: none; border-radius: 5px; cursor: pointer; margin-left: 5px;
}
.actions .accept { background: #4caf50; color: white; }
.actions .reject { background: #f44336; color: white; }

h3 { margin: 15px 0 10px; font-size: 1rem; color: #f093fb; }
.empty { color: #666; text-align: center; }
</style>
