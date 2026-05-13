#!/usr/bin/env node
// Fails if any .md under docs/ is not referenced from docs/README.md.
// Excludes docs/README.md itself.
const fs = require('node:fs')
const path = require('node:path')

const docsDir = path.resolve(__dirname, '..', '..', 'docs')
const indexPath = path.join(docsDir, 'README.md')

function walkMd(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkMd(full, acc)
    else if (entry.isFile() && entry.name.endsWith('.md')) acc.push(full)
  }
  return acc
}

if (!fs.existsSync(indexPath)) {
  console.error(`docs/README.md not found at ${indexPath}`)
  process.exit(1)
}

const indexText = fs.readFileSync(indexPath, 'utf8')
const allMd = walkMd(docsDir).filter((p) => p !== indexPath)

const missing = []
for (const file of allMd) {
  const rel = path.relative(docsDir, file).split(path.sep).join('/')
  // Accept either "./rel" or "rel" forms in the index.
  const patterns = [`(${rel})`, `(./${rel})`]
  if (!patterns.some((p) => indexText.includes(p))) missing.push(rel)
}

if (missing.length) {
  console.error('docs/README.md is missing index entries for:')
  for (const m of missing) console.error(`  - ${m}`)
  process.exit(1)
}

console.log(`check-index: OK (${allMd.length} files indexed)`)
