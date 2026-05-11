# CLAUDE.md

Discord Activity that embeds the daily NYT Wordle and Connections puzzles, with a per-game spectator strip showing other players' colored grids in real time. Wordle is the default tab; the last-used game is restored from `localStorage["lastGame"]`.

## Architecture

- **backend/** — FastAPI (uv-managed). `/api/puzzle/connections` (ET-daily cache from Eyefyre mirror, normalizes array index to level 0-3 since the mirror started returning level=-1 in Sept 2025), `/api/puzzle/wordle` (ET-daily cache from `nytimes.com/svc/wordle/v2/{date}.json` — direct NYT, plaintext solution), `/api/token` (Discord OAuth exchange), `/ws/{game}/{instance_id}` (per-game per-instance presence room, `game ∈ {connections, wordle}`), `/api/wordle/solve` (frontend POSTs on win — guild-scoped), `/api/wordle/yesterday` (frigbot polls; X-Bot-Token gated), `/api/discord/interactions` (Discord entry-point webhook, ed25519-verified). Persists wordle streak state in `backend/data/streaks.db` (SQLite). Serves `frontend/dist` statically when built.
- **frontend/** — Vite + React + TS + `@discord/embedded-app-sdk`. `App.tsx` does Discord SDK connect + tab switcher; each game lives in its own folder (`src/connections/`, `src/wordle/`) with its own `Board`, `game`, `Spectators`, and `*Game.tsx` wrapper. Shared helpers: `discord.ts`, `storage.ts` (generic `saveJson`/`loadJson`), `ws.ts` (`useGameRoom` hook). Same-origin with backend, so no `patchUrlMappings` needed (double-prefixes fetches if left in).
- **Wordle word list** — `frontend/src/wordle/words.txt` is the ~14.8k accepted-guess list from `tabatkins/wordle-list`, imported via Vite's `?raw` and used only for guess validation. The daily solution always comes from the NYT endpoint.
- **deploy/** — `puzzles.service` (user systemd, uvicorn on 127.0.0.1:8001) and `cloudflared-ingress.yml` (notes for the tunnel rule).

## Secrets

- `backend/.env`: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_PUBLIC_KEY` (for ed25519 verification of interactions), `BOT_SHARED_SECRET` (shared with frigbot for the `/api/wordle/yesterday` poll).
- `frontend/.env`: `VITE_DISCORD_CLIENT_ID` (public, baked into build).
- `~/wgmn/frigbot/.env`: `STREAKS_API_BASE=https://connections.ekhadley.net`, `STREAKS_BOT_TOKEN` (matches `BOT_SHARED_SECRET`).

## Deploy on Vex

Hosted at `connections.ekhadley.net` via the existing `vex_tunnel` cloudflared tunnel.

- Transfer: `tar --exclude=node_modules --exclude=.venv --exclude=dist --exclude=.git -czf - . | ssh Vex 'tar -xzf - -C ~/wgmn/discord_connections'`
- Build: `ssh Vex 'cd ~/wgmn/discord_connections/backend && uv sync && cd ../frontend && npm ci && npm run build'`
- Restart: `ssh Vex 'systemctl --user restart puzzles.service'`
- Logs: `ssh Vex 'journalctl --user -u puzzles.service -f'`

Tunnel ingress in `~/.cloudflared/config.yml` on Vex routes `connections.ekhadley.net → localhost:8001`. Changing it requires `sudo systemctl restart website_tunnel.service`.

## Discord portal

- Unverified app, OAuth2 scopes: `identify`. Redirect URI: `https://connections.ekhadley.net`.
- Activity URL Mapping: root `/` → `connections.ekhadley.net`. No `/api` sub-mapping needed (same origin).
- App must be invited to the server (<25 members to stay within unverified limits).
- **Interactions Endpoint URL**: `https://connections.ekhadley.net/api/discord/interactions`. Must be set in the dev portal so Discord routes entry-point command interactions to the backend.
- **Public Key** (General Info page) copies into `backend/.env` as `DISCORD_PUBLIC_KEY` — used for ed25519 signature verification.
- After the endpoint is live and the public key is set, run the one-shot script to switch the entry-point handler from `DISCORD_LAUNCH_ACTIVITY` (default: Discord auto-posts every launch) to `APP_HANDLER` (backend decides). Uses the app's own `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` via the client-credentials OAuth grant — no bot token needed:
  ```
  cd backend && uv run python scripts/configure_entry_point.py
  ```

## Streak/reminder flow

- Frontend reports each win via `POST /api/wordle/solve` (guild-scoped, `INSERT OR IGNORE` so first solve per user per day wins). Avg-bits comes from the existing `computeStats`/`avgBits` helpers in `frontend/src/wordle/game.ts`.
- On Activity launch, Discord posts to `/api/discord/interactions`. The backend records the first launch per `(guild_id, puzzle_date)` and posts a custom "Wordle #N is live, 🔥 streak X days" follow-up via the interaction webhook. Subsequent launches the same day respond with `LAUNCH_ACTIVITY` (type 12) and no message.
- Frigbot's `tasks.loop(time=12:00 ET)` polls `/api/wordle/yesterday?guild_id=…` once per day and posts a recap if the streak is alive (`solvers≥1`). No reminder on broken streaks.
- Manual test: `/wordle_recap_now` slash command in the configured channel triggers the recap immediately.

## Non-obvious things

- Backend rewrites `level=-1` from the mirror to 0-3 based on the array order (NYT still publishes ordered by difficulty).
- WebSocket URL uses `/.proxy/ws/{game}/{id}` prefix when inside Discord iframe (`*.discordsays.com`), plain `/ws/{game}/{id}` otherwise.
- Connections `initGame` seeds shuffle from `puzzle.id` so the board order is stable across reloads; `shuffle()` re-seeds from `Date.now()`.
- The NYT Wordle endpoint requires a non-default `User-Agent` (the backend sends `Mozilla/5.0`) — without it the request 403s.
- Spectator rooms are per-game: switching tabs unmounts one `*Game` component (closing its WS) and mounts the other (opening a new WS to a different room key).

## Todo

- reveal after failing (Connections)
