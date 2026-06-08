import React, { useMemo } from 'react'
import { View, Text, Modal, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native'
import { makeDialogStyles } from './_styles'
import { useTheme } from '../theme'
import type { MembershipRoster } from '../store/devicesSlice'

type MembersDialogProps = {
    visible: boolean
    roster: MembershipRoster | null
    recoveryCode: string | null
    recoverCodeInput: string
    setRecoverCodeInput: (text: string) => void
    onRemoveMember: (writerKey: string) => void
    onRevealRecoveryCode: () => void
    onDismissRecoveryCode: () => void
    onRecoverOwnership: () => void
    onClose: () => void
}

function shortKey(writerKey: string): string {
    if (writerKey.length <= 14) return writerKey
    return `${writerKey.slice(0, 8)}…${writerKey.slice(-4)}`
}

export function MembersDialog({
    visible,
    roster,
    recoveryCode,
    recoverCodeInput,
    setRecoverCodeInput,
    onRemoveMember,
    onRevealRecoveryCode,
    onDismissRecoveryCode,
    onRecoverOwnership,
    onClose,
}: MembersDialogProps) {
    const t = useTheme()
    const d = useMemo(() => makeDialogStyles(t), [t])

    const writers = roster?.writers ?? []
    const canAdminister = roster?.canAdminister ?? false
    const hasOwner = !!roster?.ownerWriterKey

    const confirmRemove = (writerKey: string) => {
        Alert.alert(
            'Remove this member?',
            'Their device will lose access to new changes (the list is re-keyed). This cannot be undone, and they keep any copy they already have.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => onRemoveMember(writerKey) },
            ],
        )
    }

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={d.overlay}>
                <View style={d.dialog}>
                    <Text style={d.title}>Members</Text>
                    <Text style={d.subtitle}>
                        {hasOwner
                            ? `Everyone invited to this list${roster ? ` · epoch ${roster.currentEpoch}` : ''}`
                            : 'No shared members yet'}
                    </Text>

                    <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                        {writers.map((m) => (
                            <View
                                key={m.writerKey}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    paddingVertical: 10,
                                    borderBottomWidth: 1,
                                    borderBottomColor: t.colors.border,
                                }}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: t.colors.text, fontSize: 15, fontVariant: ['tabular-nums'] }}>
                                        {shortKey(m.writerKey)}
                                    </Text>
                                    <Text style={{ color: t.colors.placeholder, fontSize: 12, marginTop: 2 }}>
                                        {[m.isOwner ? 'Owner' : null, m.isSelf ? 'This device' : null]
                                            .filter(Boolean)
                                            .join(' · ') || 'Member'}
                                    </Text>
                                </View>
                                {canAdminister && !m.isOwner && !m.isSelf ? (
                                    <TouchableOpacity
                                        onPress={() => confirmRemove(m.writerKey)}
                                        accessibilityRole="button"
                                        style={{ paddingHorizontal: 12, paddingVertical: 6 }}
                                    >
                                        <Text style={{ color: t.colors.danger, fontWeight: '600' }}>Remove</Text>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        ))}
                    </ScrollView>

                    {/* Owner recovery: reveal a backup code (owner) or restore ownership (other device). */}
                    {canAdminister ? (
                        recoveryCode ? (
                            <View style={{ marginTop: 14 }}>
                                <Text style={d.subtitle}>
                                    Save this recovery code offline. Anyone with it can administer this list — treat it like a password.
                                </Text>
                                <Text
                                    selectable
                                    style={{
                                        color: t.colors.text,
                                        fontSize: 13,
                                        marginTop: 8,
                                        padding: 10,
                                        borderRadius: 8,
                                        backgroundColor: t.colors.surface,
                                        borderWidth: 1,
                                        borderColor: t.colors.border,
                                    }}
                                >
                                    {recoveryCode}
                                </Text>
                                <TouchableOpacity
                                    style={[d.button, d.submitButton, { marginTop: 10 }]}
                                    onPress={onDismissRecoveryCode}
                                    accessibilityRole="button"
                                >
                                    <Text style={d.submitButtonText}>I’ve saved it</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity
                                style={[d.button, d.cancelButton, { marginTop: 14 }]}
                                onPress={onRevealRecoveryCode}
                                accessibilityRole="button"
                            >
                                <Text style={d.cancelButtonText}>Show owner recovery code</Text>
                            </TouchableOpacity>
                        )
                    ) : hasOwner ? (
                        <View style={{ marginTop: 14 }}>
                            <Text style={d.subtitle}>Lost owner access on this device? Enter your recovery code to restore it.</Text>
                            <TextInput
                                style={d.input}
                                value={recoverCodeInput}
                                onChangeText={setRecoverCodeInput}
                                placeholder="Paste recovery code…"
                                placeholderTextColor={t.colors.placeholder}
                                autoCapitalize="none"
                                autoCorrect={false}
                                multiline
                            />
                            <TouchableOpacity
                                style={[d.button, d.submitButton, { marginTop: 10 }]}
                                onPress={onRecoverOwnership}
                                accessibilityRole="button"
                            >
                                <Text style={d.submitButtonText}>Recover ownership</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}

                    <View style={[d.buttonContainer, { marginTop: 14 }]}>
                        <TouchableOpacity
                            style={[d.button, d.cancelButton]}
                            onPress={onClose}
                            accessibilityRole="button"
                        >
                            <Text style={d.cancelButtonText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    )
}
