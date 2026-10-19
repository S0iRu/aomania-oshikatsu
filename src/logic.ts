export type Stream = {
  id: string
  videoId?: string
  url?: string
  title: string
  thumbnail?: string
  channelId: string
  channelTitle: string
  shortName: string
  start: string
  end?: string
  durationSec: number
  status: 'past' | 'live' | 'upcoming'
  games: string[]
  tags: string[]
  isOwn: boolean
  noOwnStream?: boolean
}

export type Deadline = {
  id: string
  title: string
  at: string
}

export type ThemePreset = { id: string; color: string }

export type ManualFile = {
  deadlines: Deadline[]
  hiddenIds: string[]
  thumbnailOverrides: Record<string, string>
  extraStreams: Stream[]
  theme: string
  customColor: string
  presets: ThemePreset[]
}

export type StreamFile = {
  backfillComplete?: boolean
  resume?: Record<string, string>
  streams: Stream[]
}

export const LEGEND = ['ポスト', '配信告知', 'コラボ', '配信予定', '雑談'] as const

export type LegendKey = (typeof LEGEND)[number]

export const TZ_MS = 9 * 60 * 60 * 1000
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export type Wall = {
  y: number
  m: number
  d: number
  mins: number
  key: string
  weekday: number
}

export function wallFromMs(ms: number): Wall {
  const t = new Date(ms + TZ_MS)
  const y = t.getUTCFullYear()
  const m = t.getUTCMonth() + 1
  const d = t.getUTCDate()
  const mins = t.getUTCHours() * 60 + t.getUTCMinutes()
  return {
    y,
    m,
    d,
    mins,
    key: keyFromParts(y, m, d),
    weekday: t.getUTCDay(),
  }
}

export function keyFromParts(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number)
  return { y, m, d }
}

export function todayKey(): string {
  return wallFromMs(Date.now()).key
}

export function addDays(key: string, days: number): string {
  const { y, m, d } = parseKey(key)
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000)
  return keyFromParts(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

export function startOfWeek(key: string): string {
  const { y, m, d } = parseKey(key)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const delta = wd === 0 ? -6 : 1 - wd
  return addDays(key, delta)
}

export function shiftMonth(key: string, delta: number): string {
  const { y, m } = parseKey(key)
  const t = new Date(Date.UTC(y, m - 1 + delta, 1))
  return keyFromParts(t.getUTCFullYear(), t.getUTCMonth() + 1, 1)
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function weekdayOf(key: string): number {
  const { y, m, d } = parseKey(key)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function weekdayLabel(index: number): string {
  return WEEKDAYS[index] ?? ''
}

export function weekdayClass(index: number): string {
  if (index === 0) return 'sun'
  if (index === 6) return 'sat'
  return ''
}

export function formatHm(mins: number): string {
  const h = Math.floor(mins / 60) % 24
  const m = ((mins % 60) + 60) % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

export function formatHours(sec: number): string {
  const h = Math.round((sec / 3600) * 10) / 10
  if (!Number.isFinite(h) || h <= 0) return '0'
  return Number.isInteger(h) ? String(h) : h.toFixed(1)
}

export function approxDuration(sec: number): string {
  if (sec < 3600) return `約${Math.max(1, Math.round(sec / 60))}分`
  const h = Math.round((sec / 3600) * 10) / 10
  const text = Number.isInteger(h) ? String(h) : h.toFixed(1)
  return `約${text}時間`
}

export function dateLabel(key: string): string {
  const { m, d } = parseKey(key)
  return `${m}/${d}（${weekdayLabel(weekdayOf(key))}）`
}

export function daysUntil(atIso: string, today: string): number {
  const at = parseKey(atIso.slice(0, 10))
  const now = parseKey(today)
  const a = Date.UTC(at.y, at.m - 1, at.d)
  const b = Date.UTC(now.y, now.m - 1, now.d)
  return Math.round((a - b) / 86400000)
}

export function endMs(stream: Stream): number {
  if (stream.end) return new Date(stream.end).getTime()
  return new Date(stream.start).getTime() + Math.max(stream.durationSec, 0) * 1000
}

export type Slice = {
  stream: Stream
  dateKey: string
  startMin: number
  endMin: number
}

export function slicesOf(stream: Stream): Slice[] {
  const startMs = new Date(stream.start).getTime()
  let end = endMs(stream)
  if (!(end > startMs)) end = startMs + 30 * 60 * 1000
  const slices: Slice[] = []
  let cursor = startMs
  let guard = 0
  while (cursor < end && guard < 8) {
    guard += 1
    const w = wallFromMs(cursor)
    const midnight = Date.UTC(w.y, w.m - 1, w.d) - TZ_MS
    const next = midnight + 86400000
    const sliceEnd = Math.min(end, next)
    slices.push({
      stream,
      dateKey: w.key,
      startMin: Math.max(0, Math.round((cursor - midnight) / 60000)),
      endMin: Math.min(24 * 60, Math.round((sliceEnd - midnight) / 60000)),
    })
    cursor = sliceEnd
  }
  return slices.filter((slice) => slice.endMin > slice.startMin)
}

export function unionMinutes(ranges: [number, number][]): number {
  const sorted = ranges.filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])
  let total = 0
  let curS = 0
  let curE = 0
  let started = false
  for (const [s, e] of sorted) {
    if (!started || s > curE) {
      total += curE - curS
      curS = s
      curE = e
      started = true
    } else {
      curE = Math.max(curE, e)
    }
  }
  return total + (started ? curE - curS : 0)
}

export function passesLegend(stream: Stream, enabled: Record<string, boolean>): boolean {
  return stream.tags.every((tag) => enabled[tag] !== false)
}

export function overlaps(a: Stream, b: Stream): boolean {
  const a0 = new Date(a.start).getTime()
  const a1 = endMs(a)
  const b0 = new Date(b.start).getTime()
  const b1 = endMs(b)
  return a0 < b1 && b0 < a1
}

export function partnersOf(stream: Stream, all: Stream[]): Stream[] {
  return all.filter(
    (other) =>
      other.id !== stream.id &&
      other.channelId !== stream.channelId &&
      overlaps(stream, other),
  )
}

export function streamsOnDays(streams: Stream[], days: Set<string>): Stream[] {
  const seen = new Set<string>()
  const result: Stream[] = []
  for (const stream of streams) {
    if (seen.has(stream.id)) continue
    if (slicesOf(stream).some((slice) => days.has(slice.dateKey))) {
      seen.add(stream.id)
      result.push(stream)
    }
  }
  return result
}

export function dayKeysOfWeek(key: string): string[] {
  const start = startOfWeek(key)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function dayKeysOfMonth(key: string): string[] {
  const { y, m } = parseKey(key)
  const n = daysInMonth(y, m)
  return Array.from({ length: n }, (_, i) => keyFromParts(y, m, i + 1))
}

export function periodHours(streams: Stream[], days: string[]): number {
  let total = 0
  const set = new Set(days)
  for (const day of set) {
    const ranges: [number, number][] = []
    for (const stream of streams) {
      for (const slice of slicesOf(stream)) {
        if (slice.dateKey === day) ranges.push([slice.startMin, slice.endMin])
      }
    }
    total += unionMinutes(ranges) * 60
  }
  return total
}

export function gameHours(streams: Stream[]): [string, number][] {
  const map = new Map<string, number>()
  for (const stream of streams) {
    const game = stream.games[0]
    if (!game) continue
    map.set(game, (map.get(game) ?? 0) + stream.durationSec)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}

export function monthCells(key: string): { key: string; inMonth: boolean }[] {
  const { y, m } = parseKey(key)
  const first = keyFromParts(y, m, 1)
  const lead = (weekdayOf(first) + 6) % 7
  const cells: { key: string; inMonth: boolean }[] = []
  for (let i = lead; i > 0; i -= 1) cells.push({ key: addDays(first, -i), inMonth: false })
  for (const day of dayKeysOfMonth(key)) cells.push({ key: day, inMonth: true })
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].key
    cells.push({ key: addDays(last, 1), inMonth: false })
  }
  return cells
}

export function shortTitle(stream: Stream): string {
  const game = stream.games[0]
  const hours = formatHours(stream.durationSec)
  const raw = stream.title.replace(/【[^】]*】/g, '').trim()
  const text = raw || stream.title
  const clipped = text.length > 18 ? `${text.slice(0, 18)}…` : text
  if (game && hours !== '0') return `${game} ${clipped}`
  return clipped
}

export function displayChips(stream: Stream): string[] {
  const chips: string[] = []
  if (stream.games[0]) chips.push(stream.games[0])
  for (const tag of stream.tags) {
    if (!chips.includes(tag)) chips.push(tag)
  }
  if (stream.title.includes('同時視聴') && !chips.includes('同時視聴')) chips.push('同時視聴')
  return chips.slice(0, 3)
}

export function emptyManual(): ManualFile {
  return {
    deadlines: [],
    hiddenIds: [],
    thumbnailOverrides: {},
    extraStreams: [],
    theme: 'default',
    customColor: '#8eabc4',
    presets: [],
  }
}

export function applyManual(streams: Stream[], manual: ManualFile): Stream[] {
  const hidden = new Set(manual.hiddenIds)
  const merged = [...streams, ...manual.extraStreams]
  const byId = new Map<string, Stream>()
  for (const stream of merged) {
    if (hidden.has(stream.id)) continue
    const thumb = manual.thumbnailOverrides[stream.id]
    byId.set(stream.id, thumb ? { ...stream, thumbnail: thumb } : stream)
  }
  return [...byId.values()]
}
