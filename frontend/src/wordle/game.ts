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

export function trySubmit(g: Game, accepted: Set<string>): { game: Game; invalid: boolean } {
  if (g.done || g.current.length !== WORD_LEN) return { game: g, invalid: false }
  if (!accepted.has(g.current)) return { game: g, invalid: true }
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

export function shareText(g: Game): string {
  const score = g.done === "win" ? String(g.guesses.length) : "X"
  const header = `Wordle ${g.puzzle.id} ${score}/${MAX_GUESSES}`
  const rows = colorsFor(g).map((row) => row.map((c) => EMOJI[c]).join(""))
  return [header, ...rows].join("\n")
}

export function letterStatus(g: Game): Map<string, Color> {
  const map = new Map<string, Color>()
  const rank: Record<Color, number> = { g: 3, y: 2, _: 1 }
  for (const w of g.guesses) {
    const cs = colorize(w, g.solution)
    for (let j = 0; j < WORD_LEN; j++) {
      const prev = map.get(w[j])
      if (!prev || rank[cs[j]] > rank[prev]) map.set(w[j], cs[j])
    }
  }
  return map
}
