import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { initDeviceAdaptation } from './device.js'

initDeviceAdaptation()
createApp(App).mount('#app')
