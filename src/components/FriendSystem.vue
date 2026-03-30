<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { getAuthData } from '../utils/auth';
import { getSocket } from '../socket';

const props = defineProps({
  isGuest: Boolean
});

const apiBaseUrl = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:12580/api' : '/api')).replace(/\/$/, '');

const friends = ref([]);
const requests = ref([]);
const searchUsername = ref('');
const searchResult = ref(null);
const showModal = ref(false);
const onlineStatus = ref({});

let statusInterval = null;

async function fetchFriends() {
  if (props.isGuest) return;
  const auth = getAuthData();
  if (!auth) return;
  
  try {
    const res = await fetch(`${apiBaseUrl}/friends`, {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    });
    const data = await res.json();
    friends.value = data.friends || [];
    requests.value = data.requests || [];
    checkOnlineStatus();
  } catch (err) {
    console.error(err);
  }
}

async function searchUser() {
  if (!searchUsername.value.trim()) return;
  const auth = getAuthData();
  try {
    const res = await fetch(`${apiBaseUrl}/friends/search?username=${searchUsername.value}`, {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    });
    const data = await res.json();
    if (res.ok) {
      searchResult.value = data;
    } else {
      alert(data.error);
    }
  } catch (err) {
    console.error(err);
  }
}

async function sendRequest(userId) {
  const auth = getAuthData();
  try {
    const res = await fetch(`${apiBaseUrl}/friends/request`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${auth.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ targetUserId: userId })
    });
    if (res.ok) {
      alert('请求已发送');
      searchResult.value.relation = 'pending';
    } else {
      const data = await res.json();
      alert(data.error);
    }
  } catch (err) {
    console.error(err);
  }
}

async function handleRequest(requestId, action) {
  const auth = getAuthData();
  try {
    const res = await fetch(`${apiBaseUrl}/friends/handle`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${auth.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requestId, action })
    });
    if (res.ok) {
      fetchFriends();
    }
  } catch (err) {
    console.error(err);
  }
}

function checkOnlineStatus() {
  const socket = getSocket();
  if (socket && friends.value.length > 0) {
    socket.emit('get_online_status', friends.value.map(f => f.id));
  }
}

function inviteFriend(friendId, gameType) {
  const socket = getSocket();
  if (socket) {
    socket.emit('invite_friend', { friendId, gameType });
    alert('邀请已发送');
  }
}

onMounted(() => {
  fetchFriends();
  const socket = getSocket();
  if (socket) {
    socket.on('online_status_update', (status) => {
      onlineStatus.value = status;
    });
  }
  statusInterval = setInterval(checkOnlineStatus, 5000);
});

onUnmounted(() => {
  clearInterval(statusInterval);
  const socket = getSocket();
  if (socket) {
    socket.off('online_status_update');
  }
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
              <button @click="inviteFriend(friend.id, 'plane-war')">✈️ 邀请</button>
              <button @click="inviteFriend(friend.id, 'tetris')">🧱 邀请</button>
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

.actions button {
  padding: 5px 10px; border: none; border-radius: 5px; cursor: pointer; margin-left: 5px;
}
.actions .accept { background: #4caf50; color: white; }
.actions .reject { background: #f44336; color: white; }

h3 { margin: 15px 0 10px; font-size: 1rem; color: #f093fb; }
.empty { color: #666; text-align: center; }
</style>
