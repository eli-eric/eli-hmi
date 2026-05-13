# Workflow: adding an ADR

ADRs (Architecture Decision Records) live in `docs/adr/`. Each captures one load-bearing decision so future architecture reviews don't re-litigate it.

## When to write one

Write an ADR when:

- a change you made (or rejected) only makes sense given a constraint a fresh contributor wouldn't immediately see
- you considered a refactor and rejected it for a reason that should outlast the conversation
- you took a path that contradicts what a casual reader would assume — and you don't want the next reader to "fix" it

**Don't** write an ADR for:

- bug fixes
- choices that are self-evident from the code or its tests
- ephemeral decisions ("not worth it right now")
- anything the [architecture skill's SKILL.md](../../.agents/skills/improve-codebase-architecture/SKILL.md) would call "self-evident choices"

If you're not sure, the heuristic from the skill applies: *would a future architecture review re-suggest this if the ADR didn't exist?* If yes, write it.

## Numbering

ADRs are sequential, zero-padded to four digits, starting at `0001`. Look at `docs/adr/` and take the next number. The template at [`docs/adr/template.md`](../adr/template.md) is **unnumbered** — copy it, don't number it.

## Format

Use the template literally:

```markdown
# ADR-NNNN: <title>

**Status:** Accepted | Superseded by ADR-NNNN | Deprecated
**Date:** YYYY-MM-DD
**Deciders:** @user1, @user2

## Context
What forces are at play. What we tried. What we observed.

## Decision
The decision, in one paragraph. Use module/interface/seam/etc. where it sharpens the claim.

## Consequences
- Positive: leverage / locality gained.
- Negative: complexity introduced, work pushed elsewhere.
- Open: what remains undecided, what triggers revisiting.

## Alternatives considered
Short list, with one-line reason each was rejected.
```

## Vocabulary

Use the architecture vocabulary from [glossary](../glossary.md) and the [LANGUAGE.md](../../.agents/skills/improve-codebase-architecture/LANGUAGE.md) **exactly**: *module / interface / implementation / adapter / depth / seam / leverage / locality*. Don't drift into *component / service / API / boundary*.

## After writing

1. Add the ADR to the index in [`docs/README.md`](../README.md).
2. Run `node scripts/docs/check-index.js` and `node scripts/docs/check-links.js` — both must pass.
3. Link to the ADR from the docs whose claim it backs (architecture, frontend/, backend/, runbooks/, …). One backlink per dependent doc is enough.
4. Commit on a feature branch and open a PR. Use the PR description to explain why the ADR was needed *now* — the ADR itself describes the decision, not the meta.

## Superseding an existing ADR

- Don't edit the original. Mark its status `Superseded by ADR-NNNN`.
- Write the new ADR; in its `Context`, link back to the one it supersedes and summarise what changed.
- Update both index entries.

## Don't

- Don't duplicate prose between the ADR and a doc page. The ADR is the authoritative record; the doc page can summarise and link.
- Don't number the template.
- Don't ADR-ify a refactor that hasn't shipped. ADRs are about decisions whose consequences are already in tree.
