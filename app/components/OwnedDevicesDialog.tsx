import React, { useMemo, useState } from 'react'
import { View, Text, Modal, TextInput, TouchableOpacity, ScrollView } from 'react-native'
import { makeDialogStyles } from './_styles'
import { useTheme } from '../theme'
import { useI18n } from '../i18n'
import type { OwnerControlState } from '../hooks/_useWorklet'

type OwnedDevicesDialogProps = {
    visible: boolean
    ownerControl: OwnerControlState
    onPair: (code: string, name: string) => void
    onCheckStatus: (serverPublicKeyHex: string) => void
    onClose: () => void
}

// The mobile owner-control surface (Phase 15): pair this phone with the user's
// headless instances via an operator-minted code, then send signed,
// capability-scoped commands. The signing, replay protection, and capability
// enforcement all live in the worklet's @listam/owner-control client; this is
// the thin RN chrome over it.
export function OwnedDevicesDialog({
    visible,
    ownerControl,
    onPair,
    onCheckStatus,
    onClose,
}: OwnedDevicesDialogProps) {
    const t = useTheme()
    const i18n = useI18n()
    const dialogStyles = useMemo(() => makeDialogStyles(t), [t])
    const [code, setCode] = useState('')
    const [name, setName] = useState('')

    const submitPair = () => {
        if (!code.trim()) return
        onPair(code.trim(), name.trim())
        setCode('')
        setName('')
    }

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View style={dialogStyles.overlay}>
                <View style={dialogStyles.dialog}>
                    <Text style={dialogStyles.title}>{i18n.t('control.section')}</Text>

                    <ScrollView style={{ maxHeight: 280 }}>
                        {ownerControl.servers.length === 0 ? (
                            <Text style={dialogStyles.subtitle}>{i18n.t('control.empty')}</Text>
                        ) : (
                            ownerControl.servers.map((server) => (
                                <View key={server.serverPublicKeyHex} style={{ marginBottom: 12 }}>
                                    <Text style={[dialogStyles.subtitle, { color: t.colors.text }]}>{server.name}</Text>
                                    <Text style={dialogStyles.subtitle}>{server.capabilities.join(', ') || '—'}</Text>
                                    <TouchableOpacity
                                        style={[dialogStyles.button, dialogStyles.submitButton, { alignSelf: 'flex-start', marginTop: 6 }]}
                                        onPress={() => onCheckStatus(server.serverPublicKeyHex)}
                                        accessibilityRole="button"
                                    >
                                        <Text style={dialogStyles.submitButtonText}>{i18n.t('control.checkStatus')}</Text>
                                    </TouchableOpacity>
                                </View>
                            ))
                        )}

                        {ownerControl.lastResult?.result ? (
                            <Text style={dialogStyles.subtitle}>
                                {JSON.stringify(ownerControl.lastResult.result?.status ?? ownerControl.lastResult.result)}
                            </Text>
                        ) : null}
                    </ScrollView>

                    <Text style={[dialogStyles.subtitle, { marginTop: 12, color: t.colors.text }]}>
                        {i18n.t('control.pairAction')}
                    </Text>
                    <TextInput
                        style={dialogStyles.input}
                        value={code}
                        onChangeText={setCode}
                        placeholder={i18n.t('control.codePlaceholder')}
                        placeholderTextColor={t.colors.placeholder}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <TextInput
                        style={dialogStyles.input}
                        value={name}
                        onChangeText={setName}
                        placeholder={i18n.t('control.namePlaceholder')}
                        placeholderTextColor={t.colors.placeholder}
                    />

                    <View style={dialogStyles.buttonContainer}>
                        <TouchableOpacity
                            style={[dialogStyles.button, dialogStyles.cancelButton]}
                            onPress={onClose}
                            accessibilityRole="button"
                        >
                            <Text style={dialogStyles.cancelButtonText}>{i18n.t('common.close')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[dialogStyles.button, dialogStyles.submitButton]}
                            onPress={submitPair}
                            accessibilityRole="button"
                        >
                            <Text style={dialogStyles.submitButtonText}>{i18n.t('control.pair')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    )
}
