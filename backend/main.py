import asyncio
import os
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey
from pydantic import BaseModel

load_dotenv()

CLIENT_ID = os.environ["DISCORD_CLIENT_ID"]
CLIENT_SECRET = os.environ["DISCORD_CLIENT_SECRET"]
DISCORD_PUBLIC_KEY = os.environ.get("DISCORD_PUBLIC_KEY", "")
BOT_SHARED_SECRET = os.environ.get("BOT_SHARED_SECRET", "")
CONNECTIONS_MIRROR = "https://raw.githubusercontent.com/Eyefyre/NYT-Connections-Answers/main/connections.json"
WORDLE_URL = "https://www.nytimes.com/svc/wordle/v2/{date}.json"
ET = ZoneInfo("America/New_York")

DB_PATH = Path(__file__).parent / "data" / "streaks.db"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def today_et() -> str:
    return datetime.now(ET).date().isoformat()


def yesterday_et() -> str:
    return (datetime.now(ET).date() - timedelta(days=1)).isoformat()


def db_connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def db_init():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db_connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS solves (
              guild_id     TEXT NOT NULL,
              puzzle_date  TEXT NOT NULL,
              user_id      TEXT NOT NULL,
              username     TEXT,
              guesses      INTEGER NOT NULL,
              avg_bits     REAL,
              solved_at    TEXT NOT NULL,
              PRIMARY KEY (guild_id, puzzle_date, user_id)
            );
            CREATE TABLE IF NOT EXISTS launches (
              guild_id        TEXT NOT NULL,
              puzzle_date     TEXT NOT NULL,
              channel_id      TEXT NOT NULL,
              first_launch_at TEXT NOT NULL,
              PRIMARY KEY (guild_id, puzzle_date)
            );
            CREATE TABLE IF NOT EXISTS guild_channels (
              guild_id   TEXT PRIMARY KEY,
              channel_id TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            """
        )


db_init()


_connections_cache: dict[str, dict] = {}
_wordle_cache: dict[str, dict] = {}


async def fetch_connections(date_str: str) -> dict:
    if date_str in _connections_cache:
        return _connections_cache[date_str]
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(CONNECTIONS_MIRROR)
        r.raise_for_status()
        data = r.json()
    match = next((p for p in data if p["date"] == date_str), None)
    if match is None:
        raise RuntimeError(f"no connections puzzle for {date_str} in mirror")
    for i, a in enumerate(match["answers"]):
        a["level"] = i
    _connections_cache.clear()
    _connections_cache[date_str] = match
    return match


async def fetch_wordle(date_str: str) -> dict:
    if date_str in _wordle_cache:
        return _wordle_cache[date_str]
    async with httpx.AsyncClient(timeout=15, headers={"User-Agent": "Mozilla/5.0"}) as client:
        r = await client.get(WORDLE_URL.format(date=date_str))
        r.raise_for_status()
        data = r.json()
    if "solution" not in data:
        raise RuntimeError(f"wordle response missing 'solution' for {date_str}: {data}")
    _wordle_cache.clear()
    _wordle_cache[date_str] = data
    return data


@app.get("/api/puzzle/connections")
async def get_connections():
    return await fetch_connections(today_et())


@app.get("/api/puzzle/wordle")
async def get_wordle():
    return await fetch_wordle(today_et())


class TokenReq(BaseModel):
    code: str


@app.post("/api/token")
async def exchange_token(req: TokenReq):
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            "https://discord.com/api/oauth2/token",
            data={
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "grant_type": "authorization_code",
                "code": req.code,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        r.raise_for_status()
        return {"access_token": r.json()["access_token"]}


class SolveReq(BaseModel):
    guild_id: str
    puzzle_date: str
    user_id: str
    username: str | None = None
    guesses: int
    avg_bits: float | None = None


def _record_solve(s: SolveReq) -> None:
    with db_connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO solves (guild_id, puzzle_date, user_id, username, guesses, avg_bits, solved_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (s.guild_id, s.puzzle_date, s.user_id, s.username, s.guesses, s.avg_bits, datetime.now(ET).isoformat()),
        )


@app.post("/api/wordle/solve")
async def post_solve(req: SolveReq):
    await asyncio.to_thread(_record_solve, req)
    return {"ok": True}


def _streak_length_through(guild_id: str, end_date: str) -> int:
    with db_connect() as conn:
        rows = conn.execute(
            "SELECT DISTINCT puzzle_date FROM solves WHERE guild_id = ? AND puzzle_date <= ? ORDER BY puzzle_date DESC",
            (guild_id, end_date),
        ).fetchall()
    cursor = datetime.fromisoformat(end_date).date()
    streak = 0
    for row in rows:
        if row["puzzle_date"] == cursor.isoformat():
            streak += 1
            cursor -= timedelta(days=1)
        else:
            break
    return streak


def _yesterday_summary(guild_id: str) -> dict:
    yday = yesterday_et()
    with db_connect() as conn:
        solvers = conn.execute(
            "SELECT user_id, username, guesses, avg_bits, solved_at FROM solves "
            "WHERE guild_id = ? AND puzzle_date = ? ORDER BY solved_at ASC",
            (guild_id, yday),
        ).fetchall()
        channel_row = conn.execute(
            "SELECT channel_id FROM guild_channels WHERE guild_id = ?",
            (guild_id,),
        ).fetchone()
    streak = _streak_length_through(guild_id, yday) if solvers else 0
    return {
        "puzzle_date": yday,
        "streak": streak,
        "channel_id": channel_row["channel_id"] if channel_row else None,
        "solvers": [
            {
                "user_id": r["user_id"],
                "username": r["username"],
                "guesses": r["guesses"],
                "avg_bits": r["avg_bits"],
            }
            for r in solvers
        ],
    }


@app.get("/api/wordle/yesterday")
async def get_yesterday(guild_id: str = Query(...), x_bot_token: str | None = Header(default=None)):
    if not BOT_SHARED_SECRET or x_bot_token != BOT_SHARED_SECRET:
        raise HTTPException(status_code=401, detail="bad bot token")
    return await asyncio.to_thread(_yesterday_summary, guild_id)


def _record_launch_first_today(guild_id: str, channel_id: str, today: str) -> bool:
    """Returns True if this is the first launch for (guild, today)."""
    now = datetime.now(ET).isoformat()
    with db_connect() as conn:
        cur = conn.execute(
            "INSERT OR IGNORE INTO launches (guild_id, puzzle_date, channel_id, first_launch_at) VALUES (?, ?, ?, ?)",
            (guild_id, today, channel_id, now),
        )
        first = cur.rowcount == 1
        conn.execute(
            "INSERT INTO guild_channels (guild_id, channel_id, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, updated_at = excluded.updated_at",
            (guild_id, channel_id, now),
        )
    return first


async def _send_first_launch_followup(interaction_token: str, guild_id: str, today: str) -> None:
    streak = await asyncio.to_thread(_streak_length_through, guild_id, (datetime.fromisoformat(today).date() - timedelta(days=1)).isoformat())
    try:
        puzzle = await fetch_wordle(today)
        wordle_id = puzzle.get("id", "?")
    except Exception:
        wordle_id = "?"
    streak_line = f"🔥 {streak}-day streak — keep it alive." if streak > 0 else "First solve starts a streak."
    content = f"🎯 **Wordle #{wordle_id}** is live. {streak_line}"
    url = f"https://discord.com/api/webhooks/{CLIENT_ID}/{interaction_token}"
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(url, json={"content": content})


@app.post("/api/discord/interactions")
async def discord_interactions(request: Request):
    if not DISCORD_PUBLIC_KEY:
        raise HTTPException(status_code=500, detail="DISCORD_PUBLIC_KEY not configured")
    signature = request.headers.get("X-Signature-Ed25519", "")
    timestamp = request.headers.get("X-Signature-Timestamp", "")
    body = await request.body()
    try:
        VerifyKey(bytes.fromhex(DISCORD_PUBLIC_KEY)).verify(
            timestamp.encode() + body, bytes.fromhex(signature)
        )
    except (BadSignatureError, ValueError):
        raise HTTPException(status_code=401, detail="bad signature")

    payload = await request.json()
    itype = payload.get("type")

    if itype == 1:
        return {"type": 1}

    if itype == 2:
        guild_id = payload.get("guild_id")
        channel_id = payload.get("channel_id")
        token = payload.get("token")
        today = today_et()
        if guild_id and channel_id:
            first = await asyncio.to_thread(_record_launch_first_today, guild_id, channel_id, today)
            if first and token:
                asyncio.create_task(_send_first_launch_followup(token, guild_id, today))
        return {"type": 12}

    return {"type": 1}


class Room:
    def __init__(self):
        self.sockets: set[WebSocket] = set()
        self.players: dict[str, dict] = {}

    async def broadcast(self):
        payload = {"type": "state", "players": self.players}
        dead = []
        for ws in self.sockets:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.sockets.discard(ws)


rooms: dict[tuple[str, str], Room] = {}


def room_for(game: str, instance_id: str) -> Room:
    key = (game, instance_id)
    if key not in rooms:
        rooms[key] = Room()
    return rooms[key]


@app.websocket("/ws/{game}/{instance_id}")
async def ws_presence(ws: WebSocket, game: str, instance_id: str):
    if game not in ("connections", "wordle"):
        await ws.close(code=1008)
        return
    await ws.accept()
    room = room_for(game, instance_id)
    room.sockets.add(ws)
    await ws.send_json({"type": "state", "players": room.players})
    try:
        while True:
            msg = await ws.receive_json()
            if msg.get("type") == "update":
                uid = msg["user"]["id"]
                room.players[uid] = {k: v for k, v in msg.items() if k != "type"}
                await room.broadcast()
    except WebSocketDisconnect:
        room.sockets.discard(ws)
        if not room.sockets:
            rooms.pop((game, instance_id), None)


STATIC_DIR = Path(__file__).parent.parent / "frontend" / "dist"
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
