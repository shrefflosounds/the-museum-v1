#!/bin/bash
# Launch The Museum (newest version from GitHub main)
cd "$(dirname "$0")"

PORT=8000
if lsof -ti tcp:$PORT >/dev/null 2>&1; then
  PORT=8010
fi

python3 -m http.server $PORT >/dev/null 2>&1 &
SERVER_PID=$!
sleep 1.5
open "http://localhost:$PORT/index.html"
echo "The Museum is running at http://localhost:$PORT"
echo "Close this Terminal window to stop the server."
wait $SERVER_PID