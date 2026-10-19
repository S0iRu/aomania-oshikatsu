import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'oshi.json'), 'utf8'))
const outPath = path.join(root, 'public', 'data', 'streams.json')
const key = process.env.YOUTUBE_API_KEY

if (!key) {
  console.log('YOUTUBE_API_KEY が未設定のため、取得をスキップしました')
  process.exit(0)
}

const previous = fs.existsSync(outPath)
  ? JSON.parse(fs.readFileSync(outPath, 'utf8'))
  : { backfillComplete: false, resume: {}, streams: [] }

async function yt(pathname, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${pathname}`)
  url.searchParams.set('key', key)
  for (const [name, value] of Object.entries(params)) {
    if (value) url.searchParams.set(name, value)
  }
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${pathname} ${response.status} ${await response.text()}`)
  }
  return response.json()
}

function parseDuration(iso) {
  const match = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0)
}

function gamesFromTitle(title) {
  const labels = []
  for (const match of String(title).matchAll(/【([^】]+)】/g)) {
    const bracket = match[1]
    if (/小柳|にじさんじ|Koyanagi/i.test(bracket)) continue
    let matched = false
    for (const rule of config.games) {
      if (rule.patterns.some((pattern) => bracket.toLowerCase().includes(pattern.toLowerCase()))) {
        if (!labels.includes(rule.label)) labels.push(rule.label)
        matched = true
      }
    }
    if (!matched && bracket.length <= 16 && !labels.includes(bracket)) labels.push(bracket)
  }
  return labels
}

function mentions(text) {
  return config.aliases.some((alias) => String(text || '').includes(alias))
}

function includesWord(text, words) {
  const source = String(text || '').toLowerCase()
  return words.some((word) => source.includes(String(word).toLowerCase()))
}

function rangeOf(stream) {
  const start = new Date(stream.start).getTime()
  const end = stream.end ? new Date(stream.end).getTime() : start + Math.max(stream.durationSec, 60) * 1000
  return [start, Math.max(end, start + 60 * 1000)]
}

function overlaps(a, b) {
  const [a0, a1] = rangeOf(a)
  const [b0, b1] = rangeOf(b)
  return a0 < b1 && b0 < a1
}

async function channelMeta(channelId) {
  const data = await yt('channels', { part: 'contentDetails,snippet', id: channelId })
  const item = data.items?.[0]
  if (!item) throw new Error(`チャンネルが見つかりません: ${channelId}`)
  return {
    playlistId: item.contentDetails.relatedPlaylists.uploads,
    title: item.snippet.title,
  }
}

async function playlistPage(playlistId, pageToken) {
  return yt('playlistItems', {
    part: 'snippet,contentDetails',
    playlistId,
    maxResults: '50',
    pageToken,
  })
}

async function videoDetails(ids) {
  const items = []
  for (let index = 0; index < ids.length; index += 50) {
    const chunk = ids.slice(index, index + 50)
    if (chunk.length === 0) continue
    const data = await yt('videos', {
      part: 'snippet,contentDetails,liveStreamingDetails',
      id: chunk.join(','),
    })
    items.push(...(data.items || []))
  }
  return items
}

function toStream(video, channel, isOwn) {
  const live = video.liveStreamingDetails || {}
  const start = live.actualStartTime || live.scheduledStartTime
  if (!start) return null
  const end = live.actualEndTime
  const clock = end ? Math.max(0, (new Date(end) - new Date(start)) / 1000) : 0
  const durationSec = Math.round(clock || parseDuration(video.contentDetails?.duration))
  let status = 'past'
  if (live.actualStartTime && !end) status = 'live'
  else if (!live.actualStartTime) status = 'upcoming'
  return {
    id: video.id,
    videoId: video.id,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    title: video.snippet.title,
    description: video.snippet.description || '',
    thumbnail: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.high?.url || '',
    channelId: channel.id,
    channelTitle: video.snippet.channelTitle || channel.title,
    shortName: channel.shortName,
    start,
    end: end || undefined,
    durationSec,
    status,
    games: gamesFromTitle(video.snippet.title),
    tags: [],
    isOwn,
  }
}

async function collect(channel, isOwn, knownIds) {
  const meta = await channelMeta(channel.id)
  const backfill = !previous.scanned?.[channel.id]
  const resumeToken = previous.resume?.[channel.id] || ''
  const ids = []
  let pageToken = backfill ? resumeToken : ''
  let knownStreak = 0
  let finished = false
  const pageLimit = backfill ? 100 : 2
  for (let page = 0; page < pageLimit; page += 1) {
    const data = await playlistPage(meta.playlistId, pageToken)
    const pageIds = []
    for (const item of data.items || []) {
      const title = item.snippet?.title || ''
      const description = item.snippet?.description || ''
      const text = `${title}\n${description}`
      const id = item.contentDetails.videoId
      if (!isOwn) {
        const special = channel.official && includesWord(text, channel.alsoInclude || [])
        if (!special && !mentions(text)) continue
      }
      pageIds.push(id)
    }
    ids.push(...pageIds)
    if (!backfill) {
      const fresh = pageIds.filter((id) => !knownIds.has(id))
      knownStreak = fresh.length === 0 ? knownStreak + 1 : 0
      if (knownStreak >= 2) {
        finished = true
        break
      }
    }
    pageToken = data.nextPageToken || ''
    if (!pageToken) {
      finished = true
      break
    }
  }
  return { ids, resume: finished ? '' : pageToken, scanned: finished }
}

function keep(stream) {
  const { description, ...rest } = stream
  return rest
}

const channels = [config.ownChannel, ...config.channels]
const knownIds = new Set((previous.streams || []).map((stream) => stream.id))
const resume = { ...(previous.resume || {}) }
const scanned = { ...(previous.scanned || {}) }
const collected = []

for (const channel of channels) {
  const isOwn = channel.id === config.ownChannel.id
  const refreshIds = (previous.streams || [])
    .filter((stream) => stream.channelId === channel.id && (!stream.end || stream.status !== 'past'))
    .map((stream) => stream.videoId)
    .filter(Boolean)
  const page = await collect(channel, isOwn, knownIds)
  resume[channel.id] = page.resume
  if (page.scanned) scanned[channel.id] = true
  const details = await videoDetails([...new Set([...page.ids, ...refreshIds])])
  for (const video of details) {
    const stream = toStream(video, channel, isOwn)
    if (stream) collected.push(stream)
  }
}

const own = collected.filter((stream) => stream.isOwn)
const others = []
for (const stream of collected) {
  if (stream.isOwn) continue
  const channel = config.channels.find((item) => item.id === stream.channelId)
  const text = `${stream.title}\n${stream.description || ''}`
  const overlap = own.some((item) => overlaps(item, stream))
  const special = channel?.official && includesWord(text, channel.alsoInclude || [])
  if (special) {
    stream.tags = ['コラボ']
    stream.noOwnStream = !overlap
    others.push(stream)
    continue
  }
  if (mentions(text) && overlap) {
    stream.tags = ['コラボ']
    others.push(stream)
  }
}

for (const stream of own) {
  if (others.some((other) => overlaps(stream, other))) stream.tags = ['コラボ']
}

const fresh = [...own, ...others]
const freshIds = new Set(fresh.map((stream) => stream.id))
const carried = (previous.streams || []).filter((stream) => !freshIds.has(stream.id))
const streams = (fresh.length === 0 && carried.length === 0 ? previous.streams || [] : [...fresh.map(keep), ...carried.map(keep)]).sort(
  (a, b) => a.start.localeCompare(b.start),
)
const backfillComplete = channels.every((channel) => scanned[channel.id])

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(
  outPath,
  `${JSON.stringify({ backfillComplete, resume, scanned, streams }, null, 2)}\n`,
)
console.log(`配信 ${streams.length} 件を保存しました`)
