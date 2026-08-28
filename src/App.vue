<template>
  <div id="app-root">
    <nav class="navbar">
      <router-link to="/agent" class="nav-brand">AI 热榜</router-link>
      <div class="nav-links">
        <router-link
          v-for="link in navLinks"
          :key="link.path"
          :to="link.path"
          class="nav-link"
          active-class="active"
        >
          {{ link.label }}
        </router-link>
      </div>
    </nav>
    <main>
      <router-view />
    </main>
  </div>
</template>

<script setup>
const navLinks = [
  { path: '/agent', label: 'Agent' },
  { path: '/hotlist', label: '热榜' },
  { path: '/topics', label: '选题' },
  { path: '/saved-topics', label: '选题库' },
  { path: '/trend', label: '趋势' },
  { path: '/review', label: '复盘' },
]
</script>

<style scoped>
main {
  min-height: calc(100vh - 56px);
}
</style>
