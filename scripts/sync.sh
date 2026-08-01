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

# --autostash can leave conflict markers in a file that still parses. Belt and
# braces: check.py catches the markers, and this catches the state that
# produces them.
if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then
  echo "A rebase is still in progress. Resolve it before syncing."
  exit 1
fi

echo "→ checking"
python3 scripts/check.py

# The somm tests have NO dependencies — pipeline.test.js imports from src/ and
# nothing else, and wrangler is a devDependency the tests never touch. This used
# to be gated on `[ -d worker/somm/node_modules ]`, which meant a missing
# node_modules skipped the tests silently and sync still reported success. A
# skipped suite looked exactly like a passing one. Run them always; if they
# cannot run, say so and stop rather than pushing on an unknown.
echo "→ somm scoring tests"
if [ ! -f worker/somm/test/pipeline.test.js ]; then
  echo "   test file is missing: worker/somm/test/pipeline.test.js"
  echo "   Refusing to push — the scoring engine would go out untested."
  exit 1
fi
if ! ( cd worker/somm && node test/pipeline.test.js >/dev/null ); then
  echo
  echo "   Somm scoring tests FAILED. Nothing has been committed or pushed."
  echo "   Run them directly to see which case broke:"
  echo "     ( cd worker/somm && node test/pipeline.test.js )"
  exit 1
fi
echo "   passing"

# Ahead-of-origin, not working-tree cleanliness. These are different questions,
# and conflating them is how a merge got silently dropped: `git pull --rebase`
# rewound a merge commit onto the branch, left the working tree spotless, and
# the old guard read that as "nothing to do" and exited 0 without pushing —
# reporting success while the branch sat a commit ahead of origin.
UPSTREAM="origin/$BRANCH"
if git rev-parse --verify --quiet "$UPSTREAM" >/dev/null; then
  AHEAD=$(git rev-list --count "$UPSTREAM..HEAD")
else
  echo "→ $UPSTREAM does not exist yet; this will be the first push"
  AHEAD=0
  UPSTREAM=""
fi

if [ -n "$(git status --porcelain)" ]; then
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
  AHEAD=$((AHEAD + 1))
elif [ "$AHEAD" -eq 0 ] && [ -n "$UPSTREAM" ]; then
  echo "→ nothing to commit, and nothing unpushed; up to date with $UPSTREAM"
  exit 0
else
  echo "→ nothing to commit, but $AHEAD local commit(s) are not on origin yet"
fi

echo "→ pushing $AHEAD commit(s) to origin/$BRANCH"
git push -q origin "$BRANCH"

# Confirm the push actually landed. A push that no-ops, or races another writer,
# must not be reported as success — that is the whole failure this guard exists
# to catch.
git fetch -q origin "$BRANCH"
REMAINING=$(git rev-list --count "origin/$BRANCH..HEAD")
if [ "$REMAINING" -ne 0 ]; then
  echo
  echo "   Push did NOT land: $REMAINING commit(s) still ahead of origin/$BRANCH."
  echo "   Do not treat this as synced. Check for a rejected push or a race."
  exit 1
fi

echo "→ pushed $(git rev-parse --short HEAD) to origin/$BRANCH"
echo "   Shopify will sync it to the staging theme within a minute."
