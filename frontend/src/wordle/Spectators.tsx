import type { Color } from "./game"
import { MAX_GUESSES, WORD_LEN } from "./game"

type PlayerState = {
  user: { id: string; username: string; avatar: string | null; global_name?: string | null }
  colors: Color[][]
  guesses: number
  done: boolean
}

const COLOR_BG: Record<Color, string> = { g: "#538d4e", y: "#b59f3b", _: "#3a3a3c" }

function avatarUrl(user: PlayerState["user"]): string {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
  const idx = Number(BigInt(user.id) >> 22n) % 6
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`
}

export function Spectators({ players, selfId }: { players: Record<string, PlayerState>; selfId: string }) {
  const others = Object.values(players).filter((p) => p.user.id !== selfId)

  return (
    <aside className="spectators">
      {others.map((p) => (
        <div key={p.user.id} className="spec">
          <div className="spec-head">
            <img src={avatarUrl(p.user)} alt="" />
            <span className="name">{p.user.global_name ?? p.user.username}</span>
            {p.done && <span className="badge">done</span>}
          </div>
          <div className="wordle-mini">
            {Array.from({ length: MAX_GUESSES }).map((_, i) => {
              const row = p.colors[i]
              return (
                <div key={i} className="wordle-mini-row">
                  {Array.from({ length: WORD_LEN }).map((_, j) => (
                    <span
                      key={j}
                      className="pip"
                      style={{ background: row ? COLOR_BG[row[j]] : "transparent", border: row ? "none" : "1px solid #3f4147" }}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </aside>
  )
}
