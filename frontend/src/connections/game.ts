export type Group = { level: number; group: string; members: string[] }
export type Puzzle = { id: number; date: string; answers: Group[] }

export type Attempt = { words: string[]; levels: number[]; correct: boolean }
export type Solved = { level: number; group: string; members: string[] }

export type Game = {
  puzzle: Puzzle
  remaining: string[]
  selected: string[]
  attempts: Attempt[]
  solved: Solved[]
  mistakes: number
  done: "win" | "lose" | null
}

export const MAX_MISTAKES = 4
export const LEVEL_COLORS = ["#f9df6d", "#a0c35a", "#b0c4ef", "#ba81c5"]
export const LEVEL_EMOJI = ["🟨", "🟩", "🟦", "🟪"]

export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function initGame(puzzle: Puzzle): Game {
  const words = puzzle.answers.flatMap((a) => a.members)
  return {
    puzzle,
    remaining: seededShuffle(words, puzzle.id),
    selected: [],
    attempts: [],
    solved: [],
    mistakes: 0,
    done: null,
  }
}

export function levelOf(puzzle: Puzzle, word: string): number {
  for (const g of puzzle.answers) if (g.members.includes(word)) return g.level
  throw new Error(`word not in puzzle: ${word}`)
}

export function toggle(g: Game, word: string): Game {
  if (g.done || g.selected.includes(word)) {
    return { ...g, selected: g.selected.filter((w) => w !== word) }
  }
  if (g.selected.length >= 4) return g
  return { ...g, selected: [...g.selected, word] }
}

export function submit(g: Game): Game {
  if (g.selected.length !== 4 || g.done) return g
  const levels = g.selected.map((w) => levelOf(g.puzzle, w)).sort()
  const correct = levels[0] === levels[3]
  const attempt: Attempt = { words: g.selected, levels, correct }
  if (correct) {
    const group = g.puzzle.answers.find((a) => a.level === levels[0])!
    const solved = [...g.solved, { level: group.level, group: group.group, members: group.members }]
    const remaining = g.remaining.filter((w) => !g.selected.includes(w))
    const done = solved.length === 4 ? "win" : null
    return { ...g, attempts: [...g.attempts, attempt], solved, remaining, selected: [], done }
  }
  const mistakes = g.mistakes + 1
  const done = mistakes >= MAX_MISTAKES ? "lose" : null
  return { ...g, attempts: [...g.attempts, attempt], mistakes, done }
}

export function shuffle(g: Game): Game {
  return { ...g, remaining: seededShuffle(g.remaining, Date.now() & 0x7fffffff) }
}

export function revealNext(g: Game): Game {
  if (g.done !== "lose") return g
  const solvedLevels = new Set(g.solved.map((s) => s.level))
  const next = g.puzzle.answers.find((a) => !solvedLevels.has(a.level))
  if (!next) return g
  const solved = [...g.solved, { level: next.level, group: next.group, members: next.members }]
  const remaining = g.remaining.filter((w) => !next.members.includes(w))
  return { ...g, solved, remaining, selected: [] }
}

export function oneAway(att: Attempt): boolean {
  if (att.correct) return false
  const counts = new Map<number, number>()
  for (const l of att.levels) counts.set(l, (counts.get(l) ?? 0) + 1)
  return [...counts.values()].some((c) => c === 3)
}

export function shareText(g: Game): string {
  const header = `Connections #${g.puzzle.id}`
  const rows = g.attempts.map((a) => a.words.map((w) => LEVEL_EMOJI[levelOf(g.puzzle, w)]).join(""))
  return [header, ...rows].join("\n")
}
