import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
    },
    {
      path: '/optimize',
      name: 'optimize',
      component: () => import('../views/OptimizeView.vue'),
    },
    {
      path: '/monte-carlo',
      name: 'monte-carlo',
      component: () => import('../views/MonteCarloView.vue'),
    },
  ],
})

export default router
