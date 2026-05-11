import { useEffect, useState } from "react"
import type { Session } from "../discord"
import { Board } from "./Board"
import { Spectators } from "./Spectators"
import type { Game, WordlePuzzle, WordleSettings } from "./game"
import { initGame, colorsFor, computeStats, avgBits, DEFAULT_SETTINGS } from "./game"
import { ANSWERS } from "./words"
import { saveJson, loadJson } from "../storage"
import { useGameRoom } from "../ws"

const storageKey = (userId: string, date: string) => `wordle:${userId}:${date}`
const SETTINGS_KEY = "wordle:settings"

type Saved = { guesses: string[]; done: "win" | "lose" | null }

export function WordleGame({ session }: { session: Session }) {
  const [game, setGame] = useState<Game | null>(null)
  const [settings, setSettings] = useState<WordleSettings>(
    () => loadJson<WordleSettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS,
  )

  useEffect(() => {
    saveJson(SETTINGS_KEY, settings)
  }, [settings])

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
    if (game.done === "win" && session.guildId) {
      const reportedKey = `wordle:reported:${session.user.id}:${game.puzzle.print_date}`
      if (!localStorage.getItem(reportedKey)) {
        const stats = computeStats(game, ANSWERS)
        const body = {
          guild_id: session.guildId,
          puzzle_date: game.puzzle.print_date,
          user_id: session.user.id,
          username: session.user.global_name ?? session.user.username,
          guesses: game.guesses.length,
          avg_bits: stats ? avgBits(game, stats) : null,
        }
        fetch("/api/wordle/solve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
          .then((r) => {
            if (!r.ok) throw new Error(`solve report failed: ${r.status}`)
            localStorage.setItem(reportedKey, "1")
          })
          .catch((e) => console.error("solve report failed", e))
      }
    }
  }, [game])

  if (!game) return <div className="loading">Loading puzzle…</div>

  return (
    <>
      <Spectators players={players} selfId={session.user.id} />
      <Board game={game} onChange={setGame} settings={settings} onSettingsChange={setSettings} />
    </>
  )
}
