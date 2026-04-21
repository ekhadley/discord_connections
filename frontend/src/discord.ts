import { DiscordSDK } from "@discord/embedded-app-sdk"

export type User = { id: string; username: string; avatar: string | null; global_name?: string | null }

export type Session = { sdk: DiscordSDK | null; user: User; instanceId: string }

export function setActivityStatus(sdk: DiscordSDK, details: string, state: string) {
  return sdk.commands.setActivity({ activity: { details, state } })
}

const isDiscordIframe = () => location.hostname.endsWith("discordsays.com")

async function connectDiscord(clientId: string): Promise<Session> {
  const sdk = new DiscordSDK(clientId)
  await sdk.ready()
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: ["identify"],
  })
  const tokenRes = await fetch("/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  })
  const { access_token } = await tokenRes.json()
  const auth = await sdk.commands.authenticate({ access_token })
  return { sdk, user: auth.user as User, instanceId: sdk.instanceId }
}

function randomSnowflake(): string {
  let s = String(1 + Math.floor(Math.random() * 9))
  for (let i = 0; i < 17; i++) s += Math.floor(Math.random() * 10)
  return s
}

function devSession(): Session {
  const params = new URLSearchParams(location.search)
  const room = params.get("room") ?? "dev"
  const nameParam = params.get("user")

  let id = localStorage.getItem("connections:dev:userId")
  if (!id) {
    id = randomSnowflake()
    localStorage.setItem("connections:dev:userId", id)
  }

  let username = localStorage.getItem("connections:dev:username")
  if (nameParam) {
    username = nameParam
    localStorage.setItem("connections:dev:username", nameParam)
  }
  if (!username) {
    username = `guest-${id.slice(-4)}`
    localStorage.setItem("connections:dev:username", username)
  }

  return {
    sdk: null,
    user: { id, username, avatar: null, global_name: username },
    instanceId: `dev-${room}`,
  }
}

export async function connect(clientId: string): Promise<Session> {
  if (isDiscordIframe()) return connectDiscord(clientId)
  return devSession()
}
