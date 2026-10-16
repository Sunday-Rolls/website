/** Run after the load event, then wait, so the work stays outside the initial trace. */
export function scheduleAfterLoad(task: () => void, delayMs: number): () => void {
  let timeoutId = 0
  const start = () => {
    timeoutId = window.setTimeout(task, delayMs)
  }

  if (document.readyState === 'complete') {
    start()
    return () => window.clearTimeout(timeoutId)
  }

  window.addEventListener('load', start, { once: true })
  return () => {
    window.removeEventListener('load', start)
    window.clearTimeout(timeoutId)
  }
}
