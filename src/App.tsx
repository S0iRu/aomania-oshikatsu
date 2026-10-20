import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Deadline,
  ManualFile,
  Stream,
  StreamFile,
  addDays,
  applyManual,
  approxDuration,
  dateLabel,
  dayKeysOfMonth,
  dayKeysOfWeek,
  daysUntil,
  displayChips,
  emptyManual,
  endMs,
  formatHm,
  formatHours,
  gameHours,
  monthCells,
  parseKey,
  partnersOf,
  periodHours,
  shiftMonth,
  shortTitle,
  slicesOf,
  startOfWeek,
  streamsOnDays,
  todayKey,
  unionMinutes,
  wallFromMs,
  weekdayClass,
  weekdayLabel,
  weekdayOf,
} from './logic'
import { fetchRemoteManual, listFetchRuns, normalizeManual, startFetch, writeManual } from './github'
import { applyTheme, BUILTIN_THEMES } from './theme'

const AXIS_START = 60
const AXIS_END = 24 * 60
const AXIS_SPAN = AXIS_END - AXIS_START

function blockBox(startMin: number, endMin: number): { top: number; height: number } | null {
  const start = Math.max(startMin, AXIS_START)
  const end = Math.min(endMin, AXIS_END)
  if (end <= AXIS_START || start >= AXIS_END) return null
  return {
    top: ((start - AXIS_START) / AXIS_SPAN) * 100,
    height: Math.max(((end - start) / AXIS_SPAN) * 100, 2.4),
  }
}

function layout(slices: ReturnType<typeof slicesOf>) {
  const sorted = [...slices].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  const colEnds: number[] = []
  const placed = sorted.map((slice) => {
    let col = colEnds.findIndex((end) => end <= slice.startMin)
    if (col < 0) {
      col = colEnds.length
      colEnds.push(slice.endMin)
    } else {
      colEnds[col] = slice.endMin
    }
    return { ...slice, col }
  })
  return placed.map((item) => {
    const group = placed.filter((other) => other.startMin < item.endMin && item.startMin < other.endMin)
    const cols = Math.max(...group.map((other) => other.col)) + 1
    return { ...item, cols }
  })
}

function App() {
  const [streams, setStreams] = useState<Stream[]>([])
  const [manual, setManual] = useState<ManualFile>(emptyManual())
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [fetchLabel, setFetchLabel] = useState<'idle' | 'running' | 'done' | 'failed'>('idle')
  const finishedAtLoad = useRef<Set<number> | null>(null)
  const waitingForStart = useRef(false)
  const [mode, setMode] = useState<'week' | 'month' | 'game'>('week')
  const [cursor, setCursor] = useState(todayKey)
  const [game, setGame] = useState<string | null>(null)
  const [yearOpen, setYearOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [draftColor, setDraftColor] = useState<string | null>(null)

  useEffect(() => {
    applyTheme(draftColor ? 'custom' : manual.theme, draftColor ?? manual.customColor, manual.presets)
  }, [manual.theme, manual.customColor, manual.presets, draftColor])

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    Promise.all([
      fetch(`${base}data/streams.json`, { cache: 'no-store' }).then((res) => res.json()),
      fetchRemoteManual().catch(() =>
        fetch(`${base}data/manual.json`, { cache: 'no-store' })
          .then((res) => res.json())
          .then((value) => normalizeManual(value)),
      ),
    ])
      .then(([streamFile, loaded]: [StreamFile, ManualFile]) => {
        setStreams(streamFile.streams ?? [])
        setManual(normalizeManual(loaded))
      })
      .finally(() => setReady(true))
  }, [])

  const listed = useMemo(() => applyManual(streams, manual), [streams, manual])
  const selected = listed.find((stream) => stream.id === selectedId) ?? null
  const today = todayKey()

  async function commitManual(next: ManualFile, message = 'メモを更新'): Promise<boolean> {
    setSaving(true)
    setNotice(null)
    try {
      await writeManual(next, message)
      setManual(normalizeManual(next))
      return true
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存に失敗しました')
      return false
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    let stopped = false
    async function poll() {
      const runs = await listFetchRuns()
      if (stopped) return
      if (finishedAtLoad.current === null) {
        finishedAtLoad.current = new Set(
          runs.filter((run) => run.status === 'completed').map((run) => run.id),
        )
      }
      const known = finishedAtLoad.current
      const active = runs.some((run) => run.status === 'queued' || run.status === 'in_progress')
      const fresh = runs.filter((run) => run.status === 'completed' && !known.has(run.id))
      if (active) {
        waitingForStart.current = false
        setFetchLabel('running')
        return
      }
      if (fresh.length > 0) {
        waitingForStart.current = false
        setFetchLabel(fresh[0].conclusion === 'success' ? 'done' : 'failed')
        return
      }
      if (waitingForStart.current) setFetchLabel('running')
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 5000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [])

  async function beginFetch() {
    waitingForStart.current = true
    setFetchLabel('running')
    try {
      await startFetch()
    } catch {
      waitingForStart.current = false
      setFetchLabel('failed')
    }
  }

  function openGame(name: string) {
    setGame(name)
    setMode('game')
  }

  const deadlines = [...manual.deadlines].sort((a, b) => a.at.localeCompare(b.at))
  const upcomingDeadlines = deadlines.filter((item) => daysUntil(item.at, today) >= 0)

  return (
    <div className={`app mode-${mode}`}>
      <aside className="side">
        <div className="title-row">
          <h1>
            <span>小柳ロウ</span>
            <span>配信スケジュール</span>
          </h1>
          <div className="segment">
            <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>
              週
            </button>
            <button className={mode === 'month' || mode === 'game' ? 'on' : ''} onClick={() => setMode('month')}>
              月
            </button>
          </div>
        </div>
        <DateBar
          mode={mode === 'game' ? 'month' : mode}
          cursor={cursor}
          fetchLabel={fetchLabel}
          onFetch={() => void beginFetch()}
          onPrev={() => setCursor(mode === 'month' || mode === 'game' ? shiftMonth(cursor, -1) : addDays(cursor, -7))}
          onNext={() => setCursor(mode === 'month' || mode === 'game' ? shiftMonth(cursor, 1) : addDays(cursor, 7))}
          onToday={() => setCursor(today)}
          onOpenYear={() => setYearOpen(true)}
        />
        {mode === 'game' ? (
          <GameMenu
            year={parseKey(cursor).y}
            streams={listed}
            selected={game}
            onSelect={setGame}
          />
        ) : (
          <>
            <Stats cursor={cursor} mode={mode} streams={listed} onGame={openGame} />
            <LiveNow className="live-now for-wide" streams={listed} onOpen={setSelectedId} />
            <DeadlineList
              items={upcomingDeadlines}
              today={today}
              saving={saving}
              notice={notice}
              onAdd={() => setAddOpen(true)}
              onDelete={(id) =>
                void commitManual({ ...manual, deadlines: manual.deadlines.filter((item) => item.id !== id) })
              }
            />
            <ThemePicker
              className="theme-box for-wide"
              manual={manual}
              draftColor={draftColor}
              saving={saving}
              onDraft={setDraftColor}
              onCommit={async (next) => {
                const saved = await commitManual(next, '色変更')
                setDraftColor(null)
                return saved
              }}
            />
          </>
        )}
      </aside>
      <main className="stage">
        <MobileStats cursor={cursor} mode={mode === 'game' ? 'month' : mode} streams={listed} onGame={openGame} />
        {mode !== 'game' && (
          <>
            <LiveNow className="live-now for-narrow" streams={listed} onOpen={setSelectedId} />
            <DeadlineBanner
              item={upcomingDeadlines[0]}
              today={today}
              saving={saving}
              notice={notice}
              onAdd={() => setAddOpen(true)}
              onDelete={(id) =>
                void commitManual({ ...manual, deadlines: manual.deadlines.filter((item) => item.id !== id) })
              }
            />
          </>
        )}
        <section className="board">
          <div className="binder" aria-hidden="true" />
          {mode === 'week' && <WeekView cursor={cursor} streams={listed} onOpen={setSelectedId} />}
          {mode === 'month' && (
            <MonthView cursor={cursor} streams={listed} deadlines={deadlines} onOpen={setSelectedId} />
          )}
          {mode === 'game' && (
            <GameList
              cursor={cursor}
              game={game}
              streams={listed}
              onPrev={() => setCursor(shiftMonth(cursor, -1))}
              onNext={() => setCursor(shiftMonth(cursor, 1))}
              onOpen={setSelectedId}
            />
          )}
        </section>
      </main>
      {mode !== 'game' && (
        <ThemePicker
          className="theme-box for-narrow"
          manual={manual}
          draftColor={draftColor}
          saving={saving}
          onDraft={setDraftColor}
          onCommit={async (next) => {
            const saved = await commitManual(next, '色変更')
            setDraftColor(null)
            return saved
          }}
        />
      )}
      {yearOpen && (
        <YearPicker
          cursor={cursor}
          streams={listed}
          onClose={() => setYearOpen(false)}
          onPick={(key) => {
            setCursor(key)
            setYearOpen(false)
          }}
        />
      )}
      {selected && (
        <Detail
          stream={selected}
          partners={partnersOf(selected, listed)}
          onClose={() => setSelectedId(null)}
          onExclude={(id) => {
            void commitManual({ ...manual, hiddenIds: [...manual.hiddenIds, id] }).then((saved) => {
              if (saved && id === selected.id) setSelectedId(null)
            })
          }}
        />
      )}
      {addOpen && (
        <AddDialog
          notice={notice}
          saving={saving}
          onClose={() => setAddOpen(false)}
          onDeadline={async (item) => {
            const saved = await commitManual({ ...manual, deadlines: [...manual.deadlines, item] })
            if (saved) setAddOpen(false)
          }}
          onStream={async (item) => {
            const saved = await commitManual({ ...manual, extraStreams: [...manual.extraStreams, item] })
            if (saved) setAddOpen(false)
          }}
        />
      )}
      {!ready && <p className="loading">読み込み中</p>}
    </div>
  )
}

function DateBar({
  mode,
  cursor,
  fetchLabel,
  onFetch,
  onPrev,
  onNext,
  onToday,
  onOpenYear,
}: {
  mode: 'week' | 'month'
  cursor: string
  fetchLabel: 'idle' | 'running' | 'done' | 'failed'
  onFetch: () => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onOpenYear: () => void
}) {
  const weekStart = startOfWeek(cursor)
  const weekEnd = addDays(weekStart, 6)
  const { y, m } = parseKey(mode === 'week' ? weekStart : cursor)
  const label = mode === 'week' ? `${parseKey(weekStart).m}/${parseKey(weekStart).d} - ${parseKey(weekEnd).m}/${parseKey(weekEnd).d}` : `${m}月`
  return (
    <div className="date-block">
      <div className="datebar">
        <button onClick={onPrev} aria-label="前へ">
          ‹
        </button>
        <button className="date-label" onClick={onOpenYear}>
          <small>{y}年</small>
          <strong>
            {label} <span>▾</span>
          </strong>
        </button>
        <button className="today" onClick={onToday}>
          今日
        </button>
        <button onClick={onNext} aria-label="次へ">
          ›
        </button>
      </div>
      <div className="fetch-row">
        <button className="fetch-btn" onClick={onFetch} disabled={fetchLabel === 'running'}>
          手動取得
        </button>
        {fetchLabel === 'running' && <span className="fetch-label">取得中</span>}
        {fetchLabel === 'done' && <span className="fetch-label">取得完了</span>}
        {fetchLabel === 'failed' && <span className="fetch-label failed">取得に失敗しました</span>}
      </div>
    </div>
  )
}

function Stats({
  cursor,
  mode,
  streams,
  onGame,
}: {
  cursor: string
  mode: 'week' | 'month'
  streams: Stream[]
  onGame: (game: string) => void
}) {
  const days = mode === 'week' ? dayKeysOfWeek(cursor) : dayKeysOfMonth(cursor)
  const inView = streamsOnDays(streams, new Set(days))
  const hours = periodHours(inView, days)
  const games = gameHours(inView)
  const shown = games.slice(0, 5)
  const rest = games.slice(5).reduce((sum, [, sec]) => sum + sec, 0)
  return (
    <div className="stats">
      <div className="stat">
        <span>STREAM</span>
        <b>
          {inView.length}
          <small>回</small>
        </b>
      </div>
      <div className="stat">
        <span>HOURS</span>
        <b>
          {formatHours(hours)}
          <small>時間</small>
        </b>
      </div>
      <div className="stat">
        <span>POST</span>
        <b>
          0<small>件</small>
        </b>
      </div>
      <div className="games">
        {shown.map(([name, sec]) => (
          <button key={name} onClick={() => onGame(name)}>
            {name} {formatHours(sec)}h
          </button>
        ))}
        {rest > 0 && <span className="more">ほか {formatHours(rest)}h</span>}
      </div>
    </div>
  )
}

function MobileStats({
  cursor,
  mode,
  streams,
  onGame,
}: {
  cursor: string
  mode: 'week' | 'month'
  streams: Stream[]
  onGame: (game: string) => void
}) {
  const days = mode === 'week' ? dayKeysOfWeek(cursor) : dayKeysOfMonth(cursor)
  const inView = streamsOnDays(streams, new Set(days))
  const hours = periodHours(inView, days)
  return (
    <div className="chips">
      <span>{inView.length}回</span>
      <span>{formatHours(hours)}時間</span>
      <span>0件</span>
      {gameHours(inView).map(([name, sec]) => (
        <button key={name} onClick={() => onGame(name)}>
          {name} {formatHours(sec)}h
        </button>
      ))}
    </div>
  )
}

function liveCaption(stream: Stream): string {
  const raw = stream.title.replace(/【[^】]*】/g, '').trim()
  const text = raw || stream.title
  return text.length > 18 ? `${text.slice(0, 18)}…` : text
}

function LiveNow({
  className,
  streams,
  onOpen,
}: {
  className: string
  streams: Stream[]
  onOpen: (id: string) => void
}) {
  const live = streams.filter((stream) => stream.status === 'live')
  if (live.length === 0) return null
  return (
    <section className={`paper ${className}`}>
      <h2>
        <span>LIVE</span>
        配信中
      </h2>
      <div className="live-row">
        {live.map((stream) => {
          const start = wallFromMs(new Date(stream.start).getTime())
          return (
            <button key={stream.id} type="button" className="live-card" onClick={() => onOpen(stream.id)}>
              <span className="live-thumb" style={{ backgroundImage: thumb(stream) }} />
              <span className="live-pill">
                <b>{stream.shortName}</b>
                {formatHm(start.mins)}〜
              </span>
              <span className="live-title">{liveCaption(stream)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function DeadlineList({
  items,
  today,
  saving,
  notice,
  onAdd,
  onDelete,
}: {
  items: Deadline[]
  today: string
  saving: boolean
  notice: string | null
  onAdd: () => void
  onDelete: (id: string) => void
}) {
  return (
    <section className="deadlines">
      <h2>締切が近いもの</h2>
      {items.map((item) => (
        <DeadlineCard key={item.id} item={item} today={today} saving={saving} onDelete={() => onDelete(item.id)} />
      ))}
      <button className="add-btn" onClick={onAdd} disabled={saving}>
        追加
      </button>
      {notice && <p className="notice">{notice}</p>}
    </section>
  )
}

function DeadlineBanner({
  item,
  today,
  saving,
  notice,
  onAdd,
  onDelete,
}: {
  item?: Deadline
  today: string
  saving: boolean
  notice: string | null
  onAdd: () => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="deadline-banner">
      {item && <DeadlineCard item={item} today={today} saving={saving} onDelete={() => onDelete(item.id)} />}
      <button className="add-btn" onClick={onAdd} disabled={saving}>
        追加
      </button>
      {notice && <p className="notice">{notice}</p>}
    </div>
  )
}

function DeadlineCard({
  item,
  today,
  saving,
  onDelete,
}: {
  item: Deadline
  today: string
  saving: boolean
  onDelete: () => void
}) {
  const left = daysUntil(item.at, today)
  const wall = parseKey(item.at.slice(0, 10))
  const time = item.at.slice(11, 16)
  return (
    <article className="paper deadline">
      <b>あと{left}日</b>
      <div>
        <strong>{item.title}</strong>
        <small>
          {wall.m}/{wall.d}（{weekdayLabel(weekdayOf(item.at.slice(0, 10)))}） {time}
        </small>
      </div>
      <button className="delete-memo" onClick={onDelete} disabled={saving}>
        削除
      </button>
    </article>
  )
}

function ThemePicker({
  className,
  manual,
  draftColor,
  saving,
  onDraft,
  onCommit,
}: {
  className: string
  manual: ManualFile
  draftColor: string | null
  saving: boolean
  onDraft: (color: string | null) => void
  onCommit: (next: ManualFile) => Promise<boolean>
}) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const active = draftColor ? 'custom' : manual.theme
  const pickerValue = draftColor || (active === 'custom' ? manual.customColor : '#8eabc4')
  const builtins = BUILTIN_THEMES.filter((item) => item.id === 'default' || !manual.hiddenThemes.includes(item.id))
  function withoutTheme(id: string): ManualFile {
    return {
      ...manual,
      theme: manual.theme === id ? 'default' : manual.theme,
      hiddenThemes: BUILTIN_THEMES.some((item) => item.id === id)
        ? [...new Set([...manual.hiddenThemes, id])]
        : manual.hiddenThemes,
      presets: manual.presets.filter((item) => item.id !== id),
    }
  }
  return (
    <section className={className}>
      <h2>色</h2>
      <div className="swatches">
        {builtins.map((item) => (
          <span className="swatch-wrap" key={item.id}>
            <button
              className={active === item.id ? 'swatch on' : 'swatch'}
              style={{ background: item.color }}
              aria-label={item.id === 'default' ? '初期色' : item.id}
              disabled={saving}
              onClick={() => void onCommit({ ...manual, theme: item.id })}
            />
            {item.id !== 'default' && (
              <button className="swatch-x" aria-label="この色を削除" disabled={saving} onClick={() => setPendingDelete(item.id)}>
                ×
              </button>
            )}
          </span>
        ))}
        {manual.presets.map((item) => (
          <span className="swatch-wrap" key={item.id}>
            <button
              className={active === item.id ? 'swatch on' : 'swatch'}
              style={{ background: item.color }}
              aria-label="保存した色"
              disabled={saving}
              onClick={() => void onCommit({ ...manual, theme: item.id })}
            />
            <button className="swatch-x" aria-label="この色を削除" disabled={saving} onClick={() => setPendingDelete(item.id)}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="theme-actions">
        <label className="theme-color">
          自由な色
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(pickerValue) ? pickerValue : '#8eabc4'}
            disabled={saving}
            onInput={(event) => onDraft(event.currentTarget.value)}
            onChange={(event) => void onCommit({ ...manual, theme: 'custom', customColor: event.currentTarget.value })}
          />
        </label>
        <button
          type="button"
          disabled={saving || !(draftColor || manual.theme === 'custom')}
          onClick={() => {
            const color = draftColor || manual.customColor
            const id = `preset-${Date.now()}`
            void onCommit({
              ...manual,
              theme: id,
              customColor: color,
              presets: [...manual.presets, { id, color }],
            })
          }}
        >
          プリセットに保存
        </button>
        <button type="button" disabled={saving} onClick={() => void onCommit({ ...manual, theme: 'default' })}>
          初期色に戻す
        </button>
      </div>
      {pendingDelete && (
        <div className="scrim" onClick={() => setPendingDelete(null)}>
          <div className="paper add" onClick={(event) => event.stopPropagation()}>
            <p>この色を削除しますか？</p>
            <button
              className="open"
              type="button"
              disabled={saving}
              onClick={() => {
                const next = withoutTheme(pendingDelete)
                void onCommit(next).then((saved) => {
                  if (saved) setPendingDelete(null)
                })
              }}
            >
              削除する
            </button>
            <button className="cancel" type="button" disabled={saving} onClick={() => setPendingDelete(null)}>
              やめる
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function WeekView({
  cursor,
  streams,
  onOpen,
}: {
  cursor: string
  streams: Stream[]
  onOpen: (id: string) => void
}) {
  const days = dayKeysOfWeek(cursor)
  return (
    <div className="week">
      <div className="week-head">
        <div />
        {days.map((day) => {
          const ranges: [number, number][] = []
          for (const stream of streams) {
            for (const slice of slicesOf(stream)) {
              if (slice.dateKey === day) ranges.push([slice.startMin, slice.endMin])
            }
          }
          const sec = unionMinutes(ranges) * 60
          const wd = weekdayOf(day)
          return (
            <div key={day} className={weekdayClass(wd)}>
              <b>{parseKey(day).d}</b>
              <span>{weekdayLabel(wd)}</span>
              <small>{sec > 0 ? `${formatHours(sec)}h` : ''}</small>
            </div>
          )
        })}
      </div>
      <div className="week-body">
        <div className="hour-gutter">
          {Array.from({ length: 23 }, (_, i) => i + 1).map((hour) => (
            <span key={hour} style={{ top: `${((hour * 60 - AXIS_START) / AXIS_SPAN) * 100}%` }}>
              {hour}
            </span>
          ))}
        </div>
        {days.map((day) => {
          const slices = streams.flatMap((stream) => slicesOf(stream).filter((slice) => slice.dateKey === day))
          return (
            <div key={day} className="day-col">
              {layout(slices).map((slice) => {
                const box = blockBox(slice.startMin, slice.endMin)
                if (!box) return null
                return (
                  <button
                    key={`${slice.stream.id}-${slice.dateKey}`}
                    className="block"
                    style={{
                      top: `${box.top}%`,
                      height: `${box.height}%`,
                      left: `calc(${(slice.col / slice.cols) * 100}% + 2px)`,
                      width: `calc(${100 / slice.cols}% - 4px)`,
                      backgroundImage: thumb(slice.stream),
                    }}
                    onClick={() => onOpen(slice.stream.id)}
                  >
                    <em>{formatHm(slice.startMin)}</em>
                    <span>{shortTitle(slice.stream)}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MonthView({
  cursor,
  streams,
  deadlines,
  onOpen,
}: {
  cursor: string
  streams: Stream[]
  deadlines: Deadline[]
  onOpen: (id: string) => void
}) {
  const days = ['月', '火', '水', '木', '金', '土', '日']
  return (
    <div className="month">
      <div className="month-head">
        {days.map((day, index) => (
          <div key={day} className={index === 5 ? 'sat' : index === 6 ? 'sun' : ''}>
            {day}
          </div>
        ))}
      </div>
      <div className="month-grid">
        {monthCells(cursor).map((cell) => {
          const items = streams.filter((stream) =>
            slicesOf(stream).some((slice) => slice.dateKey === cell.key),
          )
          const sec = periodHours(items, [cell.key])
          const due = deadlines.some((item) => item.at.slice(0, 10) === cell.key)
          return (
            <div key={cell.key} className={cell.inMonth ? 'cell' : 'cell out'}>
              <div className="cell-top">
                <b className={weekdayClass(weekdayOf(cell.key))}>{parseKey(cell.key).d}</b>
                {sec > 0 && <small>{formatHours(sec)}h</small>}
              </div>
              {cell.inMonth && items.length > 0 && (
                <div className={`mosaic n${Math.min(items.length, 4)}`}>
                  {items.slice(0, 4).map((stream) => (
                    <button
                      key={stream.id}
                      style={{ backgroundImage: thumb(stream) }}
                      onClick={() => onOpen(stream.id)}
                      aria-label={stream.title}
                    />
                  ))}
                </div>
              )}
              {due && <em className="due">締切</em>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function YearPicker({
  cursor,
  streams,
  onClose,
  onPick,
}: {
  cursor: string
  streams: Stream[]
  onClose: () => void
  onPick: (key: string) => void
}) {
  const [year, setYear] = useState(parseKey(cursor).y)
  const current = parseKey(cursor)
  return (
    <div className="scrim" onClick={onClose}>
      <div className="year-card" onClick={(event) => event.stopPropagation()}>
        <header>
          <button onClick={() => setYear(year - 1)} aria-label="前年">
            ‹
          </button>
          <strong>{year}年</strong>
          <button onClick={() => setYear(year + 1)} aria-label="次年">
            ›
          </button>
        </header>
        <div className="year-grid">
          {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
            const key = `${year}-${String(month).padStart(2, '0')}-01`
            const days = dayKeysOfMonth(key)
            const items = streamsOnDays(streams, new Set(days))
            const on = current.y === year && current.m === month
            return (
              <button key={month} className={on ? 'on' : ''} onClick={() => onPick(key)}>
                <b>{month}月</b>
                <span>{formatHours(periodHours(items, days))}h</span>
                <small>{items.length}回</small>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Detail({
  stream,
  partners,
  onClose,
  onExclude,
}: {
  stream: Stream
  partners: Stream[]
  onClose: () => void
  onExclude: (id: string) => void
}) {
  const startWall = wallFromMs(new Date(stream.start).getTime())
  const endWall = wallFromMs(endMs(stream))
  const href = stream.url || (stream.videoId ? `https://www.youtube.com/watch?v=${stream.videoId}` : 'https://www.youtube.com/@KoyanagiRou')
  return (
    <div className="scrim" onClick={onClose}>
      <article className="paper detail" onClick={(event) => event.stopPropagation()}>
        <header>
          <div className="tags">
            {displayChips(stream).map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
          <button onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </header>
        {stream.thumbnail ? (
          <img className="hero" src={stream.thumbnail} alt="" />
        ) : (
          <div className="hero" style={{ backgroundImage: thumb(stream) }} />
        )}
        <h2>{stream.title}</h2>
        <dl>
          <div>
            <dt>日付</dt>
            <dd>{dateLabel(startWall.key)}</dd>
          </div>
          <div>
            <dt>時間</dt>
            <dd>
              {formatHm(startWall.mins)} - {formatHm(endWall.mins)}
            </dd>
          </div>
          <div>
            <dt>長さ</dt>
            <dd>
              {approxDuration(
                stream.durationSec ||
                  Math.max(0, Math.round((endMs(stream) - new Date(stream.start).getTime()) / 1000)),
              )}
            </dd>
          </div>
          <div>
            <dt>配信元</dt>
            <dd>
              {stream.shortName}
              {stream.noOwnStream ? '（本人の枠なし）' : ''}
            </dd>
          </div>
        </dl>
        <a className="open" href={href} target="_blank" rel="noreferrer">
          {stream.shortName}の枠を開く
        </a>
        {partners.length > 0 && (
          <section className="partners">
            <h3>コラボ相手の枠</h3>
            {partners.map((partner) => (
              <div key={partner.id}>
                <span>
                  {partner.shortName}
                  <small>{partner.title}</small>
                </span>
                <button onClick={() => onExclude(partner.id)}>除外</button>
              </div>
            ))}
          </section>
        )}
      </article>
    </div>
  )
}

function GameMenu({
  year,
  streams,
  selected,
  onSelect,
}: {
  year: number
  streams: Stream[]
  selected: string | null
  onSelect: (game: string) => void
}) {
  const days = Array.from({ length: 12 }, (_, index) => dayKeysOfMonth(`${year}-${String(index + 1).padStart(2, '0')}-01`)).flat()
  const items = streamsOnDays(streams, new Set(days))
  const games = gameHours(items)
  const current = selected && games.some(([name]) => name === selected) ? selected : games[0]?.[0]
  return (
    <section className="game-menu">
      <h2>ゲーム別一覧</h2>
      {current && <p className="since">SINCE {year}</p>}
      <div>
        {games.map(([name, sec]) => (
          <button key={name} className={name === current ? 'on' : ''} onClick={() => onSelect(name)}>
            <b>{name}</b>
            <span>{formatHours(sec)}h</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function GameList({
  cursor,
  game,
  streams,
  onPrev,
  onNext,
  onOpen,
}: {
  cursor: string
  game: string | null
  streams: Stream[]
  onPrev: () => void
  onNext: () => void
  onOpen: (id: string) => void
}) {
  const { y, m } = parseKey(cursor)
  const days = dayKeysOfMonth(cursor)
  const yearDays = Array.from({ length: 12 }, (_, index) => dayKeysOfMonth(`${y}-${String(index + 1).padStart(2, '0')}-01`)).flat()
  const yearItems = streamsOnDays(streams, new Set(yearDays))
  const names = gameHours(yearItems).map(([name]) => name)
  const current = game && names.includes(game) ? game : names[0]
  const items = streamsOnDays(streams, new Set(days))
    .filter((stream) => stream.games[0] === current)
    .sort((a, b) => a.start.localeCompare(b.start))
  return (
    <div className="game-list">
      <header>
        <button onClick={onPrev} aria-label="前の月">
          ‹
        </button>
        <strong>
          {y}年 {m}月
        </strong>
        <button onClick={onNext} aria-label="次の月">
          ›
        </button>
      </header>
      <p className="game-name">{current ?? '配信なし'}</p>
      <div>
        {items.map((stream) => {
          const startWall = wallFromMs(new Date(stream.start).getTime())
          const endWall = wallFromMs(endMs(stream))
          return (
            <button key={stream.id} onClick={() => onOpen(stream.id)}>
              <i style={{ backgroundImage: thumb(stream) }} />
              <span>
                <small>
                  {dateLabel(startWall.key)} {formatHm(startWall.mins)}-{formatHm(endWall.mins)}・
                  {formatHours(stream.durationSec)}h
                </small>
                <b>{stream.title.replace(/【[^】]*】/g, '').trim() || stream.title}</b>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AddDialog({
  onClose,
  onDeadline,
  onStream,
  notice,
  saving,
}: {
  onClose: () => void
  onDeadline: (item: Deadline) => Promise<void>
  onStream: (item: Stream) => Promise<void>
  notice: string | null
  saving: boolean
}) {
  const [kind, setKind] = useState<'deadline' | 'stream'>('deadline')
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const title = String(data.get('title') || '').trim()
    if (!title) return
    if (kind === 'deadline') {
      const at = String(data.get('at') || '')
      if (!at) return
      await onDeadline({ id: `memo-${Date.now()}`, title, at: `${at}:00+09:00` })
    } else {
      const start = String(data.get('start') || '')
      const end = String(data.get('end') || '')
      if (!start || !end) return
      const startIso = `${start}:00+09:00`
      const endIso = `${end}:00+09:00`
      const durationSec = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000))
      const shortName = String(data.get('channel') || '手動追加').trim()
      const url = String(data.get('url') || '').trim()
      const thumbnail = String(data.get('thumbnail') || '').trim()
      await onStream({
        id: `memo-${Date.now()}`,
        title,
        url: url || undefined,
        thumbnail: thumbnail || undefined,
        channelId: 'manual',
        channelTitle: shortName,
        shortName,
        start: startIso,
        end: endIso,
        durationSec,
        status: 'past',
        games: [],
        tags: ['コラボ'],
        isOwn: false,
      })
    }
  }
  return (
    <div className="scrim" onClick={onClose}>
      <form className="paper add" onClick={(event) => event.stopPropagation()} onSubmit={onSubmit}>
        <header>
          <div className="segment">
            <button type="button" className={kind === 'deadline' ? 'on' : ''} onClick={() => setKind('deadline')}>
              締切
            </button>
            <button type="button" className={kind === 'stream' ? 'on' : ''} onClick={() => setKind('stream')}>
              他枠
            </button>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </header>
        <label>
          タイトル
          <input name="title" required />
        </label>
        {kind === 'deadline' ? (
          <label>
            期限
            <input name="at" type="datetime-local" required />
          </label>
        ) : (
          <>
            <label>
              開始
              <input name="start" type="datetime-local" required />
            </label>
            <label>
              終了
              <input name="end" type="datetime-local" required />
            </label>
            <label>
              配信元
              <input name="channel" placeholder="チャンネル名" />
            </label>
            <label>
              開くURL
              <input name="url" placeholder="https://" />
            </label>
            <label>
              サムネURL
              <input name="thumbnail" placeholder="https://" />
            </label>
          </>
        )}
        {notice && <p className="notice">{notice}</p>}
        <button className="open" type="submit" disabled={saving}>
          追加する
        </button>
      </form>
    </div>
  )
}

function thumb(stream: Stream): string {
  const tint = stream.games[0] === 'APEX' ? '#8d4d5d' : stream.games[0] === 'スプラ' ? '#3f8f78' : '#31465f'
  if (!stream.thumbnail) return `linear-gradient(160deg, ${tint}, #1c2836)`
  return `linear-gradient(180deg, rgba(16,24,34,.05), rgba(16,24,34,.55)), url("${stream.thumbnail}")`
}

export { App }
