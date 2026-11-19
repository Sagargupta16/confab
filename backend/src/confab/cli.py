"""The `confab` command: start the chat on this machine and open it in the browser."""

from __future__ import annotations

import argparse
import sys
import threading
import webbrowser

import uvicorn
from sqlalchemy.engine import make_url


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="confab",
        description="A group chat in your browser with Amazon Bedrock models. Runs on "
        "this machine only and uses your own Bedrock credentials.",
    )
    parser.add_argument(
        "--port", type=int, default=8011, help="port to listen on (default 8011)"
    )
    parser.add_argument(
        "--no-open", action="store_true", help="do not open the browser"
    )
    args = parser.parse_args()

    # Imported after parsing, so --help works whatever the environment says, and a
    # refusal reads as one line instead of a traceback.
    try:
        from .images import IMAGE_DIR
        from .settings import settings
    except RuntimeError as error:
        sys.exit(f"confab: {error}")
    if not settings.is_local:
        sys.exit(
            "confab: this command runs local mode only; unset CONFAB_ENVIRONMENT to use it."
        )

    database = make_url(settings.database_url)
    # Only a file path is printed: another URL can carry a password.
    where = (
        database.database
        if database.get_backend_name() == "sqlite"
        else "the database in CONFAB_DATABASE_URL"
    )
    url = f"http://127.0.0.1:{args.port}"
    print(f"confab on {url}")
    print(f"  chats are saved in {where}")
    print(f"  pictures are saved in {IMAGE_DIR or 'the R2 bucket'}")
    if not args.no_open:
        # Give the server a moment to bind before the browser asks for the page.
        threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    # 127.0.0.1 only, on purpose: there is no login, so a reachable port is an open wallet.
    uvicorn.run("confab.main:app", host="127.0.0.1", port=args.port)
