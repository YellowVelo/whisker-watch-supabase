#!/usr/bin/env bash
# Startup check for every Edge Function on one Supabase project (spec 0078,
# punch list PA-62).
#
# Sends each function an OPTIONS request (the harmless "are you there?"
# request a browser sends before a real one) and expects 200 plus the
# x-deno-execution-id header, which only a function's own running code
# produces. A bare 200 isn't enough: other Supabase layers answer some
# OPTIONS requests themselves without starting any function. A function
# that crashes while starting up answers 500/503 with WORKER_ERROR instead.
# That is what happened to sign-up on staging and prod for 22 hours on
# 2026-11-21 (a broken @sentry/deno release), and no test noticed.
#
# It proves each function STARTS, not that it works.
# No login or key needed: OPTIONS passes the gateway's JWT check.
#
# Usage: scripts/check-functions-start.sh https://<project-ref>.supabase.co
# Run after every function deploy (0006 Technical Standards §11), and hourly
# by .github/workflows/function-health.yml.
set -euo pipefail

BASE_URL="${1:?Usage: $0 https://<project-ref>.supabase.co}"
BASE_URL="${BASE_URL%/}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FUNCTIONS_DIR="$SCRIPT_DIR/../supabase/functions"

# The list of functions comes from the folder, so a new function is covered
# without editing this script.
functions=()
for dir in "$FUNCTIONS_DIR"/*/; do
  name="$(basename "$dir")"
  [[ "$name" == "_shared" ]] && continue
  [[ -f "$dir/index.ts" ]] || continue
  functions+=("$name")
done

if [[ ${#functions[@]} -eq 0 ]]; then
  echo "No functions found under $FUNCTIONS_DIR" >&2
  exit 1
fi

failed=()
for name in "${functions[@]}"; do
  result="no reply"
  # Up to 3 tries, so one slow cold start or network blip isn't reported
  # as a crash. A real startup crash fails every time.
  for attempt in 1 2 3; do
    headers="$(curl -s -D - -o /dev/null --max-time 20 -X OPTIONS "$BASE_URL/functions/v1/$name" || true)"
    status="$(printf '%s' "$headers" | awk 'toupper($1) ~ /^HTTP/ {code=$2} END {print code}')"
    if [[ "$status" == "200" ]] && printf '%s' "$headers" | grep -qi '^x-deno-execution-id:'; then
      result="ok"
      break
    fi
    result="${status:-no reply}"
    [[ "$status" == "200" ]] && result="200 but the function didn't run"
    sleep 3
  done
  printf '%-24s %s\n' "$name" "$result"
  [[ "$result" == "ok" ]] || failed+=("$name ($result)")
done

echo
if [[ ${#failed[@]} -gt 0 ]]; then
  echo "FAILED: ${#failed[@]} of ${#functions[@]} functions did not start on $BASE_URL:" >&2
  printf '  %s\n' "${failed[@]}" >&2
  exit 1
fi
echo "OK: all ${#functions[@]} functions started on $BASE_URL"
