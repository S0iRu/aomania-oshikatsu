import { ManualFile } from './logic'

const REPO = 'S0iRu/aomania-oshikatsu'
const PATH = 'public/data/manual.json'
const BRANCH = 'main'

export function normalizeManual(value: Partial<ManualFile> | null | undefined): ManualFile {
  return {
    deadlines: (value?.deadlines ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      at: item.at,
    })),
    hiddenIds: value?.hiddenIds ?? [],
    thumbnailOverrides: value?.thumbnailOverrides ?? {},
    extraStreams: value?.extraStreams ?? [],
    theme: value?.theme || 'default',
    customColor: value?.customColor || '#8eabc4',
    presets: (value?.presets ?? [])
      .filter((item) => item && typeof item.id === 'string' && typeof item.color === 'string')
      .map((item) => ({ id: item.id, color: item.color })),
  }
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeBase64(content: string): string {
  const binary = atob(content.replace(/\n/g, ''))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export async function fetchRemoteManual(): Promise<ManualFile> {
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`,
    { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' },
  )
  if (!response.ok) throw new Error('メモを読めませんでした')
  const data = (await response.json()) as { content: string }
  return normalizeManual(JSON.parse(decodeBase64(data.content)) as Partial<ManualFile>)
}

export async function writeManual(manual: ManualFile): Promise<void> {
  const token = import.meta.env.VITE_MEMO_TOKEN
  if (!token) throw new Error('サイトに保存の設定がまだ入っていません。Actions の pages を再実行してください')
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
  }
  const current = await fetch(`https://api.github.com/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`, {
    headers,
    cache: 'no-store',
  })
  if (!current.ok) throw new Error(`保存に失敗しました (${current.status})`)
  const meta = (await current.json()) as { sha?: string }
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${PATH}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'メモを更新',
      content: encodeBase64(`${JSON.stringify(normalizeManual(manual), null, 2)}\n`),
      sha: meta.sha,
      branch: BRANCH,
    }),
  })
  if (!response.ok) throw new Error(`保存に失敗しました (${response.status})`)
}

export type FetchRun = {
  id: number
  status: string
  conclusion: string | null
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  const token = import.meta.env.VITE_MEMO_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export async function listFetchRuns(): Promise<FetchRun[]> {
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/fetch.yml/runs?per_page=5`,
    { headers: authHeaders(), cache: 'no-store' },
  )
  if (!response.ok) return []
  const data = (await response.json()) as {
    workflow_runs?: { id: number; status: string; conclusion: string | null }[]
  }
  return (data.workflow_runs ?? []).map((run) => ({
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
  }))
}

export async function startFetch(): Promise<void> {
  const token = import.meta.env.VITE_MEMO_TOKEN
  if (!token) throw new Error('取得を開始できませんでした')
  const response = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/fetch.yml/dispatches`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: BRANCH }),
  })
  if (!response.ok) throw new Error('取得を開始できませんでした')
}
