import React, { useState, useEffect, useCallback } from 'react'
import {
    Modal, View, Text, TextInput, TouchableOpacity, Share, StyleSheet, ActivityIndicator, Switch,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system/legacy'
import { useTheme, type Theme } from '../theme'
import { useI18n, type MessageKey } from '../i18n'
import {
    RPC_EXPORT_DATA, RPC_EXPORT_SEED, RPC_IMPORT,
    RPC_LIST_BACKUPS, RPC_RESTORE_BACKUP, RPC_SET_BACKUP_PASSWORD,
    RPC_SET_BACKUP_SCHEDULE,
} from '@listam/protocol'

type SendReply = (command: number, payload?: string) => Promise<string | null>
type Notify = (message: string, type?: 'info' | 'success' | 'error') => void

// 'set-password' covers both setting (first time) and changing (asks for the
// current password too). 'restore' asks only for the password to open the file.
type Mode = 'export-data' | 'export-seed' | 'import' | 'set-password' | 'restore'
type ModalState = { mode: Mode; fileText?: string; fileKind?: string; file?: string }
type AutoBackup = { file: string; createdAt: number }

// The rolling-backup schedule mirrored from RPC_LIST_BACKUPS. The backend owns
// the cadences and the persisted enabled flag; this is the render source of truth.
type ScheduleTier = { reason: string; label: string; intervalMs: number; lastAt: number | null }
type BackupSchedule = { enabled: boolean; passwordSet: boolean; tiers: ScheduleTier[] }

// Localized label per fixed cadence (the backend's English `label` is ignored in
// favour of these so the row reads in the user's locale).
const TIER_LABEL_KEY: Record<string, MessageKey> = {
    'scheduled-15m': 'backup.schedule.tier.15m',
    'scheduled-1d': 'backup.schedule.tier.1d',
    'scheduled-1w': 'backup.schedule.tier.1w',
}

type Props = {
    sendRPCWithReply: SendReply
    notify: Notify
}

function parseReply(reply: string | null): any {
    if (!reply) return null
    try { return JSON.parse(reply) } catch { return null }
}

// Compact elapsed-time string for the "{time} ago" tier label (e.g. "5m", "2h",
// "3d"). Kept locale-neutral on purpose — only the surrounding sentence ("Last
// backup: … ago") is translated.
function elapsedShort(sinceMs: number): string {
    const secs = Math.max(0, Math.round((Date.now() - sinceMs) / 1000))
    if (secs < 60) return `${secs}s`
    const mins = Math.round(secs / 60)
    if (mins < 60) return `${mins}m`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.round(hours / 24)
    return `${days}d`
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
    const [current, setCurrent] = useState('')
    const [confirm, setConfirm] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    // Automatic pre-join backups: whether a backup password is set, and the list.
    const [passwordSet, setPasswordSet] = useState<boolean | null>(null)
    const [autoBackups, setAutoBackups] = useState<AutoBackup[]>([])
    // The rolling-backup schedule, mirrored from RPC_LIST_BACKUPS (backend is the
    // source of truth). null until the first load.
    const [schedule, setSchedule] = useState<BackupSchedule | null>(null)
    const [scheduleBusy, setScheduleBusy] = useState(false)

    const loadBackups = useCallback(async () => {
        const res = parseReply(await sendRPCWithReply(RPC_LIST_BACKUPS))
        if (res?.ok) {
            setPasswordSet(!!res.passwordSet)
            setAutoBackups(Array.isArray(res.backups) ? res.backups : [])
            const s = res.schedule
            if (s && typeof s === 'object') {
                setSchedule({
                    enabled: !!s.enabled,
                    passwordSet: !!s.passwordSet,
                    tiers: Array.isArray(s.tiers) ? (s.tiers as ScheduleTier[]) : [],
                })
            }
        }
    }, [sendRPCWithReply])

    // Toggle the whole rolling schedule on/off. The backend persists the choice
    // (device-local) and (re)starts/stops its scheduler; we re-read to reflect it.
    const setScheduleEnabled = useCallback(async (enabled: boolean) => {
        // Optimistic flip so the Switch tracks the press; loadBackups reconciles.
        setSchedule((prev) => (prev ? { ...prev, enabled } : prev))
        setScheduleBusy(true)
        await sendRPCWithReply(RPC_SET_BACKUP_SCHEDULE, JSON.stringify({ enabled }))
        await loadBackups()
        setScheduleBusy(false)
    }, [sendRPCWithReply, loadBackups])

    useEffect(() => { void loadBackups() }, [loadBackups])

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
        setModal(null); setPassword(''); setCurrent(''); setConfirm(''); setError(null); setBusy(false)
    }

    const openExport = (mode: 'export-data' | 'export-seed') => {
        setPassword(''); setConfirm(''); setCurrent(''); setError(null); setModal({ mode })
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

    // Set OR change the backup password. When changing, the current password is
    // also required (the backend verifies it and re-encrypts existing backups).
    const runSetPassword = async () => {
        if (password.length < 8) { setError(i18n.t('backup.password.tooShort')); return }
        if (password !== confirm) { setError(i18n.t('backup.password.mismatch')); return }
        setBusy(true); setError(null)
        const payload: Record<string, string> = { next: password }
        if (passwordSet) payload.current = current
        const reply = await sendRPCWithReply(RPC_SET_BACKUP_PASSWORD, JSON.stringify(payload))
        const res = parseReply(reply)
        if (!res?.ok) { setError(errorMessage(res?.reason)); setBusy(false); return }
        closeModal()
        notify(i18n.t('backup.auto.passwordSaved'), 'success')
        await loadBackups()
    }

    const runRestore = async (file: string) => {
        if (!password) { setError(i18n.t('backup.password.tooShort')); return }
        setBusy(true); setError(null)
        const reply = await sendRPCWithReply(RPC_RESTORE_BACKUP, JSON.stringify({ file, password }))
        const res = parseReply(reply)
        if (!res?.ok) { setError(errorMessage(res?.reason)); setBusy(false); return }
        closeModal()
        notify(i18n.t('backup.auto.restored', { count: res.applied?.items ?? 0 }), 'success')
        if (res.applied?.boardConfigSkipped) notify(i18n.t('backup.boardConfigSkipped'), 'info')
        await loadBackups()
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
    const isRestore = mode === 'restore'
    const isSetPassword = mode === 'set-password'
    const isSeedExport = mode === 'export-seed'
    const isSeedRestore = isImport && modal?.fileKind === 'seed'
    // Whichever modes create/confirm a password show the confirm field.
    const needsConfirm = isSetPassword || (!isImport && !isRestore)
    // Only a password CHANGE needs the current password.
    const needsCurrent = isSetPassword && passwordSet === true
    // Single-field password entry: import + restore.
    const passwordOnly = isImport || isRestore

    const title = isRestore ? i18n.t('backup.auto.restore')
        : isSetPassword ? (passwordSet ? i18n.t('backup.auto.changePassword') : i18n.t('backup.auto.setPassword'))
            : isImport ? i18n.t('backup.import')
                : isSeedExport ? i18n.t('backup.exportSeed') : i18n.t('backup.exportData')
    const submitLabel = isSetPassword ? i18n.t('common.save')
        : (isImport || isRestore) ? i18n.t('backup.unlockImport')
            : i18n.t('backup.encryptExport')
    const promptText = isRestore ? i18n.t('backup.auto.required')
        : isSetPassword ? i18n.t('backup.password.create')
            : passwordOnly ? i18n.t('backup.password.enter') : i18n.t('backup.password.create')

    const submit = () => {
        if (busy) return
        if (isRestore && modal?.file) runRestore(modal.file)
        else if (isSetPassword) runSetPassword()
        else if (isImport && modal?.fileText != null) runImport(modal.fileText)
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

            {/* Automatic pre-join backups */}
            <Text style={styles.sectionLabel}>{i18n.t('backup.auto.section')}</Text>
            <Text style={styles.sectionNote}>{i18n.t('backup.auto.desc')}</Text>
            <TouchableOpacity
                style={styles.actionRow}
                onPress={() => { setPassword(''); setConfirm(''); setCurrent(''); setError(null); setModal({ mode: 'set-password' }) }}
                activeOpacity={0.6}
            >
                <Ionicons name="lock-closed-outline" size={20} color={t.colors.text} />
                <Text style={styles.actionLabel}>
                    {passwordSet ? i18n.t('backup.auto.changePassword') : i18n.t('backup.auto.setPassword')}
                </Text>
            </TouchableOpacity>
            {passwordSet === false ? (
                <Text style={styles.sectionNote}>{i18n.t('backup.auto.required')}</Text>
            ) : autoBackups.length === 0 ? (
                <Text style={styles.sectionNote}>{i18n.t('backup.auto.empty')}</Text>
            ) : (
                autoBackups.map((b) => (
                    <View key={b.file} style={styles.actionRow}>
                        <Ionicons name="time-outline" size={20} color={t.colors.textSecondary} />
                        <Text style={styles.backupDate} numberOfLines={1}>
                            {new Date(b.createdAt).toLocaleString()}
                        </Text>
                        <TouchableOpacity
                            onPress={() => { setPassword(''); setError(null); setModal({ mode: 'restore', file: b.file }) }}
                            activeOpacity={0.6}
                            accessibilityRole="button"
                        >
                            <Text style={styles.restoreLink}>{i18n.t('backup.auto.restore')}</Text>
                        </TouchableOpacity>
                    </View>
                ))
            )}

            {/* Scheduled (rolling) backups: three fixed cadences, on/off toggle.
                Encryption reuses the same backup password, so this is gated on a
                password being set, exactly like the pre-join auto-backups above. */}
            <Text style={styles.sectionLabel}>{i18n.t('backup.schedule.section')}</Text>
            <Text style={styles.sectionNote}>{i18n.t('backup.schedule.desc')}</Text>
            {passwordSet === false ? (
                <Text style={styles.sectionNote}>{i18n.t('backup.schedule.required')}</Text>
            ) : (
                <>
                    <View style={styles.switchRow}>
                        <Ionicons name="repeat-outline" size={20} color={t.colors.text} />
                        <Text style={styles.switchLabel}>{i18n.t('backup.schedule.section')}</Text>
                        <Switch
                            value={!!schedule?.enabled}
                            onValueChange={(v) => { void setScheduleEnabled(v) }}
                            disabled={scheduleBusy || schedule == null}
                            trackColor={{ false: t.colors.border, true: t.colors.primary }}
                            thumbColor={t.colors.surface}
                        />
                    </View>
                    {(schedule?.tiers ?? []).map((tier) => {
                        const labelKey = TIER_LABEL_KEY[tier.reason]
                        return (
                            <View key={tier.reason} style={styles.actionRow}>
                                <Ionicons name="time-outline" size={20} color={t.colors.textSecondary} />
                                <View style={styles.tierText}>
                                    <Text style={styles.tierLabel} numberOfLines={1}>
                                        {labelKey ? i18n.t(labelKey) : tier.label}
                                    </Text>
                                    <Text style={styles.tierStatus} numberOfLines={1}>
                                        {tier.lastAt
                                            ? i18n.t('backup.schedule.tier.last', { time: elapsedShort(tier.lastAt) })
                                            : i18n.t('backup.schedule.tier.never')}
                                    </Text>
                                </View>
                            </View>
                        )
                    })}
                </>
            )}

            <Modal visible={modal != null} transparent animationType="fade" onRequestClose={closeModal}>
                <View style={styles.backdrop}>
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>{title}</Text>
                        {(isSeedExport || isSeedRestore) ? (
                            <Text style={styles.warning}>
                                {isSeedRestore ? i18n.t('backup.seed.restoreWarn') : i18n.t('backup.seed.warn')}
                            </Text>
                        ) : null}
                        <Text style={styles.prompt}>{promptText}</Text>
                        {needsCurrent ? (
                            <TextInput
                                style={styles.input}
                                secureTextEntry
                                autoCapitalize="none"
                                autoCorrect={false}
                                placeholder={i18n.t('backup.auto.currentPassword')}
                                placeholderTextColor={t.colors.textSecondary}
                                value={current}
                                onChangeText={(v) => { setCurrent(v); setError(null) }}
                            />
                        ) : null}
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
                        {needsConfirm ? (
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
        backupDate: { flex: 1, fontSize: t.type.body.fontSize, color: t.colors.text },
        restoreLink: { fontSize: t.type.bodyStrong.fontSize, fontWeight: '600', color: t.colors.primary },
        switchRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.sm, minHeight: 44 },
        switchLabel: { flex: 1, fontSize: t.type.bodyStrong.fontSize, color: t.colors.text },
        tierText: { flex: 1, gap: 2 },
        tierLabel: { fontSize: t.type.body.fontSize, color: t.colors.text },
        tierStatus: { fontSize: t.type.caption.fontSize, color: t.colors.textSecondary },
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
