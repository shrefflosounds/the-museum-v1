#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "========================================================"
echo "   THE MUSEUM — 3D LEVEL & WORLD EDITOR"
echo "   Launching local editor and Ollama bridge..."
echo "========================================================"

PORT=8099
while lsof -i :$PORT >/dev/null 2>&1; do
    PORT=$((PORT+1))
done

# Start local editor backend server (proxies files, saves overrides, connects to local Ollama)
python3 "$DIR/editor/server.py" &
SERVER_PID=$!

cleanup() {
    kill $SERVER_PID 2>/dev/null
    exit 0
}
trap cleanup EXIT INT TERM

sleep 0.8
open "http://localhost:$PORT/editor/index.html"

echo ""
echo "========================================================"
echo "   Editor active at http://localhost:$PORT/editor/index.html"
echo "   Press Ctrl+C to close editor server."
echo "========================================================"
wait $SERVER_PID
