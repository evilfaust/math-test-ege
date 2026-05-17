#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RPI_USER="faust"
RPI_HOST="88.201.208.15"
RPI_PORT="22222"
RPI_PATH="/home/faust/apps/ege-deploy/pocketbase/pb_public/"

echo "🛠  Building production bundle..."
npx vite build

echo ""
echo "📦 Syncing pb_public/ → ${RPI_USER}@${RPI_HOST}:${RPI_PATH}"
rsync -avz --delete -e "ssh -p ${RPI_PORT}" pb_public/ "${RPI_USER}@${RPI_HOST}:${RPI_PATH}"

echo ""
echo "✅ Deployed. Open via SSH tunnel:"
echo "   ssh -L 8090:localhost:8090 ${RPI_USER}@${RPI_HOST} -p ${RPI_PORT} -N"
echo "   then http://localhost:8090"
