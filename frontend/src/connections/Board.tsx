import type { Game } from "./game"
import { LEVEL_COLORS, MAX_MISTAKES, levelOf, oneAway, shareText } from "./game"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

type Props = {
  game: Game
  onToggle: (word: string) => void
  onSubmit: () => void
  onShuffle: () => void
  onDeselect: () => void
  onReorder: (newRemaining: string[]) => void
  onReveal: () => void
}

type Rect = { left: number; top: number; width: number; height: number }
type Phase = "wiggle" | "swap"
type Flight = {
  level: number
  selectedInOrder: string[]
  displacedWords: string[]
  rects: Map<string, Rect>
  phase: Phase
  isReveal: boolean
}

const WIGGLE_MS = 640
const SWAP_MS = 1000

export function Board({ game, onToggle, onSubmit, onShuffle, onDeselect, onReorder, onReveal }: Props) {
  const { remaining, selected, solved, mistakes, done, attempts } = game
  const last = attempts[attempts.length - 1]
  const [copied, setCopied] = useState(false)
  const [wiggling, setWiggling] = useState(false)
  const [flight, setFlight] = useState<Flight | null>(null)
  const [tileH, setTileH] = useState(0)
  const tileRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const gridRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const measure = () => {
      const el = gridRef.current?.querySelector(".tile") as HTMLElement | null
      if (el) setTileH(el.getBoundingClientRect().height)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  const busy = wiggling || flight !== null

  const copyShare = async () => {
    await navigator.clipboard.writeText(shareText(game))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const setTileRef = (word: string, el: HTMLButtonElement | null) => {
    if (el) tileRefs.current.set(word, el)
    else tileRefs.current.delete(word)
  }

  const animateMerge = (level: number, words: string[], onComplete: () => void, isReveal: boolean) => {
    const top4 = remaining.slice(0, 4)
    const displaced = top4.filter((w) => !words.includes(w))
    const selectedNotInTop = words
      .filter((w) => !top4.includes(w))
      .sort((a, b) => remaining.indexOf(a) - remaining.indexOf(b))
    const displacedPositions: number[] = []
    for (let i = 0; i < 4; i++) {
      if (!words.includes(remaining[i])) displacedPositions.push(i)
    }

    const newR = [...remaining]
    displacedPositions.forEach((dispIdx, k) => {
      const dispWord = remaining[dispIdx]
      const selWord = selectedNotInTop[k]
      const selIdx = remaining.indexOf(selWord)
      newR[dispIdx] = selWord
      newR[selIdx] = dispWord
    })
    const finalTop4 = newR.slice(0, 4)

    const startRects = new Map<string, Rect>()
    for (const w of [...words, ...displaced]) {
      const r = tileRefs.current.get(w)!.getBoundingClientRect()
      startRects.set(w, { left: r.left, top: r.top, width: r.width, height: r.height })
    }

    setFlight({
      level,
      selectedInOrder: finalTop4,
      displacedWords: displaced,
      rects: new Map(startRects),
      phase: "wiggle",
      isReveal,
    })

    const gridRectSnapshot = gridRef.current!.getBoundingClientRect()
    const slotW = (gridRectSnapshot.width - 24) / 4
    const slotH = tileH || startRects.get(words[0])!.height
    const posToRect = (posIdx: number): Rect => ({
      left: gridRectSnapshot.left + (posIdx % 4) * (slotW + 8),
      top: gridRectSnapshot.top + Math.floor(posIdx / 4) * (slotH + 8),
      width: slotW,
      height: slotH,
    })

    const needsSwap = displaced.length > 0

    if (needsSwap) {
      setTimeout(() => {
        onReorder(newR)
        const swapRects = new Map<string, Rect>()
        finalTop4.forEach((w, i) => swapRects.set(w, posToRect(i)))
        displacedPositions.forEach((dispIdx, k) => {
          const dispWord = remaining[dispIdx]
          const selWord = selectedNotInTop[k]
          const vacatedIdx = remaining.indexOf(selWord)
          swapRects.set(dispWord, posToRect(vacatedIdx))
        })

        setFlight((f) => (f ? { ...f, rects: new Map(startRects), phase: "swap" } : null))
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            setFlight((f) => (f ? { ...f, rects: swapRects } : null))
          }),
        )
      }, WIGGLE_MS)
    }

    const commitAt = WIGGLE_MS + (needsSwap ? SWAP_MS : 0)
    setTimeout(() => {
      setFlight(null)
      onComplete()
    }, commitAt)
  }

  const startCorrect = (level: number) => animateMerge(level, [...selected], onSubmit, false)

  const startReveal = (level: number) => {
    const group = game.puzzle.answers.find((a) => a.level === level)!
    const groupWords = group.members.filter((w) => remaining.includes(w))
    if (groupWords.length !== 4) return
    animateMerge(level, groupWords, onReveal, true)
  }

  useEffect(() => {
    if (done !== "lose" || busy) return
    const solvedLevels = new Set(solved.map((s) => s.level))
    const nextLevel = [0, 1, 2, 3].find((l) => !solvedLevels.has(l))
    if (nextLevel === undefined) return
    const t = setTimeout(() => startReveal(nextLevel), 600)
    return () => clearTimeout(t)
  }, [done, busy, solved.length])

  const startWrong = () => {
    setWiggling(true)
    setTimeout(() => {
      setWiggling(false)
      onSubmit()
    }, 550)
  }

  const handleSubmit = () => {
    if (selected.length !== 4 || done || busy) return
    const levels = selected.map((w) => levelOf(game.puzzle, w)).sort()
    if (levels[0] === levels[3]) startCorrect(levels[0])
    else startWrong()
  }

  const hiddenWords = new Set<string>()
  if (flight && flight.phase !== "wiggle") {
    flight.selectedInOrder.forEach((w) => hiddenWords.add(w))
    flight.displacedWords.forEach((w) => hiddenWords.add(w))
  }

  const bouncingOrder = flight?.phase === "wiggle"
    ? [...selected].sort((a, b) => remaining.indexOf(a) - remaining.indexOf(b))
    : []

  return (
    <div className="board">
      <div className="puzzle-meta">
        Connections #{game.puzzle.id} —{" "}
        <a href="https://www.nytimes.com/games/connections" target="_blank" rel="noreferrer">
          {game.puzzle.date}
        </a>
      </div>

      {solved.map((s) => (
        <div key={s.level} className="solved-row" style={{ background: LEVEL_COLORS[s.level], height: tileH || undefined }}>
          <div className="solved-title">{s.group}</div>
          <div className="solved-members">{s.members.join(", ")}</div>
        </div>
      ))}

      <div className="grid" ref={gridRef}>
        {remaining.map((word) => {
          const isSelected = selected.includes(word)
          const hidden = hiddenWords.has(word)
          const bounceIdx = bouncingOrder.indexOf(word)
          const bouncing = bounceIdx >= 0
          const revealTinted =
            flight?.isReveal && flight.phase === "wiggle" && flight.selectedInOrder.includes(word)
          return (
            <button
              key={word}
              ref={(el) => setTileRef(word, el)}
              className={`tile ${isSelected ? "selected" : ""} ${wiggling && isSelected ? "wiggle" : ""} ${bouncing ? "bounce" : ""} ${revealTinted ? "reveal-tint" : ""}`}
              style={{
                ...(hidden ? { visibility: "hidden" } : {}),
                ...(bouncing ? { animationDelay: `${bounceIdx * 80}ms` } : {}),
                ...(revealTinted ? { background: LEVEL_COLORS[flight!.level], color: "#1e1f22" } : {}),
              }}
              onClick={() => onToggle(word)}
              disabled={!!done || busy}
            >
              {word}
            </button>
          )
        })}
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
          <button onClick={onShuffle} disabled={busy}>Shuffle</button>
          <button onClick={onDeselect} disabled={selected.length === 0 || busy}>Deselect all</button>
          <button className="primary" onClick={handleSubmit} disabled={selected.length !== 4 || busy}>Submit</button>
        </div>
      )}

      {done && solved.length === 4 && !busy && (
        <div className="end">
          <div className="end-title">{done === "win" ? "Solved!" : "Out of guesses."}</div>
          <button onClick={copyShare}>{copied ? "Copied!" : "Copy result"}</button>
        </div>
      )}

      {flight && flight.phase !== "wiggle" && (
        <div className="flyers">
          {[...flight.selectedInOrder, ...flight.displacedWords].map((w) => {
            const isSelected = flight.selectedInOrder.includes(w)
            const rect = flight.rects.get(w)
            if (!rect) return null
            return (
              <div
                key={w}
                className={`flyer ${flight.phase} ${isSelected ? "flyer-selected" : "flyer-displaced"}`}
                style={{
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  height: rect.height,
                  background: isSelected ? LEVEL_COLORS[flight.level] : "#2b2d31",
                  color: isSelected ? "#1e1f22" : "#f2f3f5",
                }}
              >
                <span className="flyer-word">{w}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
