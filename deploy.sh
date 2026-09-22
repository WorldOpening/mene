#!/bin/sh
# Ledger is served from Cloudflare Pages: https://ledger-80o.pages.dev
# (project "ledger"). This repo keeps the history, and GitHub Pages still
# mirrors it at babylon-global.com/mene, which some phone network filters
# block because Google has flagged that domain.
#
# Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment.
set -e
out=$(mktemp -d)
cp index.html sw.js manifest.json reset.html icon*.png icon.svg "$out"/
npx wrangler pages deploy "$out" --project-name=ledger --branch=main --commit-dirty=true
