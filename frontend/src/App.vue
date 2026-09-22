<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink class="app-brand" to="/">High-Performance Backtester</RouterLink>
      <nav class="app-nav" aria-label="Main navigation">
        <RouterLink to="/">Backtest</RouterLink>
        <RouterLink to="/optimize">Optimize</RouterLink>
        <RouterLink to="/monte-carlo">Monte Carlo</RouterLink>
      </nav>
    </header>

    <main id="app-container">
      <RouterView v-slot="{ Component }">
        <KeepAlive>
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at 15% -12%, rgba(33, 111, 176, 0.11), transparent 30rem), #0b1721;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  min-height: 49px;
  align-items: center;
  gap: clamp(2rem, 6vw, 6rem);
  padding: 0 1.25rem;
  border-bottom: 1px solid #263b4b;
  background: rgba(10, 24, 34, 0.97);
  backdrop-filter: blur(14px);
}

.app-brand {
  color: #f4f7fb;
  font-size: clamp(1.02rem, 1.35vw, 1.28rem);
  font-weight: 750;
  letter-spacing: -0.025em;
  white-space: nowrap;
}

.app-brand:hover {
  background: transparent;
}

.app-nav {
  align-self: stretch;
  display: flex;
  align-items: stretch;
  gap: 0.35rem;
}

.app-nav a {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 1rem;
  color: #b5c8d8;
  font-size: 0.84rem;
  font-weight: 550;
}

.app-nav a:hover {
  color: #f4f7fb;
  background: rgba(61, 150, 255, 0.08);
}

.app-nav a.router-link-exact-active {
  color: #61adff;
}

.app-nav a.router-link-exact-active::after {
  position: absolute;
  right: 0.8rem;
  bottom: 0;
  left: 0.8rem;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: #2c91ff;
  content: '';
}

#app-container {
  width: 100%;
  margin: 0 auto;
  padding: 0.9rem 1.25rem 2rem;
}

@media (max-width: 720px) {
  .app-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 0;
    padding-top: 0.8rem;
  }

  .app-nav {
    width: 100%;
    min-height: 52px;
  }

  .app-nav a {
    flex: 1;
    justify-content: center;
    padding: 0 0.35rem;
  }
}
</style>
