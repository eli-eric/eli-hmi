export interface Attempt {
  attempt: number
  lastAttempt: Date | null
  nextAttempt: number | null
}
