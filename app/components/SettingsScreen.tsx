import React, { useMemo, useState } from 'react'
import { Alert, View, Text, ScrollView, Switch, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Clipboard from '@react-native-clipboard/clipboard'
import { useTheme, cardColor, type Theme } from '../theme'
import { useI18n, type LocaleChoice } from '../i18n'
import { MAX_LABEL_NAME } from '@listam/domain'
import type { LoyaltyCardHandle } from '../store/loyaltyCardsSlice'
import {
    THEME_CHOICES,
    type AdvancedMode,
    type FeatureFlags,
    type FeatureKey,
    type ThemeChoice,
} from '../store/preferencesSlice'
import { SegmentedSetting, themeLabelKey } from './SegmentedSetting'
import { BackupSettings } from './BackupSettings'
import { CloseDot } from './CloseDot'

// The ON track is the theme-constant ink-block — the only fill the acid accent
// sits on (Kinetic Minimalist law), identical in light and dark.
const INK_BLOCK = '#1b1b1b'

// The app-level Settings screen (progressive disclosure, 2026-07 restructure).
//
// advancedMode !== 'on' renders the BASIC screen: theme, language, and one
// "Activate advanced options" card. 'on' renders the full sectioned screen —
// Basic / List features / Services / Advanced — where every feature is an
// individual switch and the heavier panes (device identity, data & backups)
// live behind nav rows. Feature gating elsewhere reads the individual flags,
// never advancedMode (see preferencesSlice).
type SubView = 'root' | 'theme' | 'language' | 'identity' | 'data'

type Props = {
    onExit: () => void
    onClose: () => void
    advancedMode: AdvancedMode
    onActivateAdvanced: () => void
    features: FeatureFlags
    onToggleFeature: (feature: FeatureKey) => void
    boardEnabled: boolean
    onToggleBoardEnabled: () => void
    overviewEnabled: boolean
    onToggleOverviewEnabled: () => void
    themeChoice: ThemeChoice
    onThemeChoiceChange: (choice: ThemeChoice) => void
    localeChoice: LocaleChoice
    onLocaleChoiceChange: (choice: LocaleChoice) => void
    deviceName: string
    onDeviceNameChange: (name: string) => void
    selfWriterKey: string | null
    onShareProject: () => void
    onJoin: () => void
    onJoinList: () => void
    onManageMembers: () => void
    onManageOwnedDevices: () => void
    onPairLeaf: () => void
    loyaltyCards: LoyaltyCardHandle[]
    onScanCard: () => void
    onSelectCard: (card: LoyaltyCardHandle) => void
    sendRPCWithReply: (command: number, payload?: string) => Promise<string | null>
    onDeleteLocalData: () => Promise<void>
    notify: (message: string, type?: 'info' | 'success' | 'error') => void
}

export function SettingsScreen(props: Props) {
    const {
        onExit, onClose,
        advancedMode, onActivateAdvanced, features, onToggleFeature,
        boardEnabled, onToggleBoardEnabled, overviewEnabled, onToggleOverviewEnabled,
        themeChoice, onThemeChoiceChange, localeChoice, onLocaleChoiceChange,
        deviceName, onDeviceNameChange, selfWriterKey,
        onShareProject, onJoin, onJoinList,
        onManageMembers, onManageOwnedDevices, onPairLeaf,
        loyaltyCards, onScanCard, onSelectCard,
        sendRPCWithReply, onDeleteLocalData, notify,
    } = props

    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const [subView, setSubView] = useState<SubView>('root')
    const [deletingLocalData, setDeletingLocalData] = useState(false)
    const advancedOn = advancedMode === 'on'

    const subViewTitle: Record<SubView, string> = {
        root: i18n.t('lists.menu.settings'),
        theme: i18n.t('settings.theme'),
        language: i18n.t('settings.language'),
        identity: i18n.t('settings.deviceIdentity'),
        data: i18n.t('settings.dataBackups'),
    }

    const featureSwitch = (value: boolean, onToggle: () => void) => (
        <Switch
            value={value}
            onValueChange={onToggle}
            trackColor={{ false: t.colors.surfaceSunken, true: INK_BLOCK }}
            thumbColor={value ? t.colors.accent : '#ffffff'}
            ios_backgroundColor={t.colors.surfaceSunken}
        />
    )

    const navRow = (
        icon: keyof typeof Ionicons.glyphMap,
        label: string,
        onPress: () => void,
        value?: string,
    ) => (
        <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.6} accessibilityRole="button">
            <Ionicons name={icon} size={20} color={t.colors.text} style={styles.rowIcon} />
            <Text style={styles.rowLabel}>{label}</Text>
            {value ? <Text style={styles.rowValue}>{value}</Text> : null}
            <Ionicons name="chevron-forward" size={18} color={t.colors.textTertiary} />
        </TouchableOpacity>
    )

    const switchRow = (
        icon: keyof typeof Ionicons.glyphMap,
        label: string,
        value: boolean,
        onToggle: () => void,
    ) => (
        <View style={styles.row}>
            <Ionicons name={icon} size={20} color={t.colors.text} style={styles.rowIcon} />
            <Text style={styles.rowLabel}>{label}</Text>
            {featureSwitch(value, onToggle)}
        </View>
    )

    const themeLabel = i18n.t(themeLabelKey(themeChoice))
    const languageLabel = i18n.labelForLocaleChoice(localeChoice)

    const performLocalDataDeletion = async () => {
        if (deletingLocalData) return
        setDeletingLocalData(true)
        try {
            await onDeleteLocalData()
            onClose()
            notify(i18n.t('settings.localData.deleted'), 'success')
        } catch {
            notify(i18n.t('settings.localData.failed'), 'error')
        } finally {
            setDeletingLocalData(false)
        }
    }

    const confirmLocalDataDeletion = () => {
        if (deletingLocalData) return
        Alert.alert(
            i18n.t('settings.localData.confirmTitle'),
            i18n.t('settings.localData.confirmMessage'),
            [
                { text: i18n.t('common.cancel'), style: 'cancel' },
                {
                    text: i18n.t('common.continue'),
                    style: 'destructive',
                    onPress: () => {
                        Alert.alert(
                            i18n.t('settings.localData.finalTitle'),
                            i18n.t('settings.localData.finalMessage'),
                            [
                                { text: i18n.t('common.cancel'), style: 'cancel' },
                                {
                                    text: i18n.t('settings.localData.deleteAction'),
                                    style: 'destructive',
                                    onPress: () => { void performLocalDataDeletion() },
                                },
                            ],
                        )
                    },
                },
            ],
        )
    }

    const localDataDangerSection = (
        <>
            <Text style={styles.sectionLabel}>{i18n.t('settings.localData.section')}</Text>
            <View style={[styles.card, styles.dangerCard]}>
                <TouchableOpacity
                    style={styles.row}
                    onPress={confirmLocalDataDeletion}
                    activeOpacity={0.6}
                    disabled={deletingLocalData}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: deletingLocalData }}
                    accessibilityLabel={i18n.t('settings.localData.deleteAction')}
                >
                    <Ionicons name="trash-outline" size={20} color={t.colors.danger} style={styles.rowIcon} />
                    <Text style={[styles.rowLabel, styles.dangerLabel]}>
                        {i18n.t(deletingLocalData ? 'settings.localData.deleting' : 'settings.localData.deleteAction')}
                    </Text>
                </TouchableOpacity>
            </View>
            <Text style={styles.sectionNote}>{i18n.t('settings.localData.note')}</Text>
        </>
    )

    return (
        <>
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity
                        onPress={() => { if (subView === 'root') onExit(); else setSubView('root') }}
                        hitSlop={10}
                        accessibilityLabel={i18n.t('lists.menu.back')}
                    >
                        <Ionicons name="chevron-back" size={24} color={t.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.title}>{subViewTitle[subView]}</Text>
                    {subView === 'root' && advancedOn ? (
                        <Text style={styles.advancedChip}>{i18n.t('settings.advancedOn')}</Text>
                    ) : null}
                </View>
                <CloseDot onPress={onClose} color={t.colors.text} accessibilityLabel={i18n.t('common.close')} />
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
                {subView === 'theme' ? (
                    <View style={styles.card}>
                        <View style={styles.cardPad}>
                            <SegmentedSetting
                                title={i18n.t('settings.theme')}
                                options={THEME_CHOICES}
                                value={themeChoice}
                                onChange={onThemeChoiceChange}
                                labelFor={(o) => i18n.t(themeLabelKey(o))}
                            />
                        </View>
                    </View>
                ) : subView === 'language' ? (
                    <View style={styles.card}>
                        <View style={styles.cardPad}>
                            <SegmentedSetting
                                title={i18n.t('settings.language')}
                                options={i18n.localeChoices}
                                value={localeChoice}
                                onChange={onLocaleChoiceChange}
                                labelFor={i18n.labelForLocaleChoice}
                            />
                        </View>
                    </View>
                ) : subView === 'identity' ? (
                    <>
                        {/* The name is stored device-local AND published to peers via
                            the synced peer-label channel (@listam/domain/labels), keyed
                            by this device's writer key. */}
                        <Text style={styles.sectionLabel}>{i18n.t('desktop.settings.deviceName.label')}</Text>
                        <TextInput
                            style={styles.nameInput}
                            defaultValue={deviceName}
                            placeholder={i18n.t('desktop.settings.deviceName.placeholder')}
                            placeholderTextColor={t.colors.placeholder}
                            returnKeyType="done"
                            maxLength={MAX_LABEL_NAME}
                            autoCapitalize="words"
                            onEndEditing={(e) => onDeviceNameChange(e.nativeEvent.text)}
                        />
                        <Text style={styles.sectionNote}>{i18n.t('desktop.settings.deviceName.help')}</Text>

                        <Text style={styles.sectionLabel}>{i18n.t('desktop.settings.deviceKey.label')}</Text>
                        {selfWriterKey ? (
                            <View style={styles.deviceKeyRow}>
                                <Text style={styles.deviceKeyValue} selectable numberOfLines={2}>{selfWriterKey}</Text>
                                <TouchableOpacity
                                    onPress={() => { Clipboard.setString(selfWriterKey); notify(i18n.t('desktop.settings.deviceKey.copied'), 'success') }}
                                    hitSlop={8}
                                    accessibilityRole="button"
                                    accessibilityLabel={i18n.t('desktop.peers.copy')}
                                    style={styles.deviceKeyCopy}
                                >
                                    <Ionicons name="copy-outline" size={18} color={t.colors.text} />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <Text style={styles.sectionNote}>{i18n.t('desktop.settings.deviceKey.pending')}</Text>
                        )}
                        <Text style={styles.sectionNote}>{i18n.t('desktop.settings.deviceKey.help')}</Text>
                    </>
                ) : subView === 'data' ? (
                    // Backup — renders its own section headers (export / auto / scheduled).
                    <BackupSettings sendRPCWithReply={sendRPCWithReply} notify={notify} />
                ) : !advancedOn ? (
                    <>
                        {/* BASIC mode: theme + language + the one-tap activation card. */}
                        <View style={styles.card}>
                            <View style={styles.cardPad}>
                                <SegmentedSetting
                                    title={i18n.t('settings.theme')}
                                    options={THEME_CHOICES}
                                    value={themeChoice}
                                    onChange={onThemeChoiceChange}
                                    labelFor={(o) => i18n.t(themeLabelKey(o))}
                                />
                            </View>
                        </View>
                        <View style={styles.card}>
                            {navRow('globe-outline', i18n.t('settings.language'), () => setSubView('language'), languageLabel)}
                        </View>
                        <View style={styles.card}>
                            <View style={styles.cardPad}>
                                <Text style={styles.cardLabel}>{i18n.t('settings.activate.title')}</Text>
                                <Text style={styles.activateBody}>{i18n.t('settings.activate.body')}</Text>
                                <TouchableOpacity
                                    style={styles.activateButton}
                                    onPress={onActivateAdvanced}
                                    accessibilityRole="button"
                                >
                                    <Text style={styles.activateButtonLabel}>{i18n.t('settings.activate.button')}</Text>
                                </TouchableOpacity>
                                <Text style={styles.activateNote}>{i18n.t('settings.activate.note')}</Text>
                            </View>
                        </View>
                        {localDataDangerSection}
                    </>
                ) : (
                    <>
                        <Text style={styles.sectionLabel}>{i18n.t('settings.section.basic')}</Text>
                        <View style={styles.card}>
                            {navRow('brush-outline', i18n.t('settings.theme'), () => setSubView('theme'), themeLabel)}
                            <View style={styles.separator} />
                            {navRow('globe-outline', i18n.t('settings.language'), () => setSubView('language'), languageLabel)}
                        </View>

                        <Text style={styles.sectionLabel}>{i18n.t('settings.section.listFeatures')}</Text>
                        <View style={styles.card}>
                            {switchRow('today-outline', i18n.t('lists.menu.overviewFeature'), overviewEnabled, onToggleOverviewEnabled)}
                            <View style={styles.separator} />
                            {switchRow('checkbox-outline', i18n.t('settings.feature.todo'), features.todo, () => onToggleFeature('todo'))}
                            <View style={styles.separator} />
                            {switchRow('grid-outline', i18n.t('lists.menu.boardFeature'), boardEnabled, onToggleBoardEnabled)}
                            <View style={styles.separator} />
                            {switchRow('list-outline', i18n.t('settings.feature.multiList'), features.multiList, () => onToggleFeature('multiList'))}
                            <View style={styles.separator} />
                            {switchRow('folder-outline', i18n.t('settings.feature.listGroups'), features.listGroups, () => onToggleFeature('listGroups'))}
                        </View>

                        <Text style={styles.sectionLabel}>{i18n.t('settings.section.services')}</Text>
                        <View style={styles.card}>
                            {switchRow('share-social-outline', i18n.t('lists.menu.sectionSharing'), features.sharing, () => onToggleFeature('sharing'))}
                            <View style={styles.separator} />
                            {switchRow('people-outline', i18n.t('lists.menu.sectionNetwork'), features.peersDevices, () => onToggleFeature('peersDevices'))}
                            <View style={styles.separator} />
                            {switchRow('cloud-outline', i18n.t('settings.feature.backups'), features.backups, () => onToggleFeature('backups'))}
                            <View style={styles.separator} />
                            {switchRow('mic-outline', i18n.t('settings.feature.voice'), features.voice, () => onToggleFeature('voice'))}
                            <View style={styles.separator} />
                            {switchRow('card-outline', i18n.t('header.section.loyaltyCards'), features.loyaltyCards, () => onToggleFeature('loyaltyCards'))}
                        </View>

                        {/* Action rows revealed by the service toggles above. */}
                        {features.sharing ? (
                            <>
                                <Text style={styles.sectionLabel}>{i18n.t('lists.menu.sectionSharing')}</Text>
                                <View style={styles.card}>
                                    {navRow('share-social-outline', i18n.t('share.project.button'), () => { onShareProject(); onClose() })}
                                    <View style={styles.separator} />
                                    {navRow('person-add-outline', i18n.t('joinProject.button'), () => { onJoin(); onClose() })}
                                    <View style={styles.separator} />
                                    {navRow('enter-outline', i18n.t('joinList.button'), () => { onJoinList(); onClose() })}
                                </View>
                                <Text style={styles.sectionNote}>{i18n.t('share.project.hint')}</Text>
                            </>
                        ) : null}

                        {features.peersDevices || features.voice ? (
                            <>
                                <Text style={styles.sectionLabel}>{i18n.t('lists.menu.sectionNetwork')}</Text>
                                <View style={styles.card}>
                                    {features.peersDevices ? (
                                        <>
                                            {navRow('people-outline', i18n.t('header.action.membersRecovery'), () => { onManageMembers(); onClose() })}
                                            <View style={styles.separator} />
                                            {navRow('hardware-chip-outline', i18n.t('control.section'), () => { onManageOwnedDevices(); onClose() })}
                                        </>
                                    ) : null}
                                    {features.peersDevices && features.voice ? <View style={styles.separator} /> : null}
                                    {features.voice
                                        ? navRow('bluetooth-outline', i18n.t('leaf.section'), () => { onPairLeaf(); onClose() })
                                        : null}
                                </View>
                            </>
                        ) : null}

                        {features.loyaltyCards ? (
                            <>
                                <Text style={styles.sectionLabel}>{i18n.t('header.section.loyaltyCards')}</Text>
                                <View style={styles.card}>
                                    {navRow('scan-outline', i18n.t('header.action.scanLoyaltyCard'), () => { onScanCard(); onClose() })}
                                    {loyaltyCards.map((card) => (
                                        <React.Fragment key={card.id}>
                                            <View style={styles.separator} />
                                            <TouchableOpacity style={styles.row} onPress={() => { onSelectCard(card); onClose() }} activeOpacity={0.6}>
                                                <View style={[styles.cardSwatch, { backgroundColor: cardColor(card.name) }]}>
                                                    <Ionicons name="card-outline" size={14} color="#fff" />
                                                </View>
                                                <Text style={styles.rowLabel}>{card.name}</Text>
                                            </TouchableOpacity>
                                        </React.Fragment>
                                    ))}
                                </View>
                            </>
                        ) : null}

                        <Text style={styles.sectionLabel}>{i18n.t('settings.section.advanced')}</Text>
                        <View style={styles.card}>
                            {navRow('finger-print-outline', i18n.t('settings.deviceIdentity'), () => setSubView('identity'))}
                            {features.backups ? (
                                <>
                                    <View style={styles.separator} />
                                    {navRow('server-outline', i18n.t('settings.dataBackups'), () => setSubView('data'))}
                                </>
                            ) : null}
                        </View>
                        {localDataDangerSection}
                    </>
                )}
            </ScrollView>
        </>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        header: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            paddingHorizontal: t.spacing.lg,
            paddingBottom: t.spacing.sm,
        },
        headerLeft: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            flexShrink: 1,
        },
        title: {
            fontSize: t.type.title.fontSize,
            fontWeight: t.type.title.fontWeight,
            color: t.colors.text,
        },
        advancedChip: {
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: t.colors.onAccent,
            backgroundColor: t.colors.accent,
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 2,
            overflow: 'hidden',
        },
        scroll: { flexGrow: 0 },
        content: {
            paddingHorizontal: t.spacing.lg,
            paddingBottom: t.spacing.xl,
        },
        sectionLabel: {
            fontSize: t.type.caption.fontSize,
            fontWeight: '700',
            color: t.colors.textTertiary,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            marginTop: t.spacing.lg,
            marginBottom: t.spacing.xs,
        },
        sectionNote: {
            fontSize: t.type.caption.fontSize,
            color: t.colors.textTertiary,
            fontStyle: 'italic',
            marginTop: t.spacing.xs,
        },
        // Grouped settings card: surfaceAlt fill, hairline border, radius 14,
        // rows separated by hairlines (see design: mobile/settings-patterns).
        card: {
            backgroundColor: t.colors.surfaceAlt,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.colors.border,
            borderRadius: 14,
            marginTop: t.spacing.xs,
            marginBottom: t.spacing.sm,
            overflow: 'hidden',
        },
        dangerCard: {
            backgroundColor: t.colors.dangerSurface,
            borderColor: t.colors.danger,
        },
        cardPad: { padding: t.spacing.md },
        cardLabel: {
            fontSize: t.type.caption.fontSize,
            fontWeight: '700',
            color: t.colors.textTertiary,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            marginBottom: t.spacing.sm,
        },
        separator: {
            height: StyleSheet.hairlineWidth,
            backgroundColor: t.colors.border,
            marginLeft: 46,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            minHeight: 54,
            paddingHorizontal: t.spacing.md,
        },
        rowIcon: { width: 24, textAlign: 'center' },
        rowLabel: {
            flex: 1,
            fontSize: t.type.body.fontSize,
            fontWeight: '500',
            color: t.colors.text,
        },
        dangerLabel: { color: t.colors.danger, fontWeight: '600' },
        rowValue: {
            fontSize: 15,
            color: t.colors.textTertiary,
        },
        activateBody: {
            fontSize: 19,
            lineHeight: 26,
            fontWeight: '500',
            color: t.colors.text,
            marginBottom: t.spacing.lg,
        },
        activateButton: {
            backgroundColor: t.colors.accent,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
        },
        activateButtonLabel: {
            fontSize: 17,
            fontWeight: '700',
            color: t.colors.onAccent,
        },
        activateNote: {
            fontSize: 13,
            lineHeight: 18,
            color: t.colors.textTertiary,
            textAlign: 'center',
            marginTop: t.spacing.md,
        },
        nameInput: {
            fontSize: t.type.bodyStrong.fontSize,
            fontWeight: t.type.bodyStrong.fontWeight,
            color: t.colors.text,
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: 12,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.colors.border,
            paddingHorizontal: t.spacing.md,
            paddingVertical: t.spacing.sm,
        },
        deviceKeyRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: 12,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.colors.border,
            paddingHorizontal: t.spacing.md,
            paddingVertical: t.spacing.sm,
        },
        deviceKeyValue: {
            flex: 1,
            fontSize: t.type.caption.fontSize,
            color: t.colors.textSecondary,
            fontVariant: ['tabular-nums'],
            letterSpacing: 0.2,
        },
        deviceKeyCopy: { padding: t.spacing.xs },
        cardSwatch: {
            width: 24,
            height: 24,
            borderRadius: 6,
            alignItems: 'center',
            justifyContent: 'center',
        },
    })
}
