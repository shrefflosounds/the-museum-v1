#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "==============================================="
echo "   SYNCHRONIZING ALL 3D MODELS IN THE MUSEUM..."
echo "==============================================="
python3 "$DIR/tools/sync_models.py"

echo ""
echo "Press any key to close..."
read -n 1 -s
