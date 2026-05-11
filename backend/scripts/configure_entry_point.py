"""One-shot: switch the app's entry-point command to APP_HANDLER (handler=1).

Default Discord behavior is DISCORD_LAUNCH_ACTIVITY (handler=2), which auto-posts
"X started Wordle" in the channel on every launch. APP_HANDLER routes the
interaction to our /api/discord/interactions endpoint so we can post a message
only on the first launch per day.

Uses the app's own client credentials (no bot token required). Run once after
wiring the Interactions Endpoint URL in the dev portal:

    cd backend && uv run python scripts/configure_entry_point.py
"""

import os
import sys

import httpx
from dotenv import load_dotenv

load_dotenv()

APP_ID = os.environ["DISCORD_CLIENT_ID"]
CLIENT_SECRET = os.environ["DISCORD_CLIENT_SECRET"]

tok = httpx.post(
    "https://discord.com/api/v10/oauth2/token",
    data={"grant_type": "client_credentials", "scope": "applications.commands.update"},
    auth=(APP_ID, CLIENT_SECRET),
    timeout=15,
)
tok.raise_for_status()
access_token = tok.json()["access_token"]

headers = {"Authorization": f"Bearer {access_token}"}
url = f"https://discord.com/api/v10/applications/{APP_ID}/commands"

cmds = httpx.get(url, headers=headers, timeout=15)
cmds.raise_for_status()
entry = next((c for c in cmds.json() if c.get("type") == 4), None)
if entry is None:
    print("no entry-point command found. visit the dev portal and ensure your app has 'Activities' enabled.")
    sys.exit(1)

print(f"current entry-point: id={entry['id']} name={entry['name']} handler={entry.get('handler')}")

if entry.get("handler") == 1:
    print("already APP_HANDLER, nothing to do.")
    sys.exit(0)

resp = httpx.patch(
    f"{url}/{entry['id']}",
    headers=headers,
    json={"handler": 1},
    timeout=15,
)
resp.raise_for_status()
print(f"updated. new handler: {resp.json().get('handler')}")
