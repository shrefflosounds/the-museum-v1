#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "==============================================="
echo "   THE MUSEUM — SYNCHRONIZING 3D MODELS..."
echo "==============================================="
python3 "$DIR/tools/sync_models.py"

# Start real-time background watcher for any model file updates
python3 "$DIR/tools/watch_models.py" &
WATCHER_PID=$!

PORT=8098
while lsof -i :$PORT >/dev/null 2>&1; do
    if curl -s http://localhost:$PORT/index.html | grep -q "THE MUSEUM" 2>/dev/null; then
        open "http://localhost:$PORT/index.html"
        wait $WATCHER_PID
        exit 0
    fi
    PORT=$((PORT+1))
done

echo "Starting The Museum on http://localhost:$PORT..."
python3 -m http.server $PORT &
SERVER_PID=$!

cleanup() {
    kill $SERVER_PID $WATCHER_PID 2>/dev/null
    exit 0
}
trap cleanup EXIT INT TERM

sleep 0.6
open "http://localhost:$PORT/index.html"

echo ""
echo "==============================================="
echo "   THE MUSEUM — AFTER-HOURS EXHIBITION"
echo "   Game running at http://localhost:$PORT"
echo "   Real-time 3D model auto-sync is active."
echo "   Close this window or press Ctrl+C to exit."
echo "==============================================="
wait $SERVER_PID
