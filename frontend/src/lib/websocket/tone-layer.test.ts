import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the one rule the tone system depends on: colour is defined in exactly
 * one place.
 *
 * The panel's recurring styling bugs — a violet outline where a fill belonged,
 * two chips of different widths showing the same kind of message, a value bold
 * in one widget and not in another — all came from widgets each keeping their
 * own copy of the status palette. `globals.css` now owns it; module
 * stylesheets own geometry and opt in with `data-tone-surface`.
 *
 * `data-state` is untouched by this: it means something else entirely (a write
 * in flight, a dropdown open) and is not a status colour.
 */
const SRC = join(__dirname, '..', '..')

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return cssFiles(path)
    return e.isFile() && e.name.endsWith('.module.css') ? [path] : []
  })
}

/** Comments are prose about the tone layer, not rules against it. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('tone layer', () => {
  it('is the only place that defines what a tone looks like', () => {
    const offenders = cssFiles(SRC)
      .filter((file) =>
        /\[data-tone[\]=]/.test(stripComments(readFileSync(file, 'utf8'))),
      )
      .map((file) => file.slice(SRC.length + 1))

    expect(
      offenders,
      'These module stylesheets style a tone themselves. Tone colours belong ' +
        'in the tone layer in app/globals.css; a module stylesheet opts in ' +
        'with data-tone-surface="chip|cell" and defines geometry only.',
    ).toEqual([])
  })

  it('defines every tone a widget can ask for', () => {
    const globals = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8')
    const tones = [
      'positive-important',
      'negative-important',
      'positive-neutral',
      'negative-neutral',
      'warning',
      'error',
      'invalid',
      'unknown',
    ]
    for (const tone of tones) {
      expect(globals, `no tone layer rule for '${tone}'`).toContain(
        `[data-tone='${tone}']`,
      )
    }
    // Both surfaces, and the neutral default they share.
    expect(globals).toContain("[data-tone-surface='chip']")
    expect(globals).toContain("[data-tone-surface='cell']")
  })
})
