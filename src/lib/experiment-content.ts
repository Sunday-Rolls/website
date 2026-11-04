/**
 * Content variants: a page JSON may carry an optional `experiments` block that deep-merges
 * over the base content for the visitor's arm (docs/AB_TESTING_PLAN.md §3c):
 *
 *   "experiments": { "home-banner": { "b": { "hero": { "headline": "Built for the walk" } } } }
 *
 * Objects merge key by key; arrays and scalars are replaced whole. `usePageContent` runs every
 * page through `useExperimentContent`, so copy tests need no component change. Reading a page's
 * content while one of its experiments is tracked counts as an exposure for that experiment
 * (every arm, control included, so both sides are counted the same way).
 */
import { useEffect, useMemo } from 'react'
import {
  recordExposure,
  shouldRecordExposure,
  useExperimentsSnapshot,
  variantFrom,
} from '@/lib/experiments'
import type { PageExperiments } from '@/types/content'

type Plain = Record<string, unknown>

function isPlainObject(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : override) as T
  }
  const out: Plain = { ...base }
  for (const [key, value] of Object.entries(override)) {
    out[key] = deepMerge(out[key], value)
  }
  return out as T
}

export function readExperimentsBlock(content: unknown): PageExperiments {
  const block = isPlainObject(content) ? content.experiments : undefined
  return isPlainObject(block) ? (block as PageExperiments) : {}
}

/** Pure: base content (without its `experiments` block) with each arm's override applied. */
export function applyExperimentOverrides<T>(content: T, armOf: (key: string) => string): T {
  const block = readExperimentsBlock(content)
  if (!isPlainObject(content)) return content
  const { experiments: _omit, ...base } = content as Plain
  void _omit
  let merged: Plain = base
  for (const key of Object.keys(block).sort()) {
    const override = block[key]?.[armOf(key)]
    if (override !== undefined) merged = deepMerge(merged, override)
  }
  return merged as T
}

/** `content` with the visitor's arm applied; logs exposures for the experiments in its block. */
export function useExperimentContent<T>(content: T): T {
  const snapshot = useExperimentsSnapshot()
  const keys = Object.keys(readExperimentsBlock(content)).sort()
  const arms = keys.map((key) => `${key}:${variantFrom(snapshot, key)}`).join('|')
  const eligible = keys.filter((key) => shouldRecordExposure(snapshot, key)).join('|')

  const merged = useMemo(
    () => {
      const armMap = Object.fromEntries(arms ? arms.split('|').map((pair) => pair.split(':')) : [])
      return applyExperimentOverrides(content, (key) => armMap[key] ?? 'control')
    },
    [content, arms],
  )

  useEffect(() => {
    if (!eligible) return
    for (const key of eligible.split('|')) recordExposure(key)
  }, [eligible])

  return merged
}
