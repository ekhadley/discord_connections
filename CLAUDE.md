# CLAUDE.md

Discord Activity that embeds the daily NYT Wordle and Connections puzzles, with a per-game spectator strip showing other players' colored grids in real time. Wordle is the default tab; the last-used game is restored from `localStorage["lastGame"]`.

## Architecture

- **backend/** — FastAPI (uv-managed). `/api/puzzle/connections` (ET-daily cache from Eyefyre mirror, normalizes array index to level 0-3 since the mirror started returning level=-1 in Sept 2025), `/api/puzzle/wordle` (ET-daily cache from `nytimes.com/svc/wordle/v2/{date}.json` — direct NYT, plaintext solution), `/api/token` (Discord OAuth exchange), `/ws/{game}/{instance_id}` (per-game per-instance presence room, `game ∈ {connections, wordle}`). Serves `frontend/dist` statically when built.
- **frontend/** — Vite + React + TS + `@discord/embedded-app-sdk`. `App.tsx` does Discord SDK connect + tab switcher; each game lives in its own folder (`src/connections/`, `src/wordle/`) with its own `Board`, `game`, `Spectators`, and `*Game.tsx` wrapper. Shared helpers: `discord.ts`, `storage.ts` (generic `saveJson`/`loadJson`), `ws.ts` (`useGameRoom` hook). Same-origin with backend, so no `patchUrlMappings` needed (double-prefixes fetches if left in).
- **Wordle word list** — `frontend/src/wordle/words.txt` is the ~14.8k accepted-guess list from `tabatkins/wordle-list`, imported via Vite's `?raw` and used only for guess validation. The daily solution always comes from the NYT endpoint.
- **deploy/** — `connections.service` (user systemd, uvicorn on 127.0.0.1:8001) and `cloudflared-ingress.yml` (notes for the tunnel rule).

## Secrets

- `backend/.env`: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`
- `frontend/.env`: `VITE_DISCORD_CLIENT_ID` (public, baked into build)

## Deploy on Vex

Hosted at `connections.ekhadley.net` via the existing `vex_tunnel` cloudflared tunnel.

- Transfer: `tar --exclude=node_modules --exclude=.venv --exclude=dist --exclude=.git -czf - . | ssh Vex 'tar -xzf - -C ~/wgmn/discord_connections'`
- Build: `ssh Vex 'cd ~/wgmn/discord_connections/backend && uv sync && cd ../frontend && npm ci && npm run build'`
- Restart: `ssh Vex 'systemctl --user restart connections.service'`
- Logs: `ssh Vex 'journalctl --user -u connections.service -f'`

Tunnel ingress in `~/.cloudflared/config.yml` on Vex routes `connections.ekhadley.net → localhost:8001`. Changing it requires `sudo systemctl restart website_tunnel.service`.

## Discord portal

- Unverified app, OAuth2 scopes: `identify`. Redirect URI: `https://connections.ekhadley.net`.
- Activity URL Mapping: root `/` → `connections.ekhadley.net`. No `/api` sub-mapping needed (same origin).
- App must be invited to the server (<25 members to stay within unverified limits).

## Non-obvious things

- Backend rewrites `level=-1` from the mirror to 0-3 based on the array order (NYT still publishes ordered by difficulty).
- WebSocket URL uses `/.proxy/ws/{game}/{id}` prefix when inside Discord iframe (`*.discordsays.com`), plain `/ws/{game}/{id}` otherwise.
- Connections `initGame` seeds shuffle from `puzzle.id` so the board order is stable across reloads; `shuffle()` re-seeds from `Date.now()`.
- The NYT Wordle endpoint requires a non-default `User-Agent` (the backend sends `Mozilla/5.0`) — without it the request 403s.
- Spectator rooms are per-game: switching tabs unmounts one `*Game` component (closing its WS) and mounts the other (opening a new WS to a different room key).

## Todo

- reveal after failing (Connections)
- Wordle hard mode (must reuse revealed greens / yellows)
- Wordle guess-analysis scoring (rate each guess by information value)
