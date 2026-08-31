import type { SeverityTone } from '@/lib/websocket/severity'
import type { DetailListItemState } from '@/components/hmi/controls/DetailList'

/**
 * Maps a `SeverityTone` (never `'none'`) onto the matching `DetailListItem`
 * state. Kept separate from `severityTone` itself because `DetailListItemState`
 * abbreviates 'error' as 'err' — a per-component vocabulary quirk, not part
 * of the EPICS mapping.
 */
export function severityToDetailState(
  tone: Exclude<SeverityTone, 'none'>,
): DetailListItemState {
  return tone === 'error' ? 'err' : tone
}
