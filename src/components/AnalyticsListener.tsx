import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { trackPageView } from '@/lib/gtm'

/** Fires a GTM `page_view` on every client-side route change. */
export function AnalyticsListener() {
  const location = useLocation()

  useEffect(() => {
    const path = `${location.pathname}${location.search}`
    trackPageView(path)
  }, [location.pathname, location.search])

  return null
}
