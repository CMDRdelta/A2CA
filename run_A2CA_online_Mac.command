#!/bin/bash
cd "$(dirname "$0")"
TARGET_TTY="$(tty 2>/dev/null || true)"
STATUS=0
if command -v python3 >/dev/null 2>&1; then
  python3 resources/run_A2CA.py || STATUS=$?
elif command -v python >/dev/null 2>&1; then
  python resources/run_A2CA.py || STATUS=$?
else
  echo "The A2CA local launcher requires Python 3.10 or newer."
  echo "Install Python from https://www.python.org/downloads/ and run this file again."
  echo "The offline Alignment + Tree workflow can be opened with run_A2CA_offline.html."
  read -r -p "Press Return to close..."
  STATUS=1
fi

# When this .command file was double-clicked in macOS Terminal, close only the
# Terminal window/tab that launched A2CA after the local server exits. If the
# script was started from a different terminal application, this is a no-op.
if [ -n "$TARGET_TTY" ] && command -v osascript >/dev/null 2>&1; then
  (
    sleep 0.4
    osascript - "$TARGET_TTY" <<'APPLESCRIPT' >/dev/null 2>&1
on run argv
  set targetTTY to item 1 of argv
  tell application "Terminal"
    repeat with w in windows
      repeat with t in tabs of w
        try
          if (tty of t as text) is targetTTY then
            close w
            return
          end if
        end try
      end repeat
    end repeat
  end tell
end run
APPLESCRIPT
  ) &
fi
exit "$STATUS"
