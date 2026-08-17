import express from 'express'
import hotlistRouter from './routes/hotlist.js'
import topicsRouter from './routes/topics.js'
import snapshotsRouter from './routes/snapshots.js'
import reviewsRouter from './routes/reviews.js'
import biliZoneRouter from './routes/biliZone.js'
import savedTopicsRouter from './routes/savedTopics.js'
import scriptRouter from './routes/script.js'
import subscriptionsRouter from './routes/subscriptions.js'

export function createApp() {
  const app = express()

  app.use(express.json())
  app.use(hotlistRouter)
  app.use(topicsRouter)
  app.use(snapshotsRouter)
  app.use(reviewsRouter)
  app.use(biliZoneRouter)
  app.use(savedTopicsRouter)
  app.use(scriptRouter)
  app.use(subscriptionsRouter)

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  return app
}