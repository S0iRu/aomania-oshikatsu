import { ManualFile } from './logic'

const REPO = 'S0iRu/aomania-oshikatsu'
const PATH = 'public/data/manual.json'
const BRANCH = 'main'
const TOKEN_KEY = 'koyanagi-schedule-github-token'

export function loadToken(): string {
  return localStorage.getItem(TOKEN_KEY)?.trim() ?? ''
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token.trim())
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function normalizeManual(value: Partial<ManualFile> | null | undefined): ManualFile {
  return {
    deadlines: value?.deadlines ?? [],
    hiddenIds: value?.hiddenIds ?? [],
    thumbnailOverrides: value?.thumbnailOverrides ?? {},
    extraStreams: value?.extraStreams ?? [],
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

async function readFile(token?: string): Promise<{ manual: ManualFile; sha: string }> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`,
    { headers, cache: 'no-store' },
  )
  if (response.status === 401) throw new Error('トークンが無効です')
  if (!response.ok) throw new Error('メモを読めませんでした')
  const data = (await response.json()) as { content: string; sha: string }
  const manual = normalizeManual(JSON.parse(decodeBase64(data.content)) as Partial<ManualFile>)
  return { manual, sha: data.sha }
}

export async function fetchRemoteManual(): Promise<ManualFile> {
  const { manual } = await readFile()
  return manual
}

export async function writeManual(manual: ManualFile, token: string): Promise<void> {
  const { sha } = await readFile(token)
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${PATH}`, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'メモを更新',
      content: encodeBase64(`${JSON.stringify(manual, null, 2)}\n`),
      sha,
      branch: BRANCH,
    }),
  })
  if (response.status === 401) throw new Error('トークンが無効です')
  if (response.status === 409) throw new Error('ほかの更新と重なりました。もう一度押してください')
  if (!response.ok) throw new Error('保存に失敗しました')
}
