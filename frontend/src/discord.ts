import { DiscordSDK } from "@discord/embedded-app-sdk"

export type User = { id: string; username: string; avatar: string | null; global_name?: string | null }

export type Session = { sdk: DiscordSDK; user: User; instanceId: string }

export async function connect(clientId: string): Promise<Session> {
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
