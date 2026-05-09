import { useEffect, useState } from "react"
import { connect, type Session } from "./discord"
import { ConnectionsGame } from "./connections/ConnectionsGame"
import { WordleGame } from "./wordle/WordleGame"

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string

type Tab = "wordle" | "connections"
const initialTab = (): Tab => (localStorage.getItem("lastGame") === "connections" ? "connections" : "wordle")

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [tab, setTab] = useState<Tab>(initialTab)

  useEffect(() => {
    connect(CLIENT_ID).then(setSession)
  }, [])

  useEffect(() => {
    localStorage.setItem("lastGame", tab)
  }, [tab])

  if (!session) return <div className="loading">Connecting…</div>

  return (
    <div className="app">
      <header className="tabs">
        <button className={`tab ${tab === "wordle" ? "active" : ""}`} onClick={() => setTab("wordle")}>Wordle</button>
        <button className={`tab ${tab === "connections" ? "active" : ""}`} onClick={() => setTab("connections")}>Connections</button>
      </header>
      <main className="game-area">
        {tab === "wordle" ? <WordleGame session={session} /> : <ConnectionsGame session={session} />}
      </main>
    </div>
  )
}
