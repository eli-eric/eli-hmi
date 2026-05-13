#!/usr/bin/env node
// Sync docs/ to a checked-out GitHub Wiki working tree.
//
// Usage: node scripts/docs/sync-to-wiki.js <docs-dir> <wiki-dir>
//
// Rules:
//   - docs/README.md → wiki/Home.md
//   - docs/<sub>/<file>.md → wiki/<sub>-<file>.md  (flattened with dir prefix)
//   - Relative .md links rewritten:
//       ./adr/0005-x.md   → [[adr-0005-x]]
//       ../frontend/zones.md (read from inside docs/adr/, resolves to docs/frontend/zones.md)
//                         → [[frontend-zones]]
//   - http(s)://, mailto:, anchor-only links pass through unchanged
//   - Cross-tree relative links (e.g. ../../frontend/AGENTS.md) are left as-is — wiki readers
//     who click them will see a 404; that's the deliberate boundary
//   - Files under wiki/ that no longer have a counterpart in docs/ are deleted

const fs = require('node:fs')
const path = require('node:path')

const [docsDir, wikiDir] = process.argv.slice(2)
if (!docsDir || !wikiDir) {
  console.error('Usage: sync-to-wiki.js <docs-dir> <wiki-dir>')
  process.exit(2)
}

const absDocs = path.resolve(docsDir)
const absWiki = path.resolve(wikiDir)

if (!fs.existsSync(absDocs)) {
  console.error(`docs dir not found: ${absDocs}`)
  process.exit(1)
}
if (!fs.existsSync(absWiki)) {
  console.error(`wiki dir not found: ${absWiki}`)
  process.exit(1)
}

function walkMd(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkMd(full, acc)
    else if (entry.isFile() && entry.name.endsWith('.md')) acc.push(full)
  }
  return acc
}

// docs/<sub>/<file>.md → "<sub>-<file>" (no .md extension, wiki convention)
function wikiSlug(absPath) {
  const rel = path.relative(absDocs, absPath).split(path.sep).join('/')
  if (rel === 'README.md') return 'Home'
  return rel.replace(/\.md$/, '').replace(/\//g, '-')
}

function rewriteLink(target, fromFileAbs) {
  // Pass-through cases
  if (/^(https?:|mailto:|#)/i.test(target)) return target
  const anchorIdx = target.indexOf('#')
  const anchor = anchorIdx === -1 ? '' : target.slice(anchorIdx)
  const pathOnly = anchorIdx === -1 ? target : target.slice(0, anchorIdx)
  if (!pathOnly.endsWith('.md')) return target

  const resolved = path.resolve(path.dirname(fromFileAbs), pathOnly)
  // If the link points outside docs/, leave it as-is.
  if (!resolved.startsWith(absDocs + path.sep) && resolved !== absDocs) {
    return target
  }
  if (!fs.existsSync(resolved)) return target // dangling — caught by check-links
  const slug = wikiSlug(resolved)
  return `[[${slug}${anchor}]]`
}

const linkRe = /(\[[^\]]*\])\(([^)]+)\)/g

function rewriteContent(text, fromFileAbs) {
  return text.replace(linkRe, (_match, label, target) => {
    const next = rewriteLink(target.trim(), fromFileAbs)
    if (next.startsWith('[[')) return next // wiki link drops the label form
    return `${label}(${next})`
  })
}

// 1. Write/overwrite the canonical set of wiki pages.
const docFiles = walkMd(absDocs)
const expectedWikiNames = new Set()

for (const file of docFiles) {
  const slug = wikiSlug(file)
  const out = path.join(absWiki, `${slug}.md`)
  expectedWikiNames.add(`${slug}.md`)
  const text = fs.readFileSync(file, 'utf8')
  const rewritten = rewriteContent(text, file)
  fs.writeFileSync(out, rewritten, 'utf8')
}

// 2. Delete wiki .md files that no longer have a counterpart in docs/.
//    Preserve dotfiles and non-.md files.
for (const entry of fs.readdirSync(absWiki, { withFileTypes: true })) {
  if (!entry.isFile()) continue
  if (entry.name.startsWith('.')) continue
  if (!entry.name.endsWith('.md')) continue
  if (expectedWikiNames.has(entry.name)) continue
  fs.unlinkSync(path.join(absWiki, entry.name))
  console.log(`deleted stale: ${entry.name}`)
}

console.log(`synced ${docFiles.length} pages to ${absWiki}`)
