/**
 * ApexCharts wrappers with the shared Sunday Rolls / TailAdmin theme.
 *
 * Every chart is registered so the shell can destroy them on route/range change (`destroyCharts`)
 * and rebuild them in the new colours when the theme toggles (`rethemeCharts`). Colours come from
 * the CSS variables in styles.css, read at build time.
 *
 * `format` (all helpers): 'money' | 'moneyExact' | 'num' | 'pct' | (value) => string.
 * Each helper returns the ApexCharts instance (or null when ApexCharts is unavailable).
 */
import { money, moneyExact, num, pct } from './ui.js'

/** @type {Array<{ el: HTMLElement, build: () => object, chart: any }>} */
let registry = []

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function theme() {
  const dark = document.documentElement.classList.contains('dark')
  return {
    dark,
    brand500: cssVar('--chart-1', '#2f6b45'),
    brand400: cssVar('--chart-1-light', '#5e9c70'),
    brand300: cssVar('--chart-3', '#8fbf9c'),
    brand700: cssVar('--chart-4', '#1d472d'),
    gold: cssVar('--gold', '#c9a85a'),
    grey: cssVar('--chart-grey', '#98a2b3'),
    muted: cssVar('--muted', '#5c6b60'),
    ink: cssVar('--ink', '#142018'),
    border: cssVar('--border', '#e6dfcc'),
    track: cssVar('--chart-track', '#e6dfcc'),
    card: cssVar('--card', '#fffdf7'),
  }
}

function palette(t) {
  return [t.brand500, t.gold, t.brand300, t.brand700, t.grey]
}

export function formatter(format) {
  if (typeof format === 'function') return format
  switch (format) {
    case 'money':
      return (v) => money(v)
    case 'moneyExact':
      return (v) => moneyExact(v)
    case 'pct':
      return (v) => pct(v)
    case 'num':
    default:
      return (v) => num(v)
  }
}

function base(t, { animate = true } = {}) {
  return {
    chart: {
      fontFamily: 'Outfit, system-ui, sans-serif',
      toolbar: { show: false },
      zoom: { enabled: false },
      background: 'transparent',
      foreColor: t.muted,
      parentHeightOffset: 0,
      animations: { enabled: animate && !reducedMotion(), easing: 'easeinout', speed: 700 },
    },
    theme: { mode: t.dark ? 'dark' : 'light' },
    colors: palette(t),
    dataLabels: { enabled: false },
    grid: {
      borderColor: t.border,
      strokeDashArray: 0,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { left: 4, right: 8 },
    },
    legend: {
      show: false,
      position: 'top',
      horizontalAlign: 'left',
      fontFamily: 'Outfit, system-ui, sans-serif',
      fontSize: '14px',
      labels: { colors: t.muted },
      markers: { width: 10, height: 10, radius: 99 },
    },
    tooltip: { theme: t.dark ? 'dark' : 'light', style: { fontFamily: 'Outfit, system-ui, sans-serif' } },
    states: { hover: { filter: { type: 'darken', value: 0.92 } } },
  }
}

function categoryAxis(t, categories, el) {
  // Roughly one label per 72px so dates never collide on narrow screens.
  const fit = Math.max(2, Math.floor((el?.clientWidth || 600) / 72))
  return {
    type: 'category',
    categories,
    axisBorder: { show: false },
    axisTicks: { show: false },
    tooltip: { enabled: false },
    tickAmount: categories.length > fit ? fit : undefined,
    labels: { rotate: 0, hideOverlappingLabels: true, style: { colors: t.muted, fontSize: '12px' } },
  }
}

function valueAxis(t, fmt, series = []) {
  const nonNegative = series.every((s) => (s.data ?? []).every((v) => !(Number(v) < 0)))
  return {
    min: nonNegative ? 0 : undefined,
    forceNiceScale: true,
    labels: {
      style: { colors: [t.muted], fontSize: '12px' },
      formatter: (v) => compact(v, fmt),
    },
  }
}

/** Shorter axis labels: $12.4k instead of $12,400. */
function compact(v, fmt) {
  if (!Number.isFinite(v)) return ''
  const abs = Math.abs(v)
  const isMoney = fmt(1).startsWith('$')
  if (abs >= 1000) {
    const s = abs >= 1e6 ? `${(abs / 1e6).toFixed(1)}M` : `${(abs / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`
    return `${v < 0 ? '-' : ''}${isMoney ? '$' : ''}${s}`
  }
  return fmt(v)
}

function create(el, build) {
  if (!el || typeof window.ApexCharts !== 'function') return null
  destroyChart(el) // one chart per element
  el.innerHTML = ''
  const chart = new window.ApexCharts(el, build(true))
  chart.render()
  registry.push({ el, build, chart })
  return chart
}

/** Destroy every registered chart (call before clearing the page). */
export function destroyCharts() {
  for (const entry of registry) {
    try {
      entry.chart.destroy()
    } catch {
      /* already gone */
    }
  }
  registry = []
}

/**
 * Destroy and unregister the chart drawn in `target` (its container element — preferred, since a
 * theme toggle swaps chart instances — or a chart instance). Use before redrawing one chart.
 */
export function destroyChart(target) {
  if (!target) return
  const keep = []
  for (const entry of registry) {
    if (entry.el === target || entry.chart === target) {
      try {
        entry.chart.destroy()
      } catch {
        /* already gone */
      }
    } else keep.push(entry)
  }
  registry = keep
}

/** Rebuild every live chart with the current theme colours (no draw-in animation). */
export function rethemeCharts() {
  const live = []
  for (const entry of registry) {
    try {
      entry.chart.destroy()
    } catch {
      /* already gone */
    }
    if (!entry.el.isConnected) continue
    entry.el.innerHTML = ''
    const chart = new window.ApexCharts(entry.el, entry.build(false))
    chart.render()
    live.push({ ...entry, chart })
  }
  registry = live
}

/** Area chart with a soft gradient. series: [{ name, data: number[] }]. */
export function areaChart(el, { series = [], categories = [], format = 'num', height = 310 } = {}) {
  const fmt = formatter(format)
  return create(el, (animate) => {
    const t = theme()
    const o = base(t, { animate })
    return {
      ...o,
      chart: { ...o.chart, type: 'area', height },
      colors: [t.brand500, t.gold, t.brand300],
      series,
      stroke: { curve: 'smooth', width: 2 },
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0, stops: [0, 95, 100] } },
      markers: { size: 0, strokeColors: t.card, strokeWidth: 2, hover: { size: 5 } },
      legend: { ...o.legend, show: series.length > 1 },
      xaxis: categoryAxis(t, categories, el),
      yaxis: valueAxis(t, fmt, series),
      tooltip: { ...o.tooltip, x: { show: true }, y: { formatter: (v) => fmt(v) } },
    }
  })
}

/** Rounded bar chart. series: [{ name, data: number[] }]. Single series bars get the brand gradient. */
export function barChart(
  el,
  { series = [], categories = [], stacked = false, horizontal = false, format = 'num', height = 310 } = {},
) {
  const fmt = formatter(format)
  return create(el, (animate) => {
    const t = theme()
    const o = base(t, { animate })
    const single = series.length === 1
    const axis = categoryAxis(t, categories, el)
    return {
      ...o,
      chart: { ...o.chart, type: 'bar', height, stacked },
      colors: single ? [t.brand500] : palette(t),
      series,
      plotOptions: {
        bar: {
          horizontal,
          columnWidth: '40%',
          barHeight: '55%',
          borderRadius: 6,
          borderRadiusApplication: 'end',
          borderRadiusWhenStacked: 'last',
        },
      },
      fill: single
        ? {
            type: 'gradient',
            gradient: {
              type: horizontal ? 'horizontal' : 'vertical',
              shadeIntensity: 0,
              gradientToColors: [t.brand400],
              inverseColors: false,
              opacityFrom: 1,
              opacityTo: 1,
              stops: [0, 100],
            },
          }
        : { opacity: 1 },
      stroke: { show: stacked, width: stacked ? 1 : 0, colors: [t.card] },
      legend: { ...o.legend, show: series.length > 1 },
      grid: horizontal
        ? { ...o.grid, xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } }
        : o.grid,
      xaxis: horizontal
        ? { ...axis, labels: { ...axis.labels, formatter: (v) => compact(Number(v), fmt) } }
        : axis,
      yaxis: horizontal ? { labels: { style: { colors: [t.muted], fontSize: '12px' }, maxWidth: 180 } } : valueAxis(t, fmt, series),
      tooltip: { ...o.tooltip, y: { formatter: (v) => fmt(v) } },
    }
  })
}

/** Donut. series: number[]; labels: string[]. Centre shows the total. */
export function donutChart(el, { series = [], labels = [], format = 'num', height = 300 } = {}) {
  const fmt = formatter(format)
  return create(el, (animate) => {
    const t = theme()
    const o = base(t, { animate })
    return {
      ...o,
      chart: { ...o.chart, type: 'donut', height },
      series,
      labels,
      stroke: { width: 2, colors: [t.card] },
      legend: { ...o.legend, show: true, position: 'bottom', horizontalAlign: 'center' },
      plotOptions: {
        pie: {
          expandOnClick: false,
          donut: {
            size: '72%',
            labels: {
              show: true,
              name: { show: true, fontSize: '14px', color: t.muted, offsetY: 22 },
              value: { show: true, fontSize: '24px', fontWeight: 600, color: t.ink, offsetY: -14, formatter: (v) => fmt(Number(v)) },
              total: {
                show: true,
                label: 'Total',
                fontSize: '14px',
                color: t.muted,
                formatter: (w) => fmt(w.globals.seriesTotals.reduce((a, b) => a + b, 0)),
              },
            },
          },
        },
      },
      tooltip: { ...o.tooltip, y: { formatter: (v) => fmt(v) } },
    }
  })
}

/**
 * Semicircle gauge (TailAdmin "Monthly Target"). `value` is a percentage; the arc is capped at
 * 100 but the label shows the real number. `label` is shown under the value when given.
 */
export function gaugeChart(el, { value = 0, label = '', height = 330 } = {}) {
  const safe = Number.isFinite(value) ? value : 0
  return create(el, (animate) => {
    const t = theme()
    const o = base(t, { animate })
    return {
      ...o,
      chart: { ...o.chart, type: 'radialBar', height, sparkline: { enabled: true } },
      colors: [t.brand500],
      series: [Math.max(0, Math.min(100, safe))],
      labels: [label],
      plotOptions: {
        radialBar: {
          startAngle: -85,
          endAngle: 85,
          hollow: { size: '80%' },
          track: { background: t.track, strokeWidth: '100%', margin: 5 },
          dataLabels: {
            name: { show: Boolean(label), offsetY: 0, fontSize: '14px', color: t.muted },
            value: {
              fontSize: '36px',
              fontWeight: 600,
              offsetY: label ? -50 : -40,
              color: t.ink,
              formatter: () => `${safe.toFixed(safe >= 100 ? 0 : 1)}%`,
            },
          },
        },
      },
      fill: {
        type: 'gradient',
        gradient: {
          type: 'horizontal',
          shadeIntensity: 0,
          gradientToColors: [t.brand500],
          colorStops: [
            { offset: 0, color: t.brand400, opacity: 1 },
            { offset: 100, color: t.brand500, opacity: 1 },
          ],
        },
      },
      stroke: { lineCap: 'round' },
    }
  })
}
