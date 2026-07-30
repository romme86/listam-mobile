import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'
import { RPC_SET_BACKUP_PASSWORD } from '@listam/protocol'
import { submitInitialBackupPassword } from '../backup-password-setup'
import { useI18n } from '../i18n'
import { useTheme } from '../theme'
import { makeDialogStyles } from './_styles'

type SendReply = (command: number, payload?: string) => Promise<string | null>

type BackupPasswordDialogProps = {
    visible: boolean
    reason: 'startup' | 'join'
    sendRPCWithReply: SendReply
    onSaved: () => void
    onCancel: () => void
}

export function BackupPasswordDialog({
    visible,
    reason,
    sendRPCWithReply,
    onSaved,
    onCancel,
}: BackupPasswordDialogProps) {
    const t = useTheme()
    const i18n = useI18n()
    const dialogStyles = useMemo(() => makeDialogStyles(t), [t])
    const styles = useMemo(() => StyleSheet.create({
        input: {
            minHeight: 48,
            paddingVertical: t.spacing.sm,
            textAlignVertical: 'center',
            marginBottom: t.spacing.md,
        },
        error: {
            color: t.colors.danger,
            fontSize: t.type.caption.fontSize,
            marginBottom: t.spacing.md,
        },
        disabled: { opacity: 0.6 },
    }), [t])
    const [password, setPassword] = useState('')
    const [confirmation, setConfirmation] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const busyRef = useRef(false)
    const confirmationRef = useRef<TextInput>(null)

    const clear = () => {
        setPassword('')
        setConfirmation('')
        setError(null)
        setBusy(false)
        busyRef.current = false
    }

    useEffect(() => {
        if (visible) clear()
    }, [visible])

    const cancel = () => {
        if (busyRef.current) return
        clear()
        onCancel()
    }

    const submit = async () => {
        if (busyRef.current) return
        busyRef.current = true
        setBusy(true)
        setError(null)

        const result = await submitInitialBackupPassword(
            password,
            confirmation,
            (payload) => sendRPCWithReply(RPC_SET_BACKUP_PASSWORD, payload),
        )

        if (!result.ok) {
            setError(i18n.t(
                result.reason === 'too-short'
                    ? 'backup.password.tooShort'
                    : result.reason === 'mismatch'
                        ? 'backup.password.mismatch'
                        : 'backup.error.generic',
            ))
            setBusy(false)
            busyRef.current = false
            return
        }

        clear()
        onSaved()
    }

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={cancel}
        >
            <View style={dialogStyles.overlay}>
                <View style={dialogStyles.dialog}>
                    <Text style={dialogStyles.title}>{i18n.t('backup.auto.setPassword')}</Text>
                    <Text style={dialogStyles.subtitle}>
                        {i18n.t(reason === 'join' ? 'backup.auto.joinNeedsPassword' : 'backup.auto.required')}
                    </Text>

                    <TextInput
                        style={[dialogStyles.input, styles.input]}
                        value={password}
                        onChangeText={(value) => { setPassword(value); setError(null) }}
                        placeholder={i18n.t('backup.password.placeholder')}
                        placeholderTextColor={t.colors.placeholder}
                        secureTextEntry={true}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoFocus={true}
                        returnKeyType="next"
                        onSubmitEditing={() => confirmationRef.current?.focus()}
                        editable={!busy}
                    />
                    <TextInput
                        ref={confirmationRef}
                        style={[dialogStyles.input, styles.input]}
                        value={confirmation}
                        onChangeText={(value) => { setConfirmation(value); setError(null) }}
                        placeholder={i18n.t('backup.password.confirm')}
                        placeholderTextColor={t.colors.placeholder}
                        secureTextEntry={true}
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={() => { void submit() }}
                        editable={!busy}
                    />
                    {error ? <Text style={styles.error}>{error}</Text> : null}

                    <View style={dialogStyles.buttonContainer}>
                        <TouchableOpacity
                            style={[dialogStyles.button, dialogStyles.cancelButton, busy && styles.disabled]}
                            onPress={cancel}
                            disabled={busy}
                            accessibilityRole="button"
                        >
                            <Text style={dialogStyles.cancelButtonText}>{i18n.t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[dialogStyles.button, dialogStyles.submitButton, busy && styles.disabled]}
                            onPress={() => { void submit() }}
                            disabled={busy}
                            accessibilityRole="button"
                        >
                            {busy
                                ? <ActivityIndicator color={t.colors.onPrimary} />
                                : <Text style={dialogStyles.submitButtonText}>{i18n.t('common.save')}</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    )
}
