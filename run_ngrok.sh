#!/usr/bin/env bash
# run_ngrok.sh - expose Stockastic services via ngrok
# Usage: ./run_ngrok.sh [service]
# service: frontend (exposes Next.js on port 3000)
#         backend (exposes Django API on port 8000)
# Example: ./run_ngrok.sh frontend

set -e

SERVICE=$1
if [[ "$SERVICE" == "frontend" ]]; then
  PORT=3000
elif [[ "$SERVICE" == "backend" ]]; then
  PORT=8000
else
  echo "Specify service: frontend or backend"
  exit 1
fi

# Ensure ngrok is installed
if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok not found. Please install Ngrok from https://ngrok.com/download"
  exit 1
fi

# Run ngrok tunnel
ngrok http $PORT
