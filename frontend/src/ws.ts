import { useEffect, useRef, useState } from "react"
import type { User } from "./discord"

export type GameKind = "connections" | "wordle"

function wsUrl(game: GameKind, instanceId: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws"
  const isDiscord = location.hostname.endsWith("discordsays.com")
  const prefix = isDiscord ? "/.proxy/ws" : "/ws"
  return `${proto}://${location.host}${prefix}/${game}/${instanceId}`
}

export function useGameRoom<P extends Record<string, unknown>>(
  game: GameKind,
  instanceId: string | null,
  user: User | null,
  payload: P | null,
): Record<string, any> {
  const [players, setPlayers] = useState<Record<string, any>>({})
  const wsRef = useRef<WebSocket | null>(null)
  const payloadRef = useRef<P | null>(payload)
  const userRef = useRef<User | null>(user)

  useEffect(() => {
    if (!instanceId) return
    setPlayers({})
    const ws = new WebSocket(wsUrl(game, instanceId))
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
  }, [game, instanceId])

  useEffect(() => {
    payloadRef.current = payload
    userRef.current = user
    sendUpdate()
  }, [payload, user])

  function sendUpdate() {
    const ws = wsRef.current
    const p = payloadRef.current
    const u = userRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN || !p || !u) return
    ws.send(JSON.stringify({ type: "update", user: u, ...p }))
  }

  return players
}
