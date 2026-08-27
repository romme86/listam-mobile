import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Modal, TouchableOpacity, ActivityIndicator } from 'react-native'
import { makeJoiningStyles } from './_styles'
import { useTheme } from '../theme'
import { useI18n } from '../i18n'
import { joinHintMessageKey } from '../joinDiagnostics'
import type { JoinPhase, JoinProgress } from '../hooks/_useWorklet'

const P2P_MESSAGE_KEYS = [
    'joining.p2p.0',
    'joining.p2p.1',
    'joining.p2p.2',
    'joining.p2p.3',
    'joining.p2p.4',
    'joining.p2p.5',
    'joining.p2p.6',
    'joining.p2p.7',
] as const

const PHASE_TITLE_KEYS: Record<string, typeof P2P_MESSAGE_KEYS[number] | 'joining.phase.pairing.title' | 'joining.phase.permission.title' | 'joining.phase.syncing.title' | 'joining.phase.default.title'> = {
    pairing: 'joining.phase.pairing.title',
    permission: 'joining.phase.permission.title',
    syncing: 'joining.phase.syncing.title',
}

const PHASE_SUBTITLE_KEYS: Record<string, 'joining.phase.pairing.subtitle' | 'joining.phase.permission.subtitle' | 'joining.phase.syncing.subtitle' | 'joining.phase.default.subtitle'> = {
    pairing: 'joining.phase.pairing.subtitle',
    permission: 'joining.phase.permission.subtitle',
    syncing: 'joining.phase.syncing.subtitle',
}

type JoiningOverlayProps = {
    visible: boolean
    currentMessageIndex: number
    joinPhase: JoinPhase
    joinProgress: JoinProgress | null
    onCancel: () => void
}

export function JoiningOverlay({
    visible,
    currentMessageIndex,
    joinPhase,
    joinProgress,
    onCancel,
}: JoiningOverlayProps) {
    const t = useTheme()
    const i18n = useI18n()
    const joiningStyles = useMemo(() => makeJoiningStyles(t), [t])

    // The backend's join-progress heartbeat is the authority on elapsed time,
    // but it only speaks every 10s — a readout that jumped 0 → 10 → 20 would
    // look as frozen as the spinner it replaces. So tick locally every second
    // and let each heartbeat re-anchor the clock.
    const [elapsedMs, setElapsedMs] = useState(0)
    const anchorRef = useRef({ at: 0, elapsedMs: 0 })
    useEffect(() => {
        if (!visible) {
            setElapsedMs(0)
            anchorRef.current = { at: 0, elapsedMs: 0 }
            return
        }
        if (anchorRef.current.at === 0) anchorRef.current = { at: Date.now(), elapsedMs: 0 }
        const tick = () => {
            const anchor = anchorRef.current
            setElapsedMs(anchor.elapsedMs + (Date.now() - anchor.at))
        }
        tick()
        const interval = setInterval(tick, 1000)
        return () => clearInterval(interval)
    }, [visible])

    useEffect(() => {
        if (!visible || !joinProgress) return
        anchorRef.current = { at: Date.now(), elapsedMs: joinProgress.elapsedMs }
        setElapsedMs(joinProgress.elapsedMs)
    }, [visible, joinProgress])

    // No coercion to 'pairing' any more. A single-list join now emits real
    // phases, so the only time we have none is the moment before the first one
    // lands — and claiming "Pairing" there is what made a list join show one
    // unchanging label across two different waits, for up to four minutes.
    const phaseKey = joinPhase ?? ''
    const title = i18n.t(PHASE_TITLE_KEYS[phaseKey] || 'joining.phase.default.title')
    const subtitle = i18n.t(PHASE_SUBTITLE_KEYS[phaseKey] || 'joining.phase.default.subtitle')

    // Show phase progress dots
    const phases = ['pairing', 'permission', 'syncing']
    const currentPhaseIndex = phases.indexOf(phaseKey)

    const hintKey = joinHintMessageKey(elapsedMs, joinProgress?.relayed === true)

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
        >
            <View style={joiningStyles.overlay}>
                <View style={joiningStyles.content}>
                    <ActivityIndicator size="large" color={t.colors.text} />
                    <Text style={joiningStyles.title}>{title}</Text>
                    <View style={joiningStyles.phaseRow}>
                        {phases.map((phase, i) => (
                            <View
                                key={phase}
                                style={[
                                    joiningStyles.phaseDot,
                                    i <= currentPhaseIndex && joiningStyles.phaseDotActive,
                                ]}
                            />
                        ))}
                    </View>
                    <Text style={joiningStyles.subtitle}>{subtitle}</Text>
                    <Text style={joiningStyles.elapsed}>
                        {i18n.t('joining.elapsed', { seconds: Math.floor(elapsedMs / 1000) })}
                    </Text>
                    {hintKey ? <Text style={joiningStyles.hint}>{i18n.t(hintKey)}</Text> : null}
                    <Text style={joiningStyles.p2pMessage}>
                        {i18n.t(P2P_MESSAGE_KEYS[currentMessageIndex] || P2P_MESSAGE_KEYS[0])}
                    </Text>
                    <TouchableOpacity
                        style={joiningStyles.cancelButton}
                        onPress={onCancel}
                        accessibilityRole="button"
                    >
                        <Text style={joiningStyles.cancelButtonText}>{i18n.t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    )
}

export { P2P_MESSAGE_KEYS }
