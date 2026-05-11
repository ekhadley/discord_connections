import { useEffect, useState } from "react"
import type { Session } from "../discord"
import { Board } from "./Board"
import { Spectators } from "./Spectators"
import type { Game, Puzzle } from "./game"
import { initGame, submit, toggle, shuffle, revealNext } from "./game"
import { saveJson, loadJson } from "../storage"
import { useGameRoom } from "../ws"

const storageKey = (userId: string, date: string) => `connections:${userId}:${date}`

function mergeSaved(fresh: Game, saved: Partial<Game> | null): Game {
  if (!saved) return fresh
  return {
    ...fresh,
    attempts: saved.attempts ?? [],
    solved: saved.solved ?? [],
    mistakes: saved.mistakes ?? 0,
    done: saved.done ?? null,
    remaining: saved.remaining ?? fresh.remaining,
  }
}

export function ConnectionsGame({ session }: { session: Session }) {
  const [game, setGame] = useState<Game | null>(null)

  useEffect(() => {
    ;(async () => {
      const res = await fetch("/api/puzzle/connections")
      const puzzle = (await res.json()) as Puzzle
      const fresh = initGame(puzzle)
      const isDev = !location.hostname.endsWith("discordsays.com")
      const saved = isDev ? null : loadJson<Partial<Game>>(storageKey(session.user.id, puzzle.date))
      setGame(mergeSaved(fresh, saved))
    })()
  }, [session.user.id])

  const payload = game && {
    attempts: game.attempts.map((a) => ({ levels: a.levels, correct: a.correct })),
    solved: game.solved.map((x) => ({ level: x.level })),
    mistakes: game.mistakes,
    done: game.done !== null,
  }
  const players = useGameRoom("connections", session.instanceId, session.user, payload)

  useEffect(() => {
    if (!game) return
    saveJson(storageKey(session.user.id, game.puzzle.date), {
      attempts: game.attempts,
      solved: game.solved,
      mistakes: game.mistakes,
      done: game.done,
      remaining: game.remaining,
    })
  }, [game])

  if (!game) return <div className="loading">Loading puzzle…</div>

  return (
    <>
      <Spectators players={players} selfId={session.user.id} />
      <Board
        game={game}
        onToggle={(w) => setGame(toggle(game, w))}
        onSubmit={() => setGame(submit(game))}
        onShuffle={() => setGame(shuffle(game))}
        onDeselect={() => setGame({ ...game, selected: [] })}
        onReorder={(newRemaining) => setGame({ ...game, remaining: newRemaining })}
        onReveal={() => setGame(revealNext(game))}
      />
    </>
  )
}
