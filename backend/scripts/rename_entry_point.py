"""One-shot: rename the app's entry-point command.

Usage:
    cd backend && uv run python scripts/rename_entry_point.py wordle
"""

import os
import sys

import httpx
from dotenv import load_dotenv

load_dotenv()

APP_ID = os.environ["DISCORD_CLIENT_ID"]
CLIENT_SECRET = os.environ["DISCORD_CLIENT_SECRET"]

new_name = sys.argv[1] if len(sys.argv) > 1 else "wordle"

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
    print("no entry-point command found.")
    sys.exit(1)

print(f"current: id={entry['id']} name={entry['name']} handler={entry.get('handler')}")

if entry["name"] == new_name:
    print(f"already named {new_name}, nothing to do.")
    sys.exit(0)

resp = httpx.patch(
    f"{url}/{entry['id']}",
    headers=headers,
    json={"name": new_name},
    timeout=15,
)
resp.raise_for_status()
print(f"renamed. new name: {resp.json().get('name')}")
