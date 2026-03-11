import React from 'react'
import { View, Text, Modal, TouchableOpacity, ActivityIndicator } from 'react-native'
import { joiningStyles } from './_styles'
import type { JoinPhase } from '../hooks/_useWorklet'

const P2P_MESSAGES = [
    "Connecting to the decentralized network...",
    "No servers, no middlemen - just you and your peers",
    "P2P means your data stays yours, always",
    "Building encrypted tunnels between devices...",
    "Syncing directly - no cloud required",
    "Your list, your network, your rules",
    "Peer-to-peer: the way the internet was meant to be",
    "End-to-end encrypted, naturally",
]

const PHASE_TITLES: Record<string, string> = {
    pairing: 'Pairing...',
    permission: 'Getting permission...',
    syncing: 'Syncing...',
}

const PHASE_SUBTITLES: Record<string, string> = {
    pairing: 'Establishing a secure connection with the host.',
    permission: 'Waiting for write access from the host.',
    syncing: 'Connecting to the peer network for live updates.',
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
    const phaseKey = joinPhase || 'pairing'
    const title = PHASE_TITLES[phaseKey] || 'Connecting to peer...'
    const subtitle = PHASE_SUBTITLES[phaseKey] || 'Please keep the app open while we establish a secure connection.'

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
                    <ActivityIndicator size="large" color="#333" />
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
                        {P2P_MESSAGES[currentMessageIndex]}
                    </Text>
                    <TouchableOpacity
                        style={joiningStyles.cancelButton}
                        onPress={onCancel}
                    >
                        <Text style={joiningStyles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    )
}

export { P2P_MESSAGES }
