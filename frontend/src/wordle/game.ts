export type Color = "g" | "y" | "_"

export type WordlePuzzle = {
  id: number
  solution: string
  print_date: string
  days_since_launch: number
  editor: string
}

export type Game = {
  puzzle: WordlePuzzle
  solution: string
  guesses: string[]
  current: string
  done: "win" | "lose" | null
}

export type WordleSettings = {
  hardMode: boolean
}

export const DEFAULT_SETTINGS: WordleSettings = { hardMode: false }

export const MAX_GUESSES = 6
export const WORD_LEN = 5

export function initGame(puzzle: WordlePuzzle): Game {
  return {
    puzzle,
    solution: puzzle.solution.toUpperCase(),
    guesses: [],
    current: "",
    done: null,
  }
}

export function colorize(guess: string, solution: string): Color[] {
  const out: Color[] = Array(WORD_LEN).fill("_")
  const counts = new Map<string, number>()
  for (const c of solution) counts.set(c, (counts.get(c) ?? 0) + 1)
  for (let i = 0; i < WORD_LEN; i++) {
    if (guess[i] === solution[i]) {
      out[i] = "g"
      counts.set(guess[i], counts.get(guess[i])! - 1)
    }
  }
  for (let i = 0; i < WORD_LEN; i++) {
    if (out[i] === "g") continue
    const c = guess[i]
    if ((counts.get(c) ?? 0) > 0) {
      out[i] = "y"
      counts.set(c, counts.get(c)! - 1)
    }
  }
  return out
}

export function typeLetter(g: Game, ch: string): Game {
  if (g.done || g.current.length >= WORD_LEN) return g
  if (!/^[A-Z]$/.test(ch)) return g
  return { ...g, current: g.current + ch }
}

export function backspace(g: Game): Game {
  if (g.done) return g
  return { ...g, current: g.current.slice(0, -1) }
}

export function isPotentialAnswer(candidate: string, prevGuesses: string[], solution: string): boolean {
  for (const prev of prevGuesses) {
    const real = colorize(prev, solution).join("")
    const hyp = colorize(prev, candidate).join("")
    if (real !== hyp) return false
  }
  return true
}

export function trySubmit(g: Game, accepted: Set<string>, hardMode: boolean): { game: Game; invalid: boolean; reason?: string } {
  if (g.done || g.current.length !== WORD_LEN) return { game: g, invalid: false }
  if (!accepted.has(g.current)) return { game: g, invalid: true, reason: "Not in word list" }
  if (hardMode && !isPotentialAnswer(g.current, g.guesses, g.solution)) {
    return { game: g, invalid: true, reason: "Guess must match all clues" }
  }
  const guesses = [...g.guesses, g.current]
  const won = g.current === g.solution
  const lost = !won && guesses.length >= MAX_GUESSES
  return {
    game: { ...g, guesses, current: "", done: won ? "win" : lost ? "lose" : null },
    invalid: false,
  }
}

export function colorsFor(g: Game): Color[][] {
  return g.guesses.map((w) => colorize(w, g.solution))
}

const EMOJI: Record<Color, string> = { g: "🟩", y: "🟨", _: "⬛" }

export type GuessStat = { before: number; after: number }

export function computeStats(g: Game, candidates: Set<string>): GuessStat[] | null {
  if (!g.done) return null
  let possible: string[] = [...new Set([...candidates, g.solution])]
  return g.guesses.map((guess) => {
    const before = possible.length
    const target = colorize(guess, g.solution).join("")
    possible = possible.filter((w) => colorize(guess, w).join("") === target)
    return { before, after: possible.length }
  })
}

export function avgBits(g: Game, stats: GuessStat[]): number | null {
  const won = g.done === "win"
  const narrowing = won ? stats.slice(0, -1) : stats
  if (!narrowing.length) return null
  return narrowing.reduce((s, { before, after }) => s + -Math.log2(after / before), 0) / narrowing.length
}

export function endSummaryText(g: Game, stats: GuessStat[]): string {
  const avg = avgBits(g, stats) ?? 0
  const last = stats[stats.length - 1]
  const won = g.done === "win"
  const tail = won
    ? `Final guess prob: ${(100 / last.before).toFixed(2)}%`
    : `Possible answers on 6th guess: ${last.before}`
  return `Average guess score: ${avg.toFixed(2)}, ${tail}`
}

export function shareText(g: Game, summary?: string): string {
  const score = g.done === "win" ? String(g.guesses.length) : "X"
  const header = `Wordle ${g.puzzle.id} ${score}/${MAX_GUESSES}`
  const rows = colorsFor(g).map((row) => row.map((c) => EMOJI[c]).join(""))
  return [header, ...rows, ...(summary ? [summary] : [])].join("\n")
}

export function letterStatus(g: Game, lastRowLimit?: number): Map<string, Color> {
  const map = new Map<string, Color>()
  const rank: Record<Color, number> = { g: 3, y: 2, _: 1 }
  for (let r = 0; r < g.guesses.length; r++) {
    const w = g.guesses[r]
    const cs = colorize(w, g.solution)
    const limit = r === g.guesses.length - 1 && lastRowLimit !== undefined ? lastRowLimit : WORD_LEN
    for (let j = 0; j < limit; j++) {
      const prev = map.get(w[j])
      if (!prev || rank[cs[j]] > rank[prev]) map.set(w[j], cs[j])
    }
  }
  return map
}
