import { useEffect, useState } from "react"
import type { Game, Color } from "./game"
import { typeLetter, backspace, trySubmit, colorsFor, letterStatus, shareText, MAX_GUESSES, WORD_LEN } from "./game"
import { ACCEPTED } from "./words"

const COLOR_BG: Record<Color, string> = { g: "#538d4e", y: "#b59f3b", _: "#3a3a3c" }
const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"]

export function Board({ game, onChange }: { game: Game; onChange: (g: Game) => void }) {
  const [shake, setShake] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleEnter = () => {
    const r = trySubmit(game, ACCEPTED)
    if (r.invalid) {
      setShake(true)
      setTimeout(() => setShake(false), 500)
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
  }, [game])

  const colored = colorsFor(game)
  const status = letterStatus(game)

  const onKey = (k: string) => {
    if (k === "ENTER") handleEnter()
    else if (k === "BACK") onChange(backspace(game))
    else onChange(typeLetter(game, k))
  }

  const copyShare = async () => {
    await navigator.clipboard.writeText(shareText(game))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="board wordle-board">
      <div className="puzzle-meta">Wordle #{game.puzzle.id} — {game.puzzle.print_date}</div>

      <div className="wordle-grid">
        {Array.from({ length: MAX_GUESSES }).map((_, i) => {
          const isCurrent = i === game.guesses.length
          const letters = i < game.guesses.length ? game.guesses[i] : isCurrent ? game.current : ""
          const colors = i < game.guesses.length ? colored[i] : null
          return (
            <div key={i} className={`wordle-row ${isCurrent && shake ? "shake" : ""}`}>
              {Array.from({ length: WORD_LEN }).map((_, j) => {
                const ch = letters[j] ?? ""
                const bg = colors ? COLOR_BG[colors[j]] : undefined
                return (
                  <div
                    key={j}
                    className={`wordle-cell ${colors ? "revealed" : ch ? "filled" : ""}`}
                    style={bg ? { background: bg, borderColor: bg } : undefined}
                  >
                    {ch}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {game.done && (
        <div className="end">
          <div className="end-title">
            {game.done === "win" ? `Solved in ${game.guesses.length}!` : `The word was ${game.solution}`}
          </div>
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
              {i === 2 && <button className="key wide" onClick={() => onKey("BACK")}>⌫</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
