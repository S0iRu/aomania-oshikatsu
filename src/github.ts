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
