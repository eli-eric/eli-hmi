'use client'

import { TestComp } from '../ws-components/test'

export default function P3ControlsPage() {
  return (
    <div>
      <h1>P3 Controls</h1>
      <p>Control panel for P3</p>
      <TestComp pvname="AI1" />
    </div>
  )
}
