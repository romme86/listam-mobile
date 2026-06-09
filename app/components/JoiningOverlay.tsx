import React, { useMemo } from 'react'
import { View, Text, Modal, TouchableOpacity, ActivityIndicator } from 'react-native'
import { makeJoiningStyles } from './_styles'
import { useTheme } from '../theme'
import { useI18n } from '../i18n'
import type { JoinPhase } from '../hooks/_useWorklet'

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
    onCancel: () => void
}

export function JoiningOverlay({
    visible,
    currentMessageIndex,
    joinPhase,
    onCancel,
}: JoiningOverlayProps) {
    const t = useTheme()
    const i18n = useI18n()
    const joiningStyles = useMemo(() => makeJoiningStyles(t), [t])

    const phaseKey = joinPhase || 'pairing'
    const title = i18n.t(PHASE_TITLE_KEYS[phaseKey] || 'joining.phase.default.title')
    const subtitle = i18n.t(PHASE_SUBTITLE_KEYS[phaseKey] || 'joining.phase.default.subtitle')

    // Show phase progress dots
    const phases = ['pairing', 'permission', 'syncing']
    const currentPhaseIndex = phases.indexOf(phaseKey)

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
        >
            <View style={joiningStyles.overlay}>
                <View style={joiningStyles.content}>
                    <ActivityIndicator size="large" color={t.colors.accent} />
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
