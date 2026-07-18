#!/usr/bin/env bash
#
# One-shot PRODUCTION backfill of the 16–17 Jul 2026 gold + silver GAP.
#
# Run this ON THE SERVER (where docker-compose runs) — the Mongo port isn't
# exposed, so this reaches the DB from inside its container. No rebuild, no
# redeploy, no third-party API. Idempotent: it only INSERTS missing days and
# never modifies an existing row, so re-running is a safe no-op.
#
#   bash scripts/backfill-metals-july-gap.sh
#
# Overrides (rarely needed): MONGO_CONTAINER=<name> MONGO_DB=<db> bash scripts/...
#
set -euo pipefail

CONTAINER="${MONGO_CONTAINER:-money-tracker-mongo}"
DB="${MONGO_DB:-money-tracker}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JS="$HERE/../server/src/scripts/backfillMetalsJulyGap.mongo.js"

[ -f "$JS" ] || { echo "ERROR: not found: $JS"; echo "Run from the repo checkout (git pull first)."; exit 1; }

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" >/dev/null 2>&1; then
  echo "ERROR: Mongo container '$CONTAINER' isn't running."
  echo "Set the right name and retry, e.g.:  MONGO_CONTAINER=<name> bash scripts/backfill-metals-july-gap.sh"
  echo "Candidate mongo containers:"
  docker ps --format '{{.Names}}\t{{.Image}}' | grep -i mongo || echo "  (none found)"
  exit 1
fi

echo "==> Backfilling 16–17 Jul gold+silver gap into DB '$DB' (container: $CONTAINER)"
docker exec -i "$CONTAINER" mongosh --quiet "$DB" --eval "$(cat "$JS")"

echo
echo "==> Verify — 14–18 Jul should now be gap-free (est = inserted, live = real GRT):"
docker exec -i "$CONTAINER" mongosh --quiet "$DB" --eval '
db.metalprices.find({date:{$gte:"2026-07-14",$lte:"2026-07-18"}}).sort({metal:1,date:1}).forEach(function(d){
  var v = d.metal === "gold" ? ("retail22k=" + d.retail22k) : ("perGram=" + d.pricePerGram24k);
  var tag = (String(d.source).indexOf("estimated") >= 0 || String(d.retailSource).indexOf("Estimated") >= 0) ? "est" : "live";
  print("  " + d.metal + " " + d.date + "  " + v + "  [" + tag + "]");
});
'
echo
echo "Done. Open the Gold page — 16–17 Jul should now be filled in the history chart."
