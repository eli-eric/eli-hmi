#!/usr/bin/env node
// Fails on dangling relative .md links inside docs/.
// Skips http(s)://, mailto:, and anchor-only (#...) links.
const fs = require('node:fs')
const path = require('node:path')

const docsDir = path.resolve(__dirname, '..', '..', 'docs')

function walkMd(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkMd(full, acc)
    else if (entry.isFile() && entry.name.endsWith('.md')) acc.push(full)
  }
  return acc
}

if (!fs.existsSync(docsDir)) {
  console.error(`docs/ not found at ${docsDir}`)
  process.exit(1)
}

const linkRe = /\[[^\]]*\]\(([^)]+)\)/g
const broken = []

for (const file of walkMd(docsDir)) {
  const text = fs.readFileSync(file, 'utf8')
  let m
  while ((m = linkRe.exec(text)) !== null) {
    let target = m[1].trim()
    if (!target) continue
    if (/^(https?:|mailto:|#)/i.test(target)) continue
    // Strip anchor and query.
    target = target.split('#')[0].split('?')[0]
    if (!target) continue
    // Only check links to in-repo .md files; ignore images, dirs, etc.
    if (!target.endsWith('.md')) continue
    const resolved = path.resolve(path.dirname(file), target)
    if (!fs.existsSync(resolved)) {
      broken.push({
        from: path.relative(docsDir, file).split(path.sep).join('/'),
        to: target,
      })
    }
  }
}

if (broken.length) {
  console.error('Broken internal links:')
  for (const b of broken) console.error(`  ${b.from} → ${b.to}`)
  process.exit(1)
}

console.log('check-links: OK')
