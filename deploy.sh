#!/bin/sh
# Ledger is served from Cloudflare Pages: https://ledger-80o.pages.dev
# (project "ledger").
set -e
# Deploys go through GitHub. A push to main publishes the site through
# .github/workflows/deploy.yml; running this by hand would put something live that
# no commit holds, which is exactly the drift the workflow exists to prevent.
if [ -z "${GITHUB_ACTIONS:-}" ] && [ "${ALLOW_MANUAL_DEPLOY:-}" != "1" ]; then
  echo "Deploys go through GitHub: commit, push to main, and the deploy workflow publishes it." >&2
  echo "See DEPLOY.md. Set ALLOW_MANUAL_DEPLOY=1 only if GitHub itself is down." >&2
  exit 1
fi

# Emergency use only. Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
out=$(mktemp -d)
cp index.html sw.js manifest.json reset.html icon*.png icon.svg "$out"/
npx wrangler pages deploy "$out" --project-name=ledger --branch=main --commit-dirty=true
