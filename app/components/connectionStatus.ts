import type { I18n } from '@listam/i18n'
import type { Theme } from '../theme'
import type { NetworkStatus } from '../store/syncSlice'

export type ConnectionStatusInput = {
    networkStatus: NetworkStatus
    isWorkletReady: boolean
    isJoining?: boolean
    peerCount: number
}

export type ConnectionStatusView = {
    label: string
    color: string
    /** true only while connecting — the dot pulses to signal "in progress". */
    blinking: boolean
}

/**
 * Single source of truth for the header readiness dot, shared by Header and
 * ListsMenu so the two can't drift. Maps the backend-reported network state to
 * the three user-facing states:
 *   green  "Ready"/"Synced" — worklet ready and on the p2p network
 *   grey blinking "Connecting…" — worklet/DHT still coming up, or a join is running
 *   grey "No connection" — DHT unreachable; changes stay local until reconnect
 */
export function deriveConnectionStatus(
    { networkStatus, isWorkletReady, isJoining, peerCount }: ConnectionStatusInput,
    t: Theme,
    i18n: Pick<I18n, 't'>,
): ConnectionStatusView {
    if (!isWorkletReady || isJoining || networkStatus === 'connecting') {
        return { label: i18n.t('header.status.connecting'), color: t.colors.textTertiary, blinking: true }
    }
    if (networkStatus === 'offline') {
        return { label: i18n.t('header.status.noConnection'), color: t.colors.textTertiary, blinking: false }
    }
    if (peerCount > 0) {
        return { label: i18n.t('header.status.synced', { count: peerCount }), color: t.colors.success, blinking: false }
    }
    return { label: i18n.t('header.status.online'), color: t.colors.success, blinking: false }
}
