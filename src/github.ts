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
  if (!token) throw new Error('保存に失敗しました')
  const expected = JSON.stringify(normalizeManual(manual))
  const response = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_type: 'save-memo', client_payload: { manual: normalizeManual(manual) } }),
  })
  if (!response.ok) throw new Error('保存に失敗しました')
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    try {
      const current = await fetchRemoteManual()
      if (JSON.stringify(current) === expected) return
    } catch {
      // 反映を待つ
    }
  }
  throw new Error('保存に失敗しました')
}
