'use client'
import { TestComp } from '../components/test'

export default function P3ControlsPage() {
  return (
    <div>
      <h1>P3 Controls</h1>
      <p>Control panel for P3</p>
      <TestComp pvname="AI_4" onDataUpdate={() => {}} />
      <TestComp pvname="AI_5" onDataUpdate={() => {}} />
      <TestComp pvname="AI_6" onDataUpdate={() => {}} />
    </div>
  )
}
