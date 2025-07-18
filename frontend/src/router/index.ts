import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/', // Alt skal nå ligge på hovedsiden
      name: 'dashboard',
      component: DashboardView 
    },
  ]
})

export default router
