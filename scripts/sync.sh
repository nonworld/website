#!/usr/bin/env bash
#
# Pull, check, commit, push — in that order.
#
# The order is the whole point. Shopify's GitHub integration is TWO-WAY: every
# edit made in the theme editor commits back to this branch, mostly to
# templates/*.json and config/settings_data.json. If you commit local work
# without pulling first you will collide with those, and the collision lands in
# files that are painful to merge by hand.
#
# Usage:
#   scripts/sync.sh "what changed"
#   scripts/sync.sh                  # generates a message from the diff
#
set -euo pipefail

cd "$(dirname "$0")/.."

BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$BRANCH" = "main" ]; then
  echo "You are on main, which is the live theme."
  echo "Work on staging and merge when it looks right:  git switch staging"
  exit 1
fi

echo "→ pulling $BRANCH (theme-editor commits land here too)"
if ! git pull --rebase --autostash origin "$BRANCH"; then
  echo
  echo "Rebase stopped. Something changed the same lines on both sides —"
  echo "usually a theme-editor edit to a JSON template."
  echo
  echo "  git status              see what conflicts"
  echo "  git rebase --continue   after fixing"
  echo "  git rebase --abort      to back out entirely"
  exit 1
fi

echo "→ checking"
python3 scripts/check.py

if [ -d worker/somm/node_modules ]; then
  echo "→ somm scoring tests"
  ( cd worker/somm && node test/pipeline.test.js >/dev/null && echo "   passing" )
fi

if [ -z "$(git status --porcelain)" ]; then
  echo "→ nothing to commit; up to date with origin/$BRANCH"
  exit 0
fi

echo "→ staging"
git add -A
git status --short

MSG="${1:-}"
if [ -z "$MSG" ]; then
  FILES=$(git diff --cached --name-only | head -3 | xargs -n1 basename | paste -sd ', ' -)
  COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
  MSG="Update $FILES"
  [ "$COUNT" -gt 3 ] && MSG="$MSG and $((COUNT - 3)) more"
fi

git commit -q -m "$MSG"
git push -q origin "$BRANCH"

echo "→ pushed $(git rev-parse --short HEAD) to origin/$BRANCH"
echo "   Shopify will sync it to the staging theme within a minute."
