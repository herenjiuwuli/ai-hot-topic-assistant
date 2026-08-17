import 'dotenv/config'
import { createApp } from './index.js'

const PORT = process.env.PORT || 3000

const app = createApp()

app.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`)
})