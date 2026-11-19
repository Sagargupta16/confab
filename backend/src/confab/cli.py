"""The `confab` command: start the chat on this machine and open it in the browser."""

from __future__ import annotations

import argparse
import threading
import webbrowser

import uvicorn

from .images import IMAGE_DIR


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

    url = f"http://127.0.0.1:{args.port}"
    print(f"confab on {url}  (pictures are saved in {IMAGE_DIR})")
    if not args.no_open:
        # Give the server a moment to bind before the browser asks for the page.
        threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    # 127.0.0.1 only, on purpose: there is no login, so a reachable port is an open wallet.
    uvicorn.run("confab.main:app", host="127.0.0.1", port=args.port)
