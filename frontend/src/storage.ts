import type { Game } from "./game"

const key = (userId: string, date: string) => `connections:${userId}:${date}`

export function save(userId: string, game: Game) {
  const { puzzle, attempts, solved, mistakes, done, remaining } = game
  localStorage.setItem(
    key(userId, puzzle.date),
    JSON.stringify({ attempts, solved, mistakes, done, remaining }),
  )
}

export function load(userId: string, date: string): Partial<Game> | null {
  const raw = localStorage.getItem(key(userId, date))
  if (!raw) return null
  return JSON.parse(raw)
}
