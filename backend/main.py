import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

CLIENT_ID = os.environ["DISCORD_CLIENT_ID"]
CLIENT_SECRET = os.environ["DISCORD_CLIENT_SECRET"]
MIRROR_URL = "https://raw.githubusercontent.com/Eyefyre/NYT-Connections-Answers/main/connections.json"
ET = ZoneInfo("America/New_York")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def today_et() -> str:
    return datetime.now(ET).date().isoformat()


_puzzle_cache: dict[str, dict] = {}


async def fetch_puzzle_for(date_str: str) -> dict:
    if date_str in _puzzle_cache:
        return _puzzle_cache[date_str]
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(MIRROR_URL)
        r.raise_for_status()
        data = r.json()
    match = next((p for p in data if p["date"] == date_str), None)
    if match is None:
        raise RuntimeError(f"no puzzle for {date_str} in mirror")
    for i, a in enumerate(match["answers"]):
        a["level"] = i
    _puzzle_cache.clear()
    _puzzle_cache[date_str] = match
    return match


@app.get("/api/puzzle")
async def get_puzzle():
    return await fetch_puzzle_for(today_et())


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


rooms: dict[str, Room] = {}


def room_for(instance_id: str) -> Room:
    if instance_id not in rooms:
        rooms[instance_id] = Room()
    return rooms[instance_id]


@app.websocket("/ws/{instance_id}")
async def ws_presence(ws: WebSocket, instance_id: str):
    await ws.accept()
    room = room_for(instance_id)
    room.sockets.add(ws)
    await ws.send_json({"type": "state", "players": room.players})
    try:
        while True:
            msg = await ws.receive_json()
            if msg.get("type") == "update":
                uid = msg["user"]["id"]
                room.players[uid] = {
                    "user": msg["user"],
                    "attempts": msg.get("attempts", []),
                    "solved": msg.get("solved", []),
                    "mistakes": msg.get("mistakes", 0),
                    "done": msg.get("done", False),
                }
                await room.broadcast()
    except WebSocketDisconnect:
        room.sockets.discard(ws)
        if not room.sockets:
            rooms.pop(instance_id, None)


STATIC_DIR = Path(__file__).parent.parent / "frontend" / "dist"
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
