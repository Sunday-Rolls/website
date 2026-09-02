import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import './index.css'
import App from '@/App'
import { assetUrl } from '@/lib/asset-url'
import { initGtm } from '@/lib/gtm'

const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
if (favicon) {
  favicon.href = assetUrl('/assets/brand/logo.svg')
}

initGtm()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
