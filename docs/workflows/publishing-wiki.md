# Workflow: publishing to the wiki

`docs/` is mirrored to the [GitHub Wiki](https://github.com/eli-eric/eli-hmi/wiki) on every push to `dev`. The mirror is one-way — edit `docs/` in this repo, never the wiki directly.

## What triggers a sync

The workflow `.github/workflows/sync-docs-to-wiki.yml` runs on:

- `push` to the `dev` branch
- with at least one path under `docs/**`

A push that doesn't touch `docs/` doesn't run the workflow. A push to any other branch doesn't run it either. (Production-zone style — make the constraint explicit and don't introduce a runtime override.)

## What the sync does

1. Checks out the repo.
2. Clones the wiki: `git clone https://x-access-token:$TOKEN@github.com/$REPO.wiki.git wiki/`.
3. Runs `node scripts/docs/sync-to-wiki.js docs/ wiki/`. The script:
   - flattens subdirectories with a `<dir>-` prefix (`docs/adr/0005-...` → `wiki/adr-0005-...md`)
   - rewrites in-tree relative links (`./adr/0005-x.md` → `[[adr-0005-x]]`)
   - copies `docs/README.md` to `wiki/Home.md`
   - deletes wiki pages that no longer have a counterpart under `docs/`
4. Commits and pushes to the wiki repo.

Concurrency is gated by a `wiki-sync` group so two parallel runs can't interleave commits.

## How to verify a change before merging

1. Run the local checks:

   ```bash
   node scripts/docs/check-index.js
   node scripts/docs/check-links.js
   ```

   Both must exit 0.

2. (Optional, for risky changes) Test the rewrite against a sandbox wiki:

   ```bash
   # Make sure you have write access to a throwaway wiki repo, then:
   git clone <throwaway>.wiki.git /tmp/sandbox-wiki
   node scripts/docs/sync-to-wiki.js docs/ /tmp/sandbox-wiki
   cd /tmp/sandbox-wiki && git diff
   ```

   Inspect the rewrite and rendered pages.

3. Merge to `dev`. The workflow runs; check the Actions tab.

## Authoring rules

- Use **kebab-case** filenames. Subdirectory + filename together form the wiki page name after flattening (`adr-0005-single-pv-write-endpoint`).
- Use **relative** in-tree links (`./adr/0005-x.md`, `../frontend/zones.md`). External URLs (`https://…`) and anchor-only (`#section`) links pass through unchanged.
- Don't link to files outside `docs/` unless you accept that wiki readers will see a 404 if they click. The sync deliberately does not rewrite cross-repo links.
- Don't write new top-level pages in the wiki UI. They'll be deleted on the next sync.

## When the sync fails

Most failures are one of:

- **Broken internal link.** `check-links.js` is the gate that should have caught this — re-run it locally and fix.
- **Wiki repo doesn't exist.** Enable the wiki under repo settings before the first sync.
- **Permission denied pushing to wiki.** The default `GITHUB_TOKEN` should suffice (`contents: write`); if a fine-grained PAT is in use, re-issue.

## Source

- Workflow: [`.github/workflows/sync-docs-to-wiki.yml`](../../.github/workflows/sync-docs-to-wiki.yml)
- Script: [`scripts/docs/sync-to-wiki.js`](../../scripts/docs/sync-to-wiki.js)
- Validators: [`scripts/docs/check-index.js`](../../scripts/docs/check-index.js), [`scripts/docs/check-links.js`](../../scripts/docs/check-links.js)
