import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import type { Game, Color, WordleSettings } from "./game"
import { typeLetter, backspace, trySubmit, colorsFor, letterStatus, shareText, computeStats, endSummaryText, MAX_GUESSES, WORD_LEN } from "./game"
import { ACCEPTED, ANSWERS } from "./words"
import { SettingsMenu } from "./SettingsMenu"

const COLOR_BG: Record<Color, string> = { g: "#538d4e", y: "#b59f3b", _: "#3a3a3c" }
const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"]
const REVEAL_STAGGER = 360
const REVEAL_DURATION = 676
const BOUNCE_STAGGER = 100
const BOUNCE_DURATION = 1000

export function Board({
  game,
  onChange,
  settings,
  onSettingsChange,
}: {
  game: Game
  onChange: (g: Game) => void
  settings: WordleSettings
  onSettingsChange: (s: WordleSettings) => void
}) {
  const [shake, setShake] = useState(false)
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [revealingRow, setRevealingRow] = useState<number | null>(null)
  const [settledCount, setSettledCount] = useState<number>(WORD_LEN)
  const [bounceRow, setBounceRow] = useState<number | null>(null)
  const prevGuessCount = useRef(game.guesses.length)

  useEffect(() => {
    if (game.guesses.length !== prevGuessCount.current + 1) {
      prevGuessCount.current = game.guesses.length
      return
    }
    prevGuessCount.current = game.guesses.length
    const i = game.guesses.length - 1
    const won = game.done === "win"
    const totalReveal = REVEAL_DURATION + (WORD_LEN - 1) * REVEAL_STAGGER

    setRevealingRow(i)
    setSettledCount(0)
    const timeouts: number[] = []
    for (let j = 0; j < WORD_LEN; j++) {
      timeouts.push(
        window.setTimeout(() => setSettledCount(j + 1), j * REVEAL_STAGGER + REVEAL_DURATION / 2),
      )
    }
    timeouts.push(
      window.setTimeout(() => {
        setRevealingRow((r) => (r === i ? null : r))
        if (won) setBounceRow(i)
      }, totalReveal),
    )
    if (won) {
      timeouts.push(
        window.setTimeout(
          () => setBounceRow((r) => (r === i ? null : r)),
          totalReveal + BOUNCE_DURATION + (WORD_LEN - 1) * BOUNCE_STAGGER,
        ),
      )
    }
    return () => timeouts.forEach((t) => clearTimeout(t))
  }, [game.guesses.length])

  const flashToast = (msg: string) => {
    setToast(msg)
    setShake(true)
    setTimeout(() => setShake(false), 600)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 1440)
  }

  const handleEnter = () => {
    if (game.done) return
    if (game.current.length < WORD_LEN) {
      flashToast("Not enough letters")
      return
    }
    const r = trySubmit(game, ACCEPTED, settings.hardMode)
    if (r.invalid) {
      flashToast(r.reason ?? "Invalid guess")
    } else if (r.game !== game) {
      onChange(r.game)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === "Enter") handleEnter()
      else if (e.key === "Backspace") onChange(backspace(game))
      else if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) onChange(typeLetter(game, e.key.toUpperCase()))
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [game, settings])

  const colored = colorsFor(game)
  const status = letterStatus(game, revealingRow !== null ? settledCount : undefined)

  const stats = useMemo(() => computeStats(game, ANSWERS), [game.done, game.guesses, game.solution])

  const annotations = useMemo<string[] | null>(() => {
    if (!stats) return null
    const won = game.done === "win"
    return stats.map(({ before, after }, i) => {
      if (won && i === stats.length - 1) return `${(100 / before).toFixed(2)}% (1/${before})`
      const bits = -Math.log2(after / before)
      return `${bits.toFixed(2)} (${before} → ${after})`
    })
  }, [stats, game.done])

  const endSummary = useMemo(() => (stats ? endSummaryText(game, stats) : null), [stats, game.done])

  const onKey = (k: string) => {
    if (k === "ENTER") handleEnter()
    else if (k === "BACK") onChange(backspace(game))
    else onChange(typeLetter(game, k))
  }

  const copyShare = async () => {
    const text = shareText(game, endSummary ?? undefined)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = text
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="board wordle-board">
      <div className="wordle-header">
        <div className="puzzle-meta">
          Wordle #{game.puzzle.id} —{" "}
          <a href="https://www.nytimes.com/games/wordle/index.html" target="_blank" rel="noreferrer">
            {game.puzzle.print_date}
          </a>
        </div>
        <SettingsMenu settings={settings} onChange={onSettingsChange} />
      </div>

      {toast && <div className="wordle-toast">{toast}</div>}

      <div className="wordle-grid">
        {Array.from({ length: MAX_GUESSES }).map((_, i) => {
          const isCurrent = i === game.guesses.length
          const letters = i < game.guesses.length ? game.guesses[i] : isCurrent ? game.current : ""
          const colors = i < game.guesses.length ? colored[i] : null
          const isRevealing = revealingRow === i
          const isBouncing = bounceRow === i
          return (
            <div key={i} className={`wordle-row ${isCurrent && shake ? "shake" : ""}`}>
              {Array.from({ length: WORD_LEN }).map((_, j) => {
                const ch = letters[j] ?? ""
                const bg = colors ? COLOR_BG[colors[j]] : undefined
                let cls = "wordle-cell"
                let style: CSSProperties | undefined
                if (isRevealing && bg) {
                  cls += " revealing"
                  style = {
                    ["--final-bg" as any]: bg,
                    animationDelay: `${j * REVEAL_STAGGER}ms`,
                  }
                } else if (colors) {
                  cls += " revealed"
                  style = { background: bg, borderColor: bg }
                  if (isBouncing) {
                    cls += " bouncing"
                    style = { ...style, animationDelay: `${j * BOUNCE_STAGGER}ms` }
                  }
                } else if (ch) {
                  cls += " filled"
                }
                return (
                  <div key={j} className={cls} style={style}>
                    {ch}
                  </div>
                )
              })}
              {annotations && i < annotations.length && (
                <div className="wordle-annotation">{annotations[i]}</div>
              )}
            </div>
          )
        })}
      </div>

      {game.done && (
        <div className="end">
          <div className="end-title">
            {game.done === "win" ? `Solved in ${game.guesses.length}!` : `The word was ${game.solution}`}
          </div>
          {endSummary && <div className="end-summary">{endSummary}</div>}
          <button onClick={copyShare}>{copied ? "Copied!" : "Copy result"}</button>
        </div>
      )}

      {!game.done && (
        <div className="keyboard">
          {ROWS.map((row, i) => (
            <div key={i} className="kb-row">
              {i === 2 && <button className="key wide" onClick={() => onKey("ENTER")}>Enter</button>}
              {row.split("").map((k) => {
                const s = status.get(k)
                return (
                  <button
                    key={k}
                    className="key"
                    style={s ? { background: COLOR_BG[s], color: "#fff" } : undefined}
                    onClick={() => onKey(k)}
                  >
                    {k}
                  </button>
                )
              })}
              {i === 2 && (
                <button className="key wide key-back" onClick={() => onKey("BACK")} aria-label="Backspace">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 5H8.5L3 12l5.5 7H21a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" />
                    <path d="M17 9l-6 6M11 9l6 6" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
