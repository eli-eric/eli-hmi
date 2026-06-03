import { describe, it, expect } from 'vitest'
import { CURRENT_L4_OPCPA_LASERS, isCurrentRolloutLaser } from './rollout'

describe('L4 OPCPA rollout', () => {
  it('limits the current rollout to NL2 only', () => {
    // Tripwire: broadening the rollout (e.g. re-enabling all panels) must be a
    // deliberate edit that updates this expectation.
    expect([...CURRENT_L4_OPCPA_LASERS]).toEqual(['NL2'])
  })

  it('matches only lasers in the rollout', () => {
    expect(isCurrentRolloutLaser('NL2')).toBe(true)
    expect(isCurrentRolloutLaser('NL1')).toBe(false)
    expect(isCurrentRolloutLaser('APL')).toBe(false)
  })
})
