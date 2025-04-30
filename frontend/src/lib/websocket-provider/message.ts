export interface Message<T = unknown> {
  type: string
  name: string
  value: T
  severity: number
  units?: string
  timestamp: number
  ok: boolean
}
