import { createRouter, createWebHashHistory } from 'vue-router'
import Hotlist from '../views/Hotlist.vue'
import Topics from '../views/Topics.vue'
import Trend from '../views/Trend.vue'
import Review from '../views/Review.vue'
import SavedTopics from '../views/SavedTopics.vue'

const routes = [
  { path: '/', redirect: '/hotlist' },
  { path: '/hotlist', name: 'Hotlist', component: Hotlist },
  { path: '/topics', name: 'Topics', component: Topics },
  { path: '/trend', name: 'Trend', component: Trend },
  { path: '/review', name: 'Review', component: Review },
  { path: '/saved-topics', name: 'SavedTopics', component: SavedTopics },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router