import { useEffect, useState } from "react"
import type { Session } from "../discord"
import { setActivityStatus } from "../discord"
import { Board } from "./Board"
import { Spectators } from "./Spectators"
import type { Game, WordlePuzzle } from "./game"
import { initGame, colorsFor, MAX_GUESSES } from "./game"
import { saveJson, loadJson } from "../storage"
import { useGameRoom } from "../ws"

const storageKey = (userId: string, date: string) => `wordle:${userId}:${date}`

type Saved = { guesses: string[]; done: "win" | "lose" | null }

export function WordleGame({ session }: { session: Session }) {
  const [game, setGame] = useState<Game | null>(null)

  useEffect(() => {
    ;(async () => {
      const res = await fetch("/api/puzzle/wordle")
      const puzzle = (await res.json()) as WordlePuzzle
      const fresh = initGame(puzzle)
      const isDev = !location.hostname.endsWith("discordsays.com")
      const saved = isDev ? null : loadJson<Saved>(storageKey(session.user.id, puzzle.print_date))
      setGame(saved ? { ...fresh, guesses: saved.guesses, done: saved.done } : fresh)
    })()
  }, [session.user.id])

  const payload = game && {
    guesses: game.guesses.length,
    colors: colorsFor(game),
    done: game.done !== null,
  }
  const players = useGameRoom("wordle", session.instanceId, session.user, payload)

  useEffect(() => {
    if (!game) return
    saveJson(storageKey(session.user.id, game.puzzle.print_date), {
      guesses: game.guesses,
      done: game.done,
    })
    if (session.sdk) {
      const details = `Wordle #${game.puzzle.id}`
      const state =
        game.done === "win" ? `Solved ${game.guesses.length}/${MAX_GUESSES}`
        : game.done === "lose" ? `Lost ${MAX_GUESSES}/${MAX_GUESSES}`
        : `${game.guesses.length}/${MAX_GUESSES} guesses`
      setActivityStatus(session.sdk, details, state)
    }
  }, [game])

  if (!game) return <div className="loading">Loading puzzle…</div>

  return (
    <>
      <Spectators players={players} selfId={session.user.id} />
      <Board game={game} onChange={setGame} />
    </>
  )
}
