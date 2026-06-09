import React, { useMemo } from 'react'
import { View, Text, Modal, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native'
import { makeDialogStyles } from './_styles'
import { useTheme } from '../theme'
import { useI18n } from '../i18n'
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
    const i18n = useI18n()
    const d = useMemo(() => makeDialogStyles(t), [t])

    const writers = roster?.writers ?? []
    const canAdminister = roster?.canAdminister ?? false
    const hasOwner = !!roster?.ownerWriterKey

    const confirmRemove = (writerKey: string) => {
        Alert.alert(
            i18n.t('members.confirmRemove.title'),
            i18n.t('members.confirmRemove.message'),
            [
                { text: i18n.t('common.cancel'), style: 'cancel' },
                { text: i18n.t('common.remove'), style: 'destructive', onPress: () => onRemoveMember(writerKey) },
            ],
        )
    }

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={d.overlay}>
                <View style={d.dialog}>
                    <Text style={d.title}>{i18n.t('members.title')}</Text>
                    <Text style={d.subtitle}>
                        {hasOwner
                            ? i18n.t('members.subtitle.shared', { epoch: roster?.currentEpoch ?? 0 })
                            : i18n.t('members.subtitle.none')}
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
                                        {[m.isOwner ? i18n.t('members.role.owner') : null, m.isSelf ? i18n.t('members.role.self') : null]
                                            .filter(Boolean)
                                            .join(' - ') || i18n.t('members.role.member')}
                                    </Text>
                                </View>
                                {canAdminister && !m.isOwner && !m.isSelf ? (
                                    <TouchableOpacity
                                        onPress={() => confirmRemove(m.writerKey)}
                                        accessibilityRole="button"
                                        style={{ paddingHorizontal: 12, paddingVertical: 6 }}
                                    >
                                        <Text style={{ color: t.colors.danger, fontWeight: '600' }}>
                                            {i18n.t('common.remove')}
                                        </Text>
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
                                    {i18n.t('members.recovery.saveOffline')}
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
                                    <Text style={d.submitButtonText}>{i18n.t('members.recovery.saved')}</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity
                                style={[d.button, d.cancelButton, { marginTop: 14 }]}
                                onPress={onRevealRecoveryCode}
                                accessibilityRole="button"
                            >
                                <Text style={d.cancelButtonText}>{i18n.t('members.recovery.show')}</Text>
                            </TouchableOpacity>
                        )
                    ) : hasOwner ? (
                        <View style={{ marginTop: 14 }}>
                            <Text style={d.subtitle}>{i18n.t('members.recovery.lostAccess')}</Text>
                            <TextInput
                                style={d.input}
                                value={recoverCodeInput}
                                onChangeText={setRecoverCodeInput}
                                placeholder={i18n.t('members.recovery.placeholder')}
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
                                <Text style={d.submitButtonText}>{i18n.t('members.recovery.action')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}

                    <View style={[d.buttonContainer, { marginTop: 14 }]}>
                        <TouchableOpacity
                            style={[d.button, d.cancelButton]}
                            onPress={onClose}
                            accessibilityRole="button"
                        >
                            <Text style={d.cancelButtonText}>{i18n.t('common.close')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    )
}
