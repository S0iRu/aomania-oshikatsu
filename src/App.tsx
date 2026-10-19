import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Deadline,
  LEGEND,
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
  loadLocalManual,
  mergeManual,
  monthCells,
  parseKey,
  partnersOf,
  passesLegend,
  periodHours,
  saveLocalManual,
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
  const [fileManual, setFileManual] = useState<ManualFile>(emptyManual())
  const [localManual, setLocalManual] = useState<ManualFile>(loadLocalManual)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<'week' | 'month' | 'game'>('week')
  const [cursor, setCursor] = useState(todayKey)
  const [game, setGame] = useState<string | null>(null)
  const [yearOpen, setYearOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [legend, setLegend] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(LEGEND.map((name) => [name, true])),
  )

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    Promise.all([
      fetch(`${base}data/streams.json`, { cache: 'no-store' }).then((res) => res.json()),
      fetch(`${base}data/manual.json`, { cache: 'no-store' }).then((res) => res.json()),
    ])
      .then(([streamFile, manual]: [StreamFile, ManualFile]) => {
        setStreams(streamFile.streams ?? [])
        setFileManual({ ...emptyManual(), ...manual })
      })
      .finally(() => setReady(true))
  }, [])

  const manual = useMemo(() => mergeManual(fileManual, localManual), [fileManual, localManual])
  const listed = useMemo(() => applyManual(streams, manual), [streams, manual])
  const visible = useMemo(
    () => listed.filter((stream) => passesLegend(stream, legend)),
    [listed, legend],
  )
  const selected = listed.find((stream) => stream.id === selectedId) ?? null
  const today = todayKey()

  function updateLocal(next: ManualFile) {
    setLocalManual(next)
    saveLocalManual(next)
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
          onPrev={() => setCursor(mode === 'month' || mode === 'game' ? shiftMonth(cursor, -1) : addDays(cursor, -7))}
          onNext={() => setCursor(mode === 'month' || mode === 'game' ? shiftMonth(cursor, 1) : addDays(cursor, 7))}
          onToday={() => setCursor(today)}
          onOpenYear={() => setYearOpen(true)}
        />
        {mode === 'game' ? (
          <GameMenu
            year={parseKey(cursor).y}
            streams={visible}
            selected={game}
            onSelect={setGame}
          />
        ) : (
          <>
            <Stats cursor={cursor} mode={mode} streams={visible} onGame={openGame} />
            <DeadlineList items={upcomingDeadlines} today={today} />
            <Legend enabled={legend} onToggle={(name) => setLegend({ ...legend, [name]: !legend[name] })} />
          </>
        )}
      </aside>
      <main className="stage">
        <MobileStats cursor={cursor} mode={mode === 'game' ? 'month' : mode} streams={visible} onGame={openGame} />
        {mode !== 'game' && <DeadlineBanner item={upcomingDeadlines[0]} today={today} />}
        <section className="board">
          <div className="binder" aria-hidden="true" />
          {mode === 'week' && <WeekView cursor={cursor} streams={visible} onOpen={setSelectedId} />}
          {mode === 'month' && (
            <MonthView cursor={cursor} streams={visible} deadlines={deadlines} onOpen={setSelectedId} />
          )}
          {mode === 'game' && (
            <GameList
              cursor={cursor}
              game={game}
              streams={visible}
              onPrev={() => setCursor(shiftMonth(cursor, -1))}
              onNext={() => setCursor(shiftMonth(cursor, 1))}
              onOpen={setSelectedId}
            />
          )}
        </section>
      </main>
      <button className="add-btn" onClick={() => setAddOpen(true)}>
        追加
      </button>
      {yearOpen && (
        <YearPicker
          cursor={cursor}
          streams={visible}
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
            updateLocal({ ...localManual, hiddenIds: [...localManual.hiddenIds, id] })
            if (id === selected.id) setSelectedId(null)
          }}
        />
      )}
      {addOpen && (
        <AddDialog
          onClose={() => setAddOpen(false)}
          onDeadline={(item) => updateLocal({ ...localManual, deadlines: [...localManual.deadlines, item] })}
          onStream={(item) => updateLocal({ ...localManual, extraStreams: [...localManual.extraStreams, item] })}
        />
      )}
      {!ready && <p className="loading">読み込み中</p>}
    </div>
  )
}

function DateBar({
  mode,
  cursor,
  onPrev,
  onNext,
  onToday,
  onOpenYear,
}: {
  mode: 'week' | 'month'
  cursor: string
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
        <b>{inView.length}回</b>
      </div>
      <div className="stat">
        <span>HOURS</span>
        <b>{formatHours(hours)}時間</b>
      </div>
      <div className="stat">
        <span>POST</span>
        <b>0件</b>
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

function DeadlineList({ items, today }: { items: Deadline[]; today: string }) {
  if (items.length === 0) return null
  return (
    <section className="deadlines">
      <h2>締切が近いもの</h2>
      {items.map((item) => (
        <DeadlineCard key={item.id} item={item} today={today} />
      ))}
    </section>
  )
}

function DeadlineBanner({ item, today }: { item?: Deadline; today: string }) {
  if (!item) return null
  return (
    <div className="deadline-banner">
      <DeadlineCard item={item} today={today} />
    </div>
  )
}

function DeadlineCard({ item, today }: { item: Deadline; today: string }) {
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
    </article>
  )
}

function Legend({ enabled, onToggle }: { enabled: Record<string, boolean>; onToggle: (name: string) => void }) {
  return (
    <section className="legend">
      <h2>凡例</h2>
      <div>
        {LEGEND.map((name) => (
          <button key={name} className={enabled[name] ? 'on' : 'off'} onClick={() => onToggle(name)}>
            <i className={`dot ${name}`} />
            {name}
          </button>
        ))}
      </div>
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
        <div className="hero" style={{ backgroundImage: thumb(stream) }} />
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
}: {
  onClose: () => void
  onDeadline: (item: Deadline) => void
  onStream: (item: Stream) => void
}) {
  const [kind, setKind] = useState<'deadline' | 'stream'>('deadline')
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const title = String(data.get('title') || '').trim()
    if (!title) return
    if (kind === 'deadline') {
      const at = String(data.get('at') || '')
      if (!at) return
      onDeadline({ id: `local-${Date.now()}`, title, at: `${at}:00+09:00` })
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
      onStream({
        id: `local-${Date.now()}`,
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
    onClose()
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
        <button className="open" type="submit">
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
