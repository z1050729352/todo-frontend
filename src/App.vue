<script setup>
	import { ref, onMounted } from 'vue';
	import axios from 'axios';

	const todos = ref([]);
	const newTodo = ref('');

	const api = axios.create({
		baseURL: 'https://firstapiproject-production.up.railway.app/api',
	});

	async function fetchTodos() {
		const { data } = await api.get('/todos');
		todos.value = data;
	}

	async function addTodo() {
		if (!newTodo.value) return;
		await api.post('/todos', { title: newTodo.value });
		newTodo.value = '';
		fetchTodos();
	}

	async function toggleTodo(todo) {
		await api.put(`/todos/${todo._id}`, { completed: !todo.complated });
		fetchTodos();
	}

	async function deleteTodo(id) {
		await api.delete(`/todos/${id}`);
		fetchTodos();
	}

	onMounted(fetchTodos);
</script>

<template>
	<div class="app">
		<h1>我的待办事项</h1>
		<div class="input-group">
			<input type="text" v-model="newTodo" @keyup.enter="addTodo" placeholder="添加新任务" />
			<button @click="addTodo">添加</button>
		</div>
		<ul>
			<li v-for="todo in todos" :key="todo._id">
				<input type="checkbox" :checked="todo.completed" @change="toggleTodo(todo)" />
				<span :class="{ completed: todo.complated }">
					{{ todo.title }}
				</span>
				<button @click="deleteTodo(todo._id)">删除</button>
			</li>
		</ul>
	</div>
</template>

<style>
	.completed {
		text-decoration: line-through;
	}
</style>
