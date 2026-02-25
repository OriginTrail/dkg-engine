#!/usr/bin/env bash
set -euo pipefail

BLAZEGRAPH_JAR="${BLAZEGRAPH_JAR:-$HOME/blazegraph/blazegraph.jar}"
BLAZEGRAPH_PORT=9999
BLAZEGRAPH_PID=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cleanup() {
    echo ""
    echo "Cleaning up..."
    if [[ -n "$BLAZEGRAPH_PID" ]] && kill -0 "$BLAZEGRAPH_PID" 2>/dev/null; then
        echo "   Stopping Blazegraph (PID $BLAZEGRAPH_PID)"
        kill "$BLAZEGRAPH_PID" 2>/dev/null || true
        wait "$BLAZEGRAPH_PID" 2>/dev/null || true
    fi
    echo "Cleanup complete"
}
trap cleanup EXIT

# -- Preflight checks ---------------------------------------------------------

echo "Checking prerequisites..."

if ! command -v java &>/dev/null; then
    echo "ERROR: Java not found. Install a JDK (e.g. brew install --cask zulu17)."
    exit 1
fi

if [[ ! -f "$BLAZEGRAPH_JAR" ]]; then
    echo "ERROR: Blazegraph jar not found at $BLAZEGRAPH_JAR"
    echo "   Set BLAZEGRAPH_JAR env var to the correct path."
    exit 1
fi

if ! mysql -u root -e "SELECT 1" &>/dev/null; then
    echo "ERROR: MySQL is not running or root access failed."
    echo "   Start it with: brew services start mysql@8.0"
    exit 1
fi
echo "   OK: MySQL is reachable"

if ! redis-cli ping &>/dev/null; then
    echo "ERROR: Redis is not running."
    echo "   Start it with: brew services start redis"
    exit 1
fi
echo "   OK: Redis is reachable"

# -- Start Blazegraph ---------------------------------------------------------

BLAZEGRAPH_ALREADY_RUNNING=false
if curl -sf "http://localhost:${BLAZEGRAPH_PORT}/blazegraph/status" &>/dev/null; then
    echo "   OK: Blazegraph already running on port ${BLAZEGRAPH_PORT}"
    BLAZEGRAPH_ALREADY_RUNNING=true
else
    echo "   Starting Blazegraph on port ${BLAZEGRAPH_PORT}..."
    BLAZEGRAPH_DATA_DIR="/tmp/blazegraph-bdd-data"
    mkdir -p "$BLAZEGRAPH_DATA_DIR"
    cd "$BLAZEGRAPH_DATA_DIR"
    java -server -Xmx4g "-Djetty.port=${BLAZEGRAPH_PORT}" \
        -jar "$BLAZEGRAPH_JAR" &>/tmp/blazegraph-bdd.log &
    BLAZEGRAPH_PID=$!
    cd "$PROJECT_ROOT"

    for i in $(seq 1 30); do
        if curl -sf "http://localhost:${BLAZEGRAPH_PORT}/blazegraph/status" &>/dev/null; then
            echo "   OK: Blazegraph started (PID $BLAZEGRAPH_PID)"
            break
        fi
        if ! kill -0 "$BLAZEGRAPH_PID" 2>/dev/null; then
            echo "ERROR: Blazegraph process died. Check /tmp/blazegraph-bdd.log"
            exit 1
        fi
        sleep 2
    done

    if ! curl -sf "http://localhost:${BLAZEGRAPH_PORT}/blazegraph/status" &>/dev/null; then
        echo "ERROR: Blazegraph did not start within 60 seconds."
        exit 1
    fi
fi

# -- Run BDD tests ------------------------------------------------------------

echo ""
echo "Running BDD tests..."
echo ""

cd "$PROJECT_ROOT"

TEST_EXIT=0
REPOSITORY_PASSWORD="${REPOSITORY_PASSWORD:-}" npx cucumber-js \
    --config cucumber.js \
    --tags "not @ignore" \
    --format progress \
    --format-options '{"colorsEnabled": true}' \
    test/bdd/ \
    --import test/bdd/steps/ \
    --exit \
    "$@" || TEST_EXIT=$?

echo ""
if [[ $TEST_EXIT -eq 0 ]]; then
    echo "All BDD tests passed!"
else
    echo "Some BDD tests failed (exit code $TEST_EXIT)"
fi

# If we started Blazegraph, stop it (handled by trap). If it was already
# running, leave BLAZEGRAPH_PID empty so the trap doesn't kill it.
if $BLAZEGRAPH_ALREADY_RUNNING; then
    BLAZEGRAPH_PID=""
fi

exit $TEST_EXIT
