#!/bin/bash

NAMESPACE="$1"
CHUNK_DIR="./$NAMESPACE/chunks"
TOTAL_FILE=".${NAMESPACE}.total_chunks"

if [ -z "$NAMESPACE" ]; then
  echo "❌ Usage: $0 <namespace> (e.g., dkg or paranet-001)"
  exit 1
fi

if [ ! -d "$CHUNK_DIR" ]; then
  echo "❌ Chunk directory not found: $CHUNK_DIR"
  exit 1
fi

if [ ! -f "$TOTAL_FILE" ]; then
  echo "❌ .total_chunks file not found: $TOTAL_FILE"
  exit 1
fi

TOTAL_CHUNKS=$(cat "$TOTAL_FILE")

echo "📦 Monitoring progress for namespace: $NAMESPACE"
echo "🔢 Total chunks: $TOTAL_CHUNKS"

while true; do
  REMAINING=$(ls "$CHUNK_DIR"/*.nq 2>/dev/null | wc -l)
  COMPLETED=$((TOTAL_CHUNKS - REMAINING))
  PERCENT=$((COMPLETED * 100 / TOTAL_CHUNKS))

  BAR_WIDTH=40
  FILLED=$((BAR_WIDTH * COMPLETED / TOTAL_CHUNKS))
  EMPTY=$((BAR_WIDTH - FILLED))
  BAR=$(printf "%${FILLED}s" | tr ' ' '#')$(printf "%${EMPTY}s" | tr ' ' '-')

  echo -ne "\rProgress: [$BAR] $PERCENT%% ($COMPLETED/$TOTAL_CHUNKS)"

  if [ "$REMAINING" -eq 0 ]; then
    echo -e "\n✅ All chunks processed."
    break
  fi

  sleep 2
done