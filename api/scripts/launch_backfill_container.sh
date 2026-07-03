#!/usr/bin/env bash
# Launch the info.viz.world hole-backfill as a SELF-RESTARTING sidecar container
# on axveer — fully hands-off resilience (survives crashes, reboots, and site
# [viz-cx-web] redeploys with zero intervention).
#
# It self-configures from the RUNNING viz-cx-api container: it inherits that
# container's image, its MONGO/DB_NAME/COLLECTION env, and its docker networks.
# So there is NO need for sops secrets, NO API redeploy, and NO hand-typed
# network names. The backfill python is bind-mounted from the host, so it
# persists across container restarts/reboots without being baked into the image.
#
# The job is idempotent/resumable: --restart unless-stopped brings it back after
# any crash or host reboot, and on restart it skips every block already in Mongo
# and continues. ~18 days at the gentle 1.0s/block default.
#
# Usage (copy both files to the host, then run the launcher there):
#   scp api/scripts/backfill_from_info_viz.py api/scripts/launch_backfill_container.sh \
#       deploy@5.223.75.86:/tmp/ -P 666
#   ssh deploy@5.223.75.86 -p 666 'bash /tmp/launch_backfill_container.sh'
#
# Manage it afterwards:
#   docker logs -f viz-backfill        # follow progress
#   docker restart viz-backfill        # manual restart (still resumes)
#   docker rm -f viz-backfill          # stop & remove when the hole is filled
#
# CAVEAT — the only event needing a re-run: a viz-cx-API redeploy
# (kamal deploy -c config/deploy.yml) recreates the API container and may tear
# down a kamal-managed network this sidecar shares. Site (viz-cx-web) redeploys
# do NOT. If you redeploy the API mid-run, just run this launcher again — it
# recreates the sidecar from the new API container's config and resumes.

set -euo pipefail

NAME=${NAME:-viz-backfill}
SRC_DIR=/opt/viz-backfill
SCRIPT_NAME=backfill_from_info_viz.py
HERE=$(cd "$(dirname "$0")" && pwd)
: "${BACKFILL_SLEEP:=1.0}"

# Optional explicit range (defaults to the gap-1 hole baked into the script).
# Set both to run a second, parallel sidecar over a different gap, e.g.:
#   NAME=viz-backfill-gap2 BACKFILL_START=80807025 BACKFILL_END=81192999 \
#     BACKFILL_SLEEP=1.5 bash launch_backfill_container.sh
RANGE_ENV=()
[ -n "${BACKFILL_START:-}" ] && RANGE_ENV+=(-e "BACKFILL_START=$BACKFILL_START")
[ -n "${BACKFILL_END:-}" ] && RANGE_ENV+=(-e "BACKFILL_END=$BACKFILL_END")

# 1) stage the backfill python on the host (bind-mounted into the sidecar)
if [ ! -f "$HERE/$SCRIPT_NAME" ]; then
  echo "ERROR: $SCRIPT_NAME not found next to this launcher ($HERE)" >&2
  exit 1
fi
sudo install -D -m 0644 "$HERE/$SCRIPT_NAME" "$SRC_DIR/$SCRIPT_NAME" 2>/dev/null \
  || install -D -m 0644 "$HERE/$SCRIPT_NAME" "$SRC_DIR/$SCRIPT_NAME"

# 2) locate the running API container
API=$(docker ps -qf name=viz-cx-api | head -1)
[ -n "$API" ] || { echo "ERROR: no running viz-cx-api container" >&2; exit 1; }

# 3) inherit image, env, and networks from it
IMAGE=$(docker inspect -f '{{.Config.Image}}' "$API")
getenv() { docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$API" | sed -n "s/^$1=//p" | head -1; }
MONGO=$(getenv MONGO)
DB_NAME=$(getenv DB_NAME);     DB_NAME=${DB_NAME:-viz-cx-api}
COLLECTION=$(getenv COLLECTION); COLLECTION=${COLLECTION:-blocks}
[ -n "$MONGO" ] || { echo "ERROR: could not read MONGO env from $API" >&2; exit 1; }
NETS=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$API")
FIRST=$(echo "$NETS" | awk '{print $1}')
[ -n "$FIRST" ] || { echo "ERROR: API container has no networks?" >&2; exit 1; }

echo "name=$NAME  image=$IMAGE  db=$DB_NAME  coll=$COLLECTION  sleep=${BACKFILL_SLEEP}s"
echo "range=${BACKFILL_START:-default}-${BACKFILL_END:-default}"
echo "networks=[$NETS]"

# 4) (re)create the self-restarting sidecar on the same network(s)
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker create --name "$NAME" --restart unless-stopped \
  --network "$FIRST" \
  -e MONGO="$MONGO" -e DB_NAME="$DB_NAME" -e COLLECTION="$COLLECTION" \
  -e BACKFILL_SLEEP="$BACKFILL_SLEEP" \
  ${RANGE_ENV[@]+"${RANGE_ENV[@]}"} \
  -v "$SRC_DIR/$SCRIPT_NAME:/code/scripts/$SCRIPT_NAME:ro" \
  "$IMAGE" \
  python -m scripts.backfill_from_info_viz >/dev/null
for n in $NETS; do
  [ "$n" = "$FIRST" ] || docker network connect "$n" "$NAME" 2>/dev/null || true
done
docker start "$NAME" >/dev/null

echo
echo "started '$NAME' (restart=unless-stopped)."
echo "  follow : docker logs -f $NAME"
echo "  stop   : docker rm -f $NAME"
