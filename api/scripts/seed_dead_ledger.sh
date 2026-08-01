#!/usr/bin/env bash
# One-shot: seed the backfill dead-block ledger for a range an earlier,
# pre-ledger run already swept past, so that work isn't thrown away.
#
# Self-configures from the running viz-cx-api container exactly like
# launch_backfill_container.sh (image, MONGO/DB_NAME/COLLECTION, networks) —
# no sops, no redeploy, and credentials never leave the host.
#
# Usage (on the deploy host, after staging the python next to this script):
#   START=79105831 END=80679604 UPTO=80061830 bash seed_dead_ledger.sh
#
# UPTO MUST be a frontier a previous run demonstrably swept past — everything
# absent below it is dead by construction. Anything above it is unswept
# territory and must be left open.

set -euo pipefail

SRC_DIR=/opt/viz-backfill
SCRIPT_NAME=backfill_from_info_viz.py
HERE=$(cd "$(dirname "$0")" && pwd)

: "${START:?set START}"
: "${END:?set END}"
: "${UPTO:?set UPTO}"

# Stage the current python so the seed and the sidecar run identical code.
sudo install -D -m 0644 "$HERE/$SCRIPT_NAME" "$SRC_DIR/$SCRIPT_NAME" 2>/dev/null \
  || install -D -m 0644 "$HERE/$SCRIPT_NAME" "$SRC_DIR/$SCRIPT_NAME"

API=$(docker ps -qf name=viz-cx-api | head -1)
[ -n "$API" ] || { echo "ERROR: no running viz-cx-api container" >&2; exit 1; }

IMAGE=$(docker inspect -f '{{.Config.Image}}' "$API")
getenv() { docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$API" | sed -n "s/^$1=//p" | head -1; }
MONGO=$(getenv MONGO)
DB_NAME=$(getenv DB_NAME);       DB_NAME=${DB_NAME:-viz-cx-api}
COLLECTION=$(getenv COLLECTION); COLLECTION=${COLLECTION:-blocks}
[ -n "$MONGO" ] || { echo "ERROR: could not read MONGO env from $API" >&2; exit 1; }
NETS=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$API")
FIRST=$(echo "$NETS" | awk '{print $1}')

NAME=viz-backfill-seed-$$
echo "seeding ledger: $START-$UPTO (range end $END)  db=$DB_NAME coll=$COLLECTION"

docker create --name "$NAME" --network "$FIRST" \
  -e MONGO="$MONGO" -e DB_NAME="$DB_NAME" -e COLLECTION="$COLLECTION" \
  -e BACKFILL_START="$START" -e BACKFILL_END="$END" \
  -e BACKFILL_SEED_DEAD_UPTO="$UPTO" \
  -v "$SRC_DIR/$SCRIPT_NAME:/code/scripts/$SCRIPT_NAME:ro" \
  "$IMAGE" python -m scripts.backfill_from_info_viz >/dev/null
for n in $NETS; do
  [ "$n" = "$FIRST" ] || docker network connect "$n" "$NAME" 2>/dev/null || true
done

docker start -a "$NAME"
rc=$(docker inspect -f '{{.State.ExitCode}}' "$NAME")
docker rm -f "$NAME" >/dev/null
exit "$rc"
