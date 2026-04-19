import type { Game } from "./game"
import { LEVEL_COLORS, MAX_MISTAKES, oneAway, shareText } from "./game"
import { useState } from "react"

type Props = {
  game: Game
  onToggle: (word: string) => void
  onSubmit: () => void
  onShuffle: () => void
  onDeselect: () => void
}

export function Board({ game, onToggle, onSubmit, onShuffle, onDeselect }: Props) {
  const { remaining, selected, solved, mistakes, done, attempts } = game
  const last = attempts[attempts.length - 1]
  const [copied, setCopied] = useState(false)

  const copyShare = async () => {
    await navigator.clipboard.writeText(shareText(game))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="board">
      <div className="puzzle-meta">Connections #{game.puzzle.id} — {game.puzzle.date}</div>

      {solved.map((s) => (
        <div key={s.level} className="solved-row" style={{ background: LEVEL_COLORS[s.level] }}>
          <div className="solved-title">{s.group}</div>
          <div className="solved-members">{s.members.join(", ")}</div>
        </div>
      ))}

      <div className="grid">
        {remaining.map((word) => (
          <button
            key={word}
            className={`tile ${selected.includes(word) ? "selected" : ""}`}
            onClick={() => onToggle(word)}
            disabled={!!done}
          >
            {word}
          </button>
        ))}
      </div>

      <div className="mistakes">
        Mistakes:
        {Array.from({ length: MAX_MISTAKES }).map((_, i) => (
          <span key={i} className={`dot ${i < mistakes ? "used" : ""}`} />
        ))}
      </div>

      {last && !last.correct && oneAway(last) && !done && <div className="hint">One away!</div>}

      {!done && (
        <div className="controls">
          <button onClick={onShuffle}>Shuffle</button>
          <button onClick={onDeselect} disabled={selected.length === 0}>Deselect all</button>
          <button className="primary" onClick={onSubmit} disabled={selected.length !== 4}>Submit</button>
        </div>
      )}

      {done && (
        <div className="end">
          <div className="end-title">{done === "win" ? "Solved!" : "Out of guesses."}</div>
          <button onClick={copyShare}>{copied ? "Copied!" : "Copy result"}</button>
        </div>
      )}
    </div>
  )
}
