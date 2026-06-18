import React, { useState } from 'react'
import {
    Modal, View, Text, TextInput, TouchableOpacity, Share, StyleSheet, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system/legacy'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'
import { RPC_EXPORT_DATA, RPC_EXPORT_SEED, RPC_IMPORT } from '@listam/protocol'

type SendReply = (command: number, payload?: string) => Promise<string | null>
type Notify = (message: string, type?: 'info' | 'success' | 'error') => void

type Mode = 'export-data' | 'export-seed' | 'import'
type ModalState = { mode: Mode; fileText?: string; fileKind?: string }

type Props = {
    sendRPCWithReply: SendReply
    notify: Notify
}

function parseReply(reply: string | null): any {
    if (!reply) return null
    try { return JSON.parse(reply) } catch { return null }
}

// Encrypted backup / restore rows for the global settings menu. All crypto and
// data work happens in the backend; this component only collects a password,
// moves the file in/out via the OS share sheet + document picker, and calls RPC.
export function BackupSettings({ sendRPCWithReply, notify }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = makeStyles(t)
    const [modal, setModal] = useState<ModalState | null>(null)
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const errorMessage = (reason?: string | null) => {
        switch (reason) {
            case 'bad-password': return i18n.t('backup.error.badPassword')
            case 'invalid-file': return i18n.t('backup.error.invalidFile')
            case 'seed-incomplete': return i18n.t('backup.error.seedIncomplete')
            case 'not-writable': return i18n.t('backup.error.notWritable')
            default: return i18n.t('backup.error.generic')
        }
    }

    const closeModal = () => {
        setModal(null); setPassword(''); setConfirm(''); setError(null); setBusy(false)
    }

    const openExport = (mode: Exclude<Mode, 'import'>) => {
        setPassword(''); setConfirm(''); setError(null); setModal({ mode })
    }

    const startImport = async () => {
        let DocumentPicker: any
        try {
            // Loaded lazily so the rest of the app still works before the native
            // module is added in a dev-client rebuild.
            DocumentPicker = require('expo-document-picker')
        } catch {
            notify(i18n.t('backup.error.generic'), 'error')
            return
        }
        try {
            const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
            if (res.canceled || !res.assets?.[0]) return
            const fileText = await FileSystem.readAsStringAsync(res.assets[0].uri)
            let fileKind: string | undefined
            try { fileKind = JSON.parse(fileText)?.kind } catch { /* validated on submit */ }
            setPassword(''); setError(null); setModal({ mode: 'import', fileText, fileKind })
        } catch {
            notify(i18n.t('backup.error.generic'), 'error')
        }
    }

    const runExport = async (mode: Mode) => {
        if (password.length < 8) { setError(i18n.t('backup.password.tooShort')); return }
        if (password !== confirm) { setError(i18n.t('backup.password.mismatch')); return }
        setBusy(true); setError(null)
        const reply = await sendRPCWithReply(mode === 'export-seed' ? RPC_EXPORT_SEED : RPC_EXPORT_DATA, JSON.stringify({ password }))
        const res = parseReply(reply)
        if (!res?.ok || !res.file) { setError(errorMessage(res?.reason)); setBusy(false); return }
        closeModal()
        await shareBackupFile(res.kind, res.file)
    }

    const runImport = async (fileText: string) => {
        if (!password) { setError(i18n.t('backup.password.tooShort')); return }
        setBusy(true); setError(null)
        const reply = await sendRPCWithReply(RPC_IMPORT, JSON.stringify({ password, file: fileText }))
        const res = parseReply(reply)
        if (!res?.ok) { setError(errorMessage(res?.reason)); setBusy(false); return }
        closeModal()
        if (res.kind === 'seed') { notify(i18n.t('backup.seedRestored'), 'success'); return }
        if (res.reason === 'not-writable') { notify(i18n.t('backup.error.notWritable'), 'error'); return }
        notify(i18n.t('backup.imported', { count: res.applied?.items ?? 0 }), 'success')
        if (res.applied?.boardConfigSkipped) notify(i18n.t('backup.boardConfigSkipped'), 'info')
    }

    const shareBackupFile = async (kind: string, file: string) => {
        const stamp = new Date().toISOString().slice(0, 10)
        const name = kind === 'seed' ? `listam-seed-${stamp}.listamseed` : `listam-backup-${stamp}.listam`
        const uri = (FileSystem.cacheDirectory || '') + name
        try {
            await FileSystem.writeAsStringAsync(uri, file)
            await Share.share({ url: uri, title: name })
            notify(i18n.t('backup.exported'), 'success')
        } catch {
            notify(i18n.t('backup.error.generic'), 'error')
        } finally {
            try { await FileSystem.deleteAsync(uri, { idempotent: true }) } catch { /* best effort */ }
        }
    }

    const mode = modal?.mode
    const isImport = mode === 'import'
    const isSeedExport = mode === 'export-seed'
    const isSeedRestore = isImport && modal?.fileKind === 'seed'
    const title = isImport ? i18n.t('backup.import') : isSeedExport ? i18n.t('backup.exportSeed') : i18n.t('backup.exportData')
    const submitLabel = isImport ? i18n.t('backup.unlockImport') : i18n.t('backup.encryptExport')
    const submit = () => {
        if (busy) return
        if (isImport && modal?.fileText != null) runImport(modal.fileText)
        else if (mode) runExport(mode)
    }

    return (
        <>
            <Text style={styles.sectionLabel}>{i18n.t('backup.section')}</Text>
            <TouchableOpacity style={styles.actionRow} onPress={() => openExport('export-data')} activeOpacity={0.6}>
                <Ionicons name="download-outline" size={20} color={t.colors.text} />
                <Text style={styles.actionLabel}>{i18n.t('backup.exportData')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionRow} onPress={startImport} activeOpacity={0.6}>
                <Ionicons name="cloud-upload-outline" size={20} color={t.colors.text} />
                <Text style={styles.actionLabel}>{i18n.t('backup.import')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionRow} onPress={() => openExport('export-seed')} activeOpacity={0.6}>
                <Ionicons name="key-outline" size={20} color={t.colors.text} />
                <Text style={styles.actionLabel}>{i18n.t('backup.exportSeed')}</Text>
            </TouchableOpacity>
            <Text style={styles.sectionNote}>{i18n.t('backup.exportSeed.desc')}</Text>

            <Modal visible={modal != null} transparent animationType="fade" onRequestClose={closeModal}>
                <View style={styles.backdrop}>
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>{title}</Text>
                        {(isSeedExport || isSeedRestore) ? (
                            <Text style={styles.warning}>
                                {isSeedRestore ? i18n.t('backup.seed.restoreWarn') : i18n.t('backup.seed.warn')}
                            </Text>
                        ) : null}
                        <Text style={styles.prompt}>
                            {isImport ? i18n.t('backup.password.enter') : i18n.t('backup.password.create')}
                        </Text>
                        <TextInput
                            style={styles.input}
                            secureTextEntry
                            autoCapitalize="none"
                            autoCorrect={false}
                            placeholder={i18n.t('backup.password.placeholder')}
                            placeholderTextColor={t.colors.textSecondary}
                            value={password}
                            onChangeText={(v) => { setPassword(v); setError(null) }}
                        />
                        {!isImport ? (
                            <TextInput
                                style={styles.input}
                                secureTextEntry
                                autoCapitalize="none"
                                autoCorrect={false}
                                placeholder={i18n.t('backup.password.confirm')}
                                placeholderTextColor={t.colors.textSecondary}
                                value={confirm}
                                onChangeText={(v) => { setConfirm(v); setError(null) }}
                            />
                        ) : null}
                        {error ? <Text style={styles.errorText}>{error}</Text> : null}
                        <View style={styles.actions}>
                            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={closeModal} disabled={busy}>
                                <Text style={styles.btnGhostText}>{i18n.t('backup.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.btn, isSeedRestore ? styles.btnDanger : styles.btnPrimary, busy && styles.btnDisabled]}
                                onPress={submit}
                                disabled={busy}
                            >
                                {busy
                                    ? <ActivityIndicator color={isSeedRestore ? '#fff' : t.colors.surface} />
                                    : <Text style={isSeedRestore ? styles.btnDangerText : styles.btnPrimaryText}>{submitLabel}</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        sectionLabel: {
            fontSize: t.type.label.fontSize, fontWeight: t.type.label.fontWeight, color: t.colors.textSecondary,
            textTransform: 'uppercase', letterSpacing: 0.5, marginTop: t.spacing.lg, marginBottom: t.spacing.xs,
        },
        sectionNote: { fontSize: t.type.caption.fontSize, color: t.colors.textSecondary, marginTop: t.spacing.xs, fontStyle: 'italic' },
        actionRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.md, minHeight: 44 },
        actionLabel: { flex: 1, fontSize: t.type.bodyStrong.fontSize, color: t.colors.text },
        backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: t.spacing.xl },
        card: { backgroundColor: t.colors.surface, borderRadius: t.radius.lg, padding: t.spacing.xl, gap: t.spacing.md },
        cardTitle: { fontSize: t.type.title.fontSize, fontWeight: t.type.title.fontWeight, color: t.colors.text },
        warning: {
            fontSize: t.type.body.fontSize, color: t.colors.danger, backgroundColor: t.colors.dangerSurface,
            padding: t.spacing.md, borderRadius: t.radius.md,
        },
        prompt: { fontSize: t.type.body.fontSize, color: t.colors.textSecondary },
        input: {
            borderWidth: 1, borderColor: t.colors.border, borderRadius: t.radius.md,
            paddingHorizontal: t.spacing.md, paddingVertical: t.spacing.sm,
            fontSize: t.type.body.fontSize, color: t.colors.text,
        },
        errorText: { fontSize: t.type.caption.fontSize, color: t.colors.danger },
        actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing.sm, marginTop: t.spacing.sm },
        btn: { paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm, borderRadius: t.radius.md, minWidth: 96, alignItems: 'center', justifyContent: 'center' },
        btnGhost: { backgroundColor: 'transparent' },
        btnGhostText: { fontSize: t.type.bodyStrong.fontSize, color: t.colors.textSecondary },
        btnPrimary: { backgroundColor: t.colors.primary },
        btnPrimaryText: { fontSize: t.type.bodyStrong.fontSize, fontWeight: '600', color: t.colors.surface },
        btnDanger: { backgroundColor: t.colors.danger },
        btnDangerText: { fontSize: t.type.bodyStrong.fontSize, fontWeight: '600', color: '#fff' },
        btnDisabled: { opacity: 0.6 },
    })
}
