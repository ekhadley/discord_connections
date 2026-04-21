import { LEVEL_COLORS, MAX_MISTAKES } from "./game"

type PlayerState = {
  user: { id: string; username: string; avatar: string | null; global_name?: string | null }
  attempts: { levels: number[]; correct: boolean }[]
  solved: { level: number }[]
  mistakes: number
  done: boolean
}

function avatarUrl(user: PlayerState["user"]): string {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
  const idx = (Number(BigInt(user.id) >> 22n) % 6)
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
          <div className="spec-attempts">
            {p.attempts.map((a, i) => (
              <div key={i} className="row">
                {a.levels.map((lv, j) => (
                  <span key={j} className="pip" style={{ background: LEVEL_COLORS[lv] }} />
                ))}
              </div>
            ))}
          </div>
          <div className="spec-mistakes">
            {Array.from({ length: MAX_MISTAKES }).map((_, i) => (
              <span key={i} className={`dot ${i < p.mistakes ? "used" : ""}`} />
            ))}
          </div>
        </div>
      ))}
    </aside>
  )
}
