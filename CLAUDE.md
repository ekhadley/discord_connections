# CLAUDE.md

Discord Activity that embeds the daily NYT Connections puzzle, with a spectator strip showing other players' colored tile grids in real time.

## Architecture

- **backend/** — FastAPI (uv-managed). `/api/puzzle` (ET-daily cache from Eyefyre mirror, normalizes array index to level 0-3 since the mirror started returning level=-1 in Sept 2025), `/api/token` (Discord OAuth exchange), `/ws/{instance_id}` (per-instance presence room). Serves `frontend/dist` statically when built.
- **frontend/** — Vite + React + TS + `@discord/embedded-app-sdk`. `App.tsx` glues SDK connect → puzzle fetch → WS → localStorage restore. Same-origin with backend, so no `patchUrlMappings` needed (double-prefixes fetches if left in).
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
- WebSocket URL uses `/.proxy/ws/{id}` prefix when inside Discord iframe (`*.discordsays.com`), plain `/ws/{id}` otherwise.
- `initGame` seeds shuffle from `puzzle.id` so the board order is stable across reloads; `shuffle()` re-seeds from `Date.now()`.
