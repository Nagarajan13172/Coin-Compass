#!/usr/bin/env bash
#
# One-shot PRODUCTION backfill of the Apr–Jun 2026 gold + silver chart history.
#
# Run this ON THE SERVER (where docker-compose runs) — the Mongo port isn't
# exposed, so this reaches the DB from inside its container. No rebuild, no
# redeploy, no GoldAPI quota. Idempotent: it only INSERTS missing days and never
# modifies an existing row, so re-running is a safe no-op.
#
#   bash scripts/backfill-metals-prod.sh
#
# Overrides (rarely needed): MONGO_CONTAINER=<name> MONGO_DB=<db> bash scripts/...
#
set -euo pipefail

CONTAINER="${MONGO_CONTAINER:-money-tracker-mongo}"
DB="${MONGO_DB:-money-tracker}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JS="$HERE/../server/src/scripts/backfillMetalsProd.mongo.js"

[ -f "$JS" ] || { echo "ERROR: not found: $JS"; echo "Run from the repo checkout (git pull first)."; exit 1; }

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" >/dev/null 2>&1; then
  echo "ERROR: Mongo container '$CONTAINER' isn't running."
  echo "Set the right name and retry, e.g.:  MONGO_CONTAINER=<name> bash scripts/backfill-metals-prod.sh"
  echo "Candidate mongo containers:"
  docker ps --format '{{.Names}}\t{{.Image}}' | grep -i mongo || echo "  (none found)"
  exit 1
fi

echo "==> Backfilling gold+silver history into DB '$DB' (container: $CONTAINER)"
docker exec -i "$CONTAINER" mongosh --quiet "$DB" --eval "$(cat "$JS")"

echo
echo "==> Verify — the Jun->Jul join (estimated should meet live with no cliff):"
docker exec -i "$CONTAINER" mongosh --quiet "$DB" --eval '
function line(m){return db.metalprices.find({metal:m,date:{$gte:"2026-06-26",$lte:"2026-07-03"}}).sort({date:1}).toArray().map(function(d){return "  "+d.date+"  retail22k="+(d.retail22k||"-")+"  g24="+Math.round(d.pricePerGram24k)+"  ["+(String(d.source).indexOf("estimated")>=0?"est":"live")+"]";}).join("\n");}
print("GOLD (chart plots retail22k):\n"+line("gold"));
print("\nSILVER (chart plots spot g24):\n"+line("silver"));
print("\ncounts: gold="+db.metalprices.countDocuments({metal:"gold"})+"  silver="+db.metalprices.countDocuments({metal:"silver"}));
'
echo
echo "Done. Open the Gold page and pick 90D — the Apr–Jun lead-in should be there."
