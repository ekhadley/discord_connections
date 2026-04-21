import { useEffect, useRef, useState } from "react"
import { connect, setActivityStatus, type Session } from "./discord"
import { Board } from "./Board"
import { Spectators } from "./Spectators"
import type { Game, Puzzle } from "./game"
import { initGame, submit, toggle, shuffle, LEVEL_EMOJI, MAX_MISTAKES } from "./game"
import { load, save } from "./storage"

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string

function wsUrl(instanceId: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws"
  const isDiscord = location.hostname.endsWith("discordsays.com")
  const path = isDiscord ? `/.proxy/ws/${instanceId}` : `/ws/${instanceId}`
  return `${proto}://${location.host}${path}`
}

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

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Record<string, any>>({})
  const wsRef = useRef<WebSocket | null>(null)
  const gameRef = useRef<Game | null>(null)
  const sessionRef = useRef<Session | null>(null)

  useEffect(() => {
    connect(CLIENT_ID).then(setSession)
  }, [])

  useEffect(() => {
    sessionRef.current = session
    if (!session) return
    ;(async () => {
      const res = await fetch("/api/puzzle")
      const puzzle = (await res.json()) as Puzzle
      const fresh = initGame(puzzle)
      const isDev = !location.hostname.endsWith("discordsays.com")
      const saved = isDev ? null : load(session.user.id, puzzle.date)
      setGame(mergeSaved(fresh, saved))
    })()
  }, [session])

  useEffect(() => {
    if (!session || !game) return
    if (wsRef.current) return
    const ws = new WebSocket(wsUrl(session.instanceId))
    wsRef.current = ws
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === "state") setPlayers(msg.players)
    }
    ws.onopen = () => sendUpdate()
    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [session, !!game])

  const sendUpdate = () => {
    const ws = wsRef.current
    const g = gameRef.current
    const s = sessionRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN || !g || !s) return
    ws.send(
      JSON.stringify({
        type: "update",
        user: s.user,
        attempts: g.attempts.map((a) => ({ levels: a.levels, correct: a.correct })),
        solved: g.solved.map((x) => ({ level: x.level })),
        mistakes: g.mistakes,
        done: g.done !== null,
      }),
    )
  }

  useEffect(() => {
    gameRef.current = game
    if (!game || !session) return
    save(session.user.id, game)
    sendUpdate()
    if (session.sdk) {
      const emojis = game.solved.map((s) => LEVEL_EMOJI[s.level]).join("")
      const details = `Connections #${game.puzzle.id}`
      const state =
        game.done === "win" ? `Solved ${emojis}`
        : game.done === "lose" ? `Lost · ${emojis || "no groups"}`
        : `${emojis || "Playing"} · ${game.mistakes}/${MAX_MISTAKES} mistakes`
      setActivityStatus(session.sdk, details, state)
    }
  }, [game])

  if (!session) return <div className="loading">Connecting…</div>
  if (!game) return <div className="loading">Loading puzzle…</div>

  return (
    <div className="app">
      <Spectators players={players} selfId={session.user.id} />
      <Board
        game={game}
        onToggle={(w) => setGame(toggle(game, w))}
        onSubmit={() => setGame(submit(game))}
        onShuffle={() => setGame(shuffle(game))}
        onDeselect={() => setGame({ ...game, selected: [] })}
        onReorder={(newRemaining) => setGame({ ...game, remaining: newRemaining })}
      />
    </div>
  )
}
