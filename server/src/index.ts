import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadConfig } from './env.js'
import { createMailer } from './mail.js'

const config = loadConfig()
const { sendContactEmail } = createMailer(config)
const app = createApp({ config, sendContactEmail })

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Contact API listening on :${info.port}`)
  console.log(`CORS allowlist: ${config.corsOrigins.join(', ') || '(empty)'}`)
})
