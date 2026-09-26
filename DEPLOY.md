# Deploying Ledger

Live at https://ledger-80o.pages.dev (Cloudflare Pages project `ledger`).

Every push to `main` publishes the site through `.github/workflows/deploy.yml`, and that is
the only route to the live site. Nothing is uploaded to Cloudflare by hand or from a Claude
session: commit, push, and the workflow does the rest. Each Cloudflare deployment is labelled
with the commit it came from, and the workflow fails unless the live site ends up on that
commit, so what is live is always a commit here. A failed run emails David.

What gets published: `index.html`, `sw.js`, `manifest.json`, `reset.html` and the icons, copied from the repo root into `site/`.

Bump the app version and the service worker cache together in the same commit, as before.

## Credentials

The workflow holds no secret. It asks GitHub for a short-lived identity token and trades it
at the GravityLine deploy relay (`https://gravityline-ci.pages.dev/token`). The relay checks
GitHub's signature and answers only this repository's `deploy.yml`, running on `main`, and
only with this app's Pages project. The Cloudflare token lives in the relay's encrypted
settings and nowhere in GitHub. The relay's source is in the General Utility Apps project
under `claude/ci/`.

## Rollback

`git revert` the bad commit and push. Cloudflare also keeps every past deployment, and the
Pages dashboard can roll back in one click; the next push returns the site to `main`.

`deploy.sh` refuses to run by hand. Set `ALLOW_MANUAL_DEPLOY=1` only if GitHub itself is down and
something has to go out; the next push puts the site back on a commit.
