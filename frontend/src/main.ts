import './assets/main.css'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router' 

const app = createApp(App)
app.use(router)
app.mount('#app')

// import { createPinia } from 'pinia'  << -- Om pinia benyttes
// app.use(createPinia())               << -- Om pinia benyttes