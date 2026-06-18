import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
    Modal, View, Text, ScrollView, Switch, TextInput, TouchableOpacity, Animated, StyleSheet,
    type GestureResponderEvent,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { haptics } from '../feedback'
import { useTheme, cardColor, type Theme } from '../theme'
import { useI18n, type LocaleChoice } from '../i18n'
import { isBoardType, BOARD_WRITE_TYPE } from '@listam/domain/board'
import { isTodoType, TODO_LIST_TYPE } from '@listam/domain/identity'
import { UNGROUPED_GROUP_ID } from '@listam/domain/list-nav'
import type { RegistryListView } from '@listam/domain/list-registry'
import type { GroupedLists } from '../store/registrySelectors'
import { DEFAULT_VIEW } from '../store/registrySelectors'
import type { LoyaltyCardHandle } from '../store/loyaltyCardsSlice'
import type { NetworkStatus } from '../store/syncSlice'
import { deriveConnectionStatus } from './connectionStatus'
import { THEME_CHOICES, type ThemeChoice } from '../store/preferencesSlice'
import {
    SegmentedSetting,
    SIZE_OPTIONS,
    ITEM_ICON_VARIANT_OPTIONS,
    LIST_ALIGNMENT_OPTIONS,
    LIST_SPACING_OPTIONS,
    sizeLabelKey,
    themeLabelKey,
    alignLabelKey,
    spacingLabelKey,
} from './SegmentedSetting'
import { BackupSettings } from './BackupSettings'

type Props = {
    visible: boolean
    groups: GroupedLists
    currentListId: string
    defaultListId: string | null
    onSelect: (listId: string, type: string) => void
    onSetDefault: (listId: string) => void
    onCreate: (type: string) => void
    onCreateGroup: () => void
    onRenameGroup: (groupId: string, name: string) => void
    onMoveListToGroup: (listId: string, groupId: string | null) => void
    onClose: () => void
    peerCount: number
    isWorkletReady: boolean
    networkStatus: NetworkStatus
    isJoining: boolean
    onManageMembers: () => void
    onManageOwnedDevices: () => void
    onPairLeaf: () => void
    localeChoice: LocaleChoice
    onLocaleChoiceChange: (choice: LocaleChoice) => void
    themeChoice: ThemeChoice
    onThemeChoiceChange: (choice: ThemeChoice) => void
    // App-global board feature toggle (off by default).
    boardEnabled: boolean
    onToggleBoardEnabled: () => void
    // Per-board/list settings, addressed by listId so any list can be configured.
    onChangeListView: (listId: string, patch: Partial<RegistryListView>) => void
    onRenameList: (listId: string, name: string) => void
    onDeleteListItems: (listId: string) => void
    // When set as the menu opens, jump straight into that list's settings.
    initialListSettingsId?: string | null
    loyaltyCards: LoyaltyCardHandle[]
    onScanCard: () => void
    onSelectCard: (card: LoyaltyCardHandle) => void
    // Encrypted backup / restore: request-with-reply RPC + a snackbar notifier.
    sendRPCWithReply: (command: number, payload?: string) => Promise<string | null>
    notify: (message: string, type?: 'info' | 'success' | 'error') => void
}

type ViewMode = 'list' | 'grid'
const VIEW_MODE_OPTIONS: ViewMode[] = ['list', 'grid']

const LONG_PRESS_MS = 280
const MOVE_CANCEL = 12
const GHOST_WIDTH = 220
const GHOST_HEIGHT = 44

type Rect = { x: number; y: number; w: number; h: number }

function typeIcon(type: string): keyof typeof Ionicons.glyphMap {
    if (isBoardType(type)) return 'grid-outline'
    if (isTodoType(type)) return 'checkbox-outline'
    return 'cart-outline'
}

export function ListsMenu(props: Props) {
    const {
        visible, groups, currentListId, defaultListId,
        onSelect, onSetDefault, onCreate, onCreateGroup, onRenameGroup, onMoveListToGroup, onClose,
        peerCount, isWorkletReady, networkStatus, isJoining, onManageMembers, onManageOwnedDevices, onPairLeaf,
        localeChoice, onLocaleChoiceChange, themeChoice, onThemeChoiceChange,
        boardEnabled, onToggleBoardEnabled, onChangeListView, onRenameList, onDeleteListItems,
        initialListSettingsId, loyaltyCards, onScanCard, onSelectCard,
        sendRPCWithReply, notify,
    } = props

    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const [menuView, setMenuView] = useState<'lists' | 'settings' | 'listSettings'>('lists')
    const [settingsListId, setSettingsListId] = useState<string | null>(null)
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null)

    // --- drag-to-move-list state (raw touch + measureInWindow, modal-safe) ---
    const armedRef = useRef(false)
    const draggingIdRef = useRef<string | null>(null)
    const startRef = useRef({ x: 0, y: 0 })
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const groupNodeRefs = useRef<Map<string, View>>(new Map())
    const groupRectsRef = useRef<Map<string, Rect>>(new Map())
    const hoveredGroupRef = useRef<string | null>(null)
    const ghostPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current
    const [draggingId, setDraggingId] = useState<string | null>(null)
    const [dragText, setDragText] = useState('')
    const [hoveredGroup, setHoveredGroup] = useState<string | null>(null)

    useEffect(() => {
        if (!visible) {
            setMenuView('lists')
            setSettingsListId(null)
            setEditingGroupId(null)
            return
        }
        if (initialListSettingsId) {
            setSettingsListId(initialListSettingsId)
            setMenuView('listSettings')
        }
    }, [visible, initialListSettingsId])

    const status = deriveConnectionStatus(
        { networkStatus, isWorkletReady, isJoining, peerCount },
        t,
        i18n,
    )

    const close = () => { onClose() }

    // The list the per-board/list settings pane is configuring, resolved from the
    // synced registry data the menu already holds (so any list is configurable).
    const allLists = useMemo(() => groups.flatMap((g) => g.lists), [groups])
    const settingsList = useMemo(
        () => (settingsListId ? allLists.find((l) => l.id === settingsListId) ?? null : null),
        [allLists, settingsListId],
    )
    const settingsIsBoard = !!settingsList && isBoardType(settingsList.type)
    const settingsIsTodo = !!settingsList && isTodoType(settingsList.type)
    const listView: RegistryListView = useMemo(
        () => ({ ...DEFAULT_VIEW, ...((settingsList?.view as Partial<RegistryListView>) ?? {}) }),
        [settingsList],
    )
    const patchListView = (patch: Partial<RegistryListView>) => {
        if (settingsList) onChangeListView(settingsList.id, patch)
    }
    const openListSettings = (listId: string) => {
        setSettingsListId(listId)
        setMenuView('listSettings')
    }

    const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }

    const measureGroup = (groupId: string) => {
        const node = groupNodeRefs.current.get(groupId)
        if (node) node.measureInWindow((x, y, w, h) => groupRectsRef.current.set(groupId, { x, y, w, h }))
    }
    const measureAllGroups = () => { for (const id of groupNodeRefs.current.keys()) measureGroup(id) }

    const hitTestGroup = (x: number, y: number): string | null => {
        for (const [id, r] of groupRectsRef.current) {
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return id
        }
        return null
    }

    const beginDrag = (listId: string, name: string, x: number, y: number) => {
        armedRef.current = true
        draggingIdRef.current = listId
        hoveredGroupRef.current = null
        measureAllGroups()
        ghostPos.setValue({ x, y })
        setDragText(name)
        setHoveredGroup(null)
        setDraggingId(listId)
        haptics.select()
    }

    const endDrag = (commit: boolean) => {
        const listId = draggingIdRef.current
        const dest = hoveredGroupRef.current
        const origin = listId ? groups.find((g) => g.lists.some((l) => l.id === listId))?.group.id : null
        draggingIdRef.current = null
        hoveredGroupRef.current = null
        setDraggingId(null)
        setHoveredGroup(null)
        setDragText('')
        if (commit && listId && dest && dest !== origin) {
            onMoveListToGroup(listId, dest === UNGROUPED_GROUP_ID ? null : dest)
        }
        setTimeout(() => { armedRef.current = false }, 0)
    }

    const rowTouchStart = (list: { id: string; name: string }) => (e: GestureResponderEvent) => {
        const { pageX, pageY } = e.nativeEvent
        startRef.current = { x: pageX, y: pageY }
        armedRef.current = false
        clearTimer()
        timerRef.current = setTimeout(() => {
            timerRef.current = null
            beginDrag(list.id, list.name, startRef.current.x, startRef.current.y)
        }, LONG_PRESS_MS)
    }
    const rowTouchMove = (e: GestureResponderEvent) => {
        const { pageX, pageY } = e.nativeEvent
        if (armedRef.current) {
            ghostPos.setValue({ x: pageX, y: pageY })
            const hit = hitTestGroup(pageX, pageY)
            if (hit !== hoveredGroupRef.current) {
                hoveredGroupRef.current = hit
                setHoveredGroup(hit)
                if (hit) haptics.select()
            }
            return
        }
        if (Math.abs(pageX - startRef.current.x) > MOVE_CANCEL || Math.abs(pageY - startRef.current.y) > MOVE_CANCEL) {
            clearTimer()
        }
    }
    const rowTouchEnd = () => { clearTimer(); if (armedRef.current) endDrag(true) }
    const rowTouchCancel = () => { clearTimer(); if (armedRef.current) endDrag(false) }

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close} />
                <View style={styles.sheet}>
                    {menuView === 'lists' ? (
                        <>
                            <View style={styles.header}>
                                <View style={styles.headerTitleWrap}>
                                    <Text style={styles.title}>{i18n.t('lists.menu.title')}</Text>
                                    <View style={styles.subtitleRow}>
                                        <View style={[styles.subtitleDot, { backgroundColor: status.color }]} />
                                        <Text style={styles.subtitleText}>{status.label}</Text>
                                    </View>
                                </View>
                                <TouchableOpacity onPress={close} hitSlop={10} accessibilityLabel={i18n.t('common.close')}>
                                    <Ionicons name="close" size={24} color={t.colors.text} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} scrollEnabled={!draggingId}>
                                {groups.map(({ group, lists }) => {
                                    const editable = group.id !== UNGROUPED_GROUP_ID
                                    const isDropHover = hoveredGroup === group.id && draggingId != null
                                    return (
                                        <View
                                            key={group.id}
                                            ref={(node) => { if (node) groupNodeRefs.current.set(group.id, node); else groupNodeRefs.current.delete(group.id) }}
                                            onLayout={() => measureGroup(group.id)}
                                            style={[styles.group, isDropHover && styles.groupDropHover]}
                                        >
                                            {editingGroupId === group.id ? (
                                                <TextInput
                                                    style={styles.groupInput}
                                                    defaultValue={group.name}
                                                    autoFocus
                                                    placeholder={i18n.t('lists.menu.groupNamePlaceholder')}
                                                    placeholderTextColor={t.colors.placeholder}
                                                    returnKeyType="done"
                                                    onSubmitEditing={(e) => { onRenameGroup(group.id, e.nativeEvent.text); setEditingGroupId(null) }}
                                                    onBlur={() => setEditingGroupId(null)}
                                                />
                                            ) : editable ? (
                                                <TouchableOpacity style={styles.groupHeaderRow} onPress={() => setEditingGroupId(group.id)} accessibilityRole="button">
                                                    <Text style={styles.groupLabel}>{group.name}</Text>
                                                    <Ionicons name="pencil" size={12} color={t.colors.textTertiary} />
                                                </TouchableOpacity>
                                            ) : (
                                                <Text style={styles.groupLabel}>{i18n.t('lists.menu.ungrouped')}</Text>
                                            )}

                                            {lists.map((list) => {
                                                const isCurrent = list.id === currentListId
                                                const isDefault = list.id === defaultListId
                                                const isDragging = draggingId === list.id
                                                return (
                                                    <View
                                                        key={list.id}
                                                        style={[styles.row, isCurrent && styles.rowCurrent, isDragging && styles.rowDragging]}
                                                        onTouchStart={rowTouchStart(list)}
                                                        onTouchMove={rowTouchMove}
                                                        onTouchEnd={rowTouchEnd}
                                                        onTouchCancel={rowTouchCancel}
                                                    >
                                                        <TouchableOpacity
                                                            style={styles.rowMain}
                                                            onPress={() => { if (!armedRef.current) onSelect(list.id, list.type) }}
                                                            accessibilityRole="button"
                                                        >
                                                            <View style={styles.rowIcon}>
                                                                <Ionicons name={typeIcon(list.type)} size={19} color={t.colors.textSecondary} />
                                                            </View>
                                                            <Text style={styles.rowName} numberOfLines={1}>{list.name || list.id}</Text>
                                                        </TouchableOpacity>
                                                        <View style={styles.rowActions}>
                                                            <TouchableOpacity
                                                                onPress={() => { if (!armedRef.current) openListSettings(list.id) }}
                                                                hitSlop={10}
                                                                accessibilityLabel={i18n.t(isBoardType(list.type) ? 'lists.menu.boardSettings' : 'lists.menu.listSettings')}
                                                            >
                                                                <Ionicons name="settings-outline" size={19} color={t.colors.textTertiary} />
                                                            </TouchableOpacity>
                                                            <TouchableOpacity
                                                                onPress={() => { if (!armedRef.current) onSetDefault(list.id) }}
                                                                hitSlop={10}
                                                                accessibilityLabel={i18n.t(isDefault ? 'list.isDefault' : 'list.makeDefault')}
                                                            >
                                                                <Ionicons name={isDefault ? 'star' : 'star-outline'} size={20} color={isDefault ? t.colors.text : t.colors.textTertiary} />
                                                            </TouchableOpacity>
                                                        </View>
                                                    </View>
                                                )
                                            })}
                                        </View>
                                    )
                                })}
                            </ScrollView>

                            <Text style={styles.createHeader}>{i18n.t('lists.menu.createHeader')}</Text>
                            <View style={styles.createRow}>
                                <TouchableOpacity style={styles.createBtn} onPress={() => onCreate('shopping')} accessibilityRole="button">
                                    <View style={styles.createPlus}><Ionicons name="add" size={16} color={t.colors.text} /></View>
                                    <Ionicons name="cart-outline" size={22} color={t.colors.text} />
                                    <Text style={styles.createTitle}>{i18n.t('lists.menu.newGrocery')}</Text>
                                    <Text style={styles.createSub}>{i18n.t('lists.menu.newGrocerySub')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.createBtn} onPress={() => onCreate(TODO_LIST_TYPE)} accessibilityRole="button">
                                    <View style={styles.createPlus}><Ionicons name="add" size={16} color={t.colors.text} /></View>
                                    <Ionicons name="checkbox-outline" size={22} color={t.colors.text} />
                                    <Text style={styles.createTitle}>{i18n.t('lists.menu.newTodo')}</Text>
                                    <Text style={styles.createSub}>{i18n.t('lists.menu.newTodoSub')}</Text>
                                </TouchableOpacity>
                                {boardEnabled && (
                                    <TouchableOpacity style={styles.createBtn} onPress={() => onCreate(BOARD_WRITE_TYPE)} accessibilityRole="button">
                                        <View style={styles.createPlus}><Ionicons name="add" size={16} color={t.colors.text} /></View>
                                        <Ionicons name="grid-outline" size={22} color={t.colors.text} />
                                        <Text style={styles.createTitle}>{i18n.t('lists.menu.newBoard')}</Text>
                                        <Text style={styles.createSub}>{i18n.t('lists.menu.newBoardSub')}</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <TouchableOpacity style={styles.newGroupBtn} onPress={onCreateGroup} accessibilityRole="button">
                                <Ionicons name="add" size={16} color={t.colors.textSecondary} />
                                <Text style={styles.newGroupLabel}>{i18n.t('lists.menu.newGroup')}</Text>
                            </TouchableOpacity>

                            <View style={styles.utilityRow}>
                                <TouchableOpacity style={styles.utilityBtn} onPress={() => setMenuView('settings')}>
                                    <Ionicons name="settings-outline" size={20} color={t.colors.textSecondary} />
                                    <Text style={styles.utilityLabel}>{i18n.t('lists.menu.settings')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.utilityBtn} onPress={() => { onManageMembers(); close() }}>
                                    <Ionicons name="people-outline" size={20} color={t.colors.textSecondary} />
                                    <Text style={styles.utilityLabel}>{i18n.t('header.action.membersRecovery')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.utilityBtn} onPress={() => { onManageOwnedDevices(); close() }}>
                                    <Ionicons name="hardware-chip-outline" size={20} color={t.colors.textSecondary} />
                                    <Text style={styles.utilityLabel}>{i18n.t('control.section')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.utilityBtn} onPress={() => { onPairLeaf(); close() }}>
                                    <Ionicons name="bluetooth-outline" size={20} color={t.colors.textSecondary} />
                                    <Text style={styles.utilityLabel}>{i18n.t('leaf.section')}</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    ) : menuView === 'settings' ? (
                        <>
                            <View style={styles.header}>
                                <View style={styles.headerLeft}>
                                    <TouchableOpacity onPress={() => setMenuView('lists')} hitSlop={10} accessibilityLabel={i18n.t('lists.menu.back')}>
                                        <Ionicons name="chevron-back" size={24} color={t.colors.text} />
                                    </TouchableOpacity>
                                    <Text style={styles.title}>{i18n.t('lists.menu.settings')}</Text>
                                </View>
                                <TouchableOpacity onPress={close} hitSlop={10} accessibilityLabel={i18n.t('common.close')}>
                                    <Ionicons name="close" size={24} color={t.colors.text} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={styles.scroll} contentContainerStyle={styles.settingsContent}>
                                <Text style={styles.sectionLabel}>{i18n.t('lists.menu.sectionAppearance')}</Text>
                                <SegmentedSetting
                                    title={i18n.t('header.setting.appearance')}
                                    options={THEME_CHOICES}
                                    value={themeChoice}
                                    onChange={onThemeChoiceChange}
                                    labelFor={(o) => i18n.t(themeLabelKey(o))}
                                />
                                <SegmentedSetting
                                    title={i18n.t('header.setting.appLanguage')}
                                    options={i18n.localeChoices}
                                    value={localeChoice}
                                    onChange={onLocaleChoiceChange}
                                    labelFor={i18n.labelForLocaleChoice}
                                />

                                <Text style={styles.sectionLabel}>{i18n.t('lists.menu.boardFeature')}</Text>
                                <View style={styles.switchRow}>
                                    <Ionicons name="grid-outline" size={20} color={t.colors.text} />
                                    <Text style={styles.switchLabel}>{i18n.t('lists.menu.boardFeatureHint')}</Text>
                                    <Switch value={boardEnabled} onValueChange={onToggleBoardEnabled} trackColor={{ false: t.colors.border, true: t.colors.primary }} thumbColor={t.colors.surface} />
                                </View>

                                <Text style={styles.sectionLabel}>{i18n.t('header.section.loyaltyCards')}</Text>
                                <TouchableOpacity style={styles.actionRow} onPress={() => { onScanCard(); close() }} activeOpacity={0.6}>
                                    <Ionicons name="scan-outline" size={20} color={t.colors.text} />
                                    <Text style={styles.actionLabel}>{i18n.t('header.action.scanLoyaltyCard')}</Text>
                                </TouchableOpacity>
                                {loyaltyCards.map((card) => (
                                    <TouchableOpacity key={card.id} style={styles.actionRow} onPress={() => { onSelectCard(card); close() }} activeOpacity={0.6}>
                                        <View style={[styles.cardSwatch, { backgroundColor: cardColor(card.name) }]}>
                                            <Ionicons name="card-outline" size={14} color="#fff" />
                                        </View>
                                        <Text style={styles.actionLabel}>{card.name}</Text>
                                    </TouchableOpacity>
                                ))}

                                <BackupSettings sendRPCWithReply={sendRPCWithReply} notify={notify} />
                            </ScrollView>
                        </>
                    ) : (
                        <>
                            <View style={styles.header}>
                                <View style={styles.headerLeft}>
                                    <TouchableOpacity onPress={() => setMenuView('lists')} hitSlop={10} accessibilityLabel={i18n.t('lists.menu.back')}>
                                        <Ionicons name="chevron-back" size={24} color={t.colors.text} />
                                    </TouchableOpacity>
                                    <Text style={styles.title}>{i18n.t(settingsIsBoard ? 'lists.menu.boardSettings' : 'lists.menu.listSettings')}</Text>
                                </View>
                                <TouchableOpacity onPress={close} hitSlop={10} accessibilityLabel={i18n.t('common.close')}>
                                    <Ionicons name="close" size={24} color={t.colors.text} />
                                </TouchableOpacity>
                            </View>

                            {settingsList ? (
                                <ScrollView style={styles.scroll} contentContainerStyle={styles.settingsContent}>
                                    <Text style={styles.sectionLabel}>{i18n.t('lists.menu.sectionName')}</Text>
                                    <TextInput
                                        key={settingsList.id}
                                        style={styles.nameInput}
                                        defaultValue={settingsList.name}
                                        placeholder={i18n.t(settingsIsBoard ? 'lists.menu.boardNamePlaceholder' : 'lists.menu.listNamePlaceholder')}
                                        placeholderTextColor={t.colors.placeholder}
                                        returnKeyType="done"
                                        onEndEditing={(e) => onRenameList(settingsList.id, e.nativeEvent.text)}
                                    />

                                    {settingsIsBoard ? (
                                        <Text style={styles.sectionNote}>{i18n.t('lists.menu.boardSoon')}</Text>
                                    ) : settingsIsTodo ? (
                                        // A to-do list is plain text: no view mode (grid is forbidden),
                                        // no item icons, no categories. Only the text-presentation
                                        // controls that make sense for a flat list.
                                        <>
                                            <Text style={styles.sectionLabel}>{i18n.t('lists.menu.sectionItems')}</Text>
                                            <View style={styles.switchRow}>
                                                <Ionicons name="add-circle-outline" size={20} color={t.colors.text} />
                                                <Text style={styles.switchLabel}>{i18n.t('header.setting.showFab')}</Text>
                                                <Switch value={listView.showFab} onValueChange={(v) => patchListView({ showFab: v })} trackColor={{ false: t.colors.border, true: t.colors.primary }} thumbColor={t.colors.surface} />
                                            </View>
                                            <SegmentedSetting
                                                title={i18n.t('header.setting.listTextSize')}
                                                options={SIZE_OPTIONS}
                                                value={listView.listTextSize}
                                                onChange={(size) => patchListView({ listTextSize: size })}
                                                labelFor={(o) => i18n.t(sizeLabelKey(o))}
                                            />
                                            <SegmentedSetting
                                                title={i18n.t('header.setting.listAlignment')}
                                                options={LIST_ALIGNMENT_OPTIONS}
                                                value={listView.listAlignment}
                                                onChange={(alignment) => patchListView({ listAlignment: alignment })}
                                                labelFor={(o) => i18n.t(alignLabelKey(o))}
                                            />
                                            <SegmentedSetting
                                                title={i18n.t('header.setting.listItemSpacing')}
                                                options={LIST_SPACING_OPTIONS}
                                                value={listView.listItemSpacing}
                                                onChange={(spacing) => patchListView({ listItemSpacing: spacing })}
                                                labelFor={(o) => i18n.t(spacingLabelKey(o))}
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <Text style={styles.sectionLabel}>{i18n.t('lists.menu.sectionView')}</Text>
                                            <SegmentedSetting<ViewMode>
                                                options={VIEW_MODE_OPTIONS}
                                                value={listView.isGridView ? 'grid' : 'list'}
                                                onChange={(mode) => patchListView({ isGridView: mode === 'grid' })}
                                                labelFor={(mode) => i18n.t(mode === 'grid' ? 'header.action.gridView' : 'header.action.listView')}
                                            />
                                            <SegmentedSetting
                                                title={i18n.t('header.setting.itemIcons')}
                                                options={ITEM_ICON_VARIANT_OPTIONS}
                                                value={listView.itemIconVariant}
                                                onChange={(variant) => patchListView({ itemIconVariant: variant })}
                                                labelFor={(o) => i18n.t(o === 'illustrated' ? 'header.iconVariant.illustrated' : 'header.iconVariant.minimal')}
                                            />
                                            {listView.isGridView && (
                                                <SegmentedSetting
                                                    title={i18n.t('header.setting.gridIconSize')}
                                                    options={SIZE_OPTIONS}
                                                    value={listView.gridIconSize}
                                                    onChange={(size) => patchListView({ gridIconSize: size })}
                                                    labelFor={(o) => i18n.t(sizeLabelKey(o))}
                                                />
                                            )}

                                            <Text style={styles.sectionLabel}>{i18n.t('lists.menu.sectionItems')}</Text>
                                            <View style={styles.switchRow}>
                                                <Ionicons name="add-circle-outline" size={20} color={t.colors.text} />
                                                <Text style={styles.switchLabel}>{i18n.t('header.setting.showFab')}</Text>
                                                <Switch value={listView.showFab} onValueChange={(v) => patchListView({ showFab: v })} trackColor={{ false: t.colors.border, true: t.colors.primary }} thumbColor={t.colors.surface} />
                                            </View>
                                            <View style={styles.switchRow}>
                                                <Ionicons name="pricetags-outline" size={20} color={t.colors.text} />
                                                <Text style={styles.switchLabel}>{i18n.t('header.setting.categories')}</Text>
                                                <Switch value={listView.categoriesEnabled} onValueChange={(v) => patchListView({ categoriesEnabled: v })} trackColor={{ false: t.colors.border, true: t.colors.primary }} thumbColor={t.colors.surface} />
                                            </View>
                                            {listView.categoriesEnabled && (
                                                <View style={styles.switchRow}>
                                                    <Ionicons name="albums-outline" size={20} color={t.colors.text} />
                                                    <Text style={styles.switchLabel}>{i18n.t('header.setting.categoryHeaders')}</Text>
                                                    <Switch value={listView.categoryHeadersVisible} onValueChange={(v) => patchListView({ categoryHeadersVisible: v })} trackColor={{ false: t.colors.border, true: t.colors.primary }} thumbColor={t.colors.surface} />
                                                </View>
                                            )}
                                            {!listView.isGridView && (
                                                <>
                                                    <SegmentedSetting
                                                        title={i18n.t('header.setting.listTextSize')}
                                                        options={SIZE_OPTIONS}
                                                        value={listView.listTextSize}
                                                        onChange={(size) => patchListView({ listTextSize: size })}
                                                        labelFor={(o) => i18n.t(sizeLabelKey(o))}
                                                    />
                                                    <SegmentedSetting
                                                        title={i18n.t('header.setting.listAlignment')}
                                                        options={LIST_ALIGNMENT_OPTIONS}
                                                        value={listView.listAlignment}
                                                        onChange={(alignment) => patchListView({ listAlignment: alignment })}
                                                        labelFor={(o) => i18n.t(alignLabelKey(o))}
                                                    />
                                                    <SegmentedSetting
                                                        title={i18n.t('header.setting.listItemSpacing')}
                                                        options={LIST_SPACING_OPTIONS}
                                                        value={listView.listItemSpacing}
                                                        onChange={(spacing) => patchListView({ listItemSpacing: spacing })}
                                                        labelFor={(o) => i18n.t(spacingLabelKey(o))}
                                                    />
                                                </>
                                            )}
                                        </>
                                    )}

                                    <Text style={styles.sectionLabel}>{i18n.t('header.section.dangerZone')}</Text>
                                    <TouchableOpacity style={[styles.actionRow, styles.dangerRow]} onPress={() => onDeleteListItems(settingsList.id)} activeOpacity={0.6}>
                                        <Ionicons name="trash-outline" size={20} color={t.colors.danger} />
                                        <Text style={[styles.actionLabel, { color: t.colors.danger }]}>{i18n.t('header.action.deleteAll')}</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            ) : null}
                        </>
                    )}
                </View>

                {draggingId != null && (
                    <Animated.View
                        pointerEvents="none"
                        style={[styles.ghost, { transform: [
                            { translateX: Animated.subtract(ghostPos.x, GHOST_WIDTH / 2) },
                            { translateY: Animated.subtract(ghostPos.y, GHOST_HEIGHT + 12) },
                        ] }]}
                    >
                        <Ionicons name="reorder-three" size={18} color={t.colors.onAccent} />
                        <Text style={styles.ghostText} numberOfLines={1}>{dragText}</Text>
                    </Animated.View>
                )}
            </View>
        </Modal>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: t.colors.overlay },
        backdrop: { ...StyleSheet.absoluteFillObject },
        sheet: {
            backgroundColor: t.colors.surface,
            borderTopLeftRadius: t.radius.xl,
            borderTopRightRadius: t.radius.xl,
            paddingTop: t.spacing.md,
            paddingBottom: t.spacing.xl,
            maxHeight: '85%',
        },
        header: {
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.sm,
        },
        headerTitleWrap: { flexShrink: 1 },
        headerLeft: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
        title: { fontSize: t.type.title.fontSize, fontWeight: t.type.title.fontWeight, color: t.colors.text },
        subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs, marginTop: 2 },
        subtitleDot: { width: 7, height: 7, borderRadius: 4 },
        subtitleText: { fontSize: t.type.caption.fontSize, color: t.colors.textTertiary },
        scroll: { flexShrink: 1 },
        scrollContent: { paddingBottom: t.spacing.md },
        settingsContent: { paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg },
        group: { marginTop: t.spacing.sm, borderRadius: t.radius.md, borderWidth: 1, borderColor: 'transparent' },
        groupDropHover: { borderColor: t.colors.accent, backgroundColor: t.colors.surfaceAlt },
        groupHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs, paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.xs },
        groupLabel: {
            fontSize: t.type.caption.fontSize, fontWeight: '700', color: t.colors.textTertiary,
            textTransform: 'uppercase', letterSpacing: 0.6,
            paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.xs,
        },
        groupInput: {
            fontSize: t.type.bodyStrong.fontSize, color: t.colors.text, fontWeight: '600',
            paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.xs,
        },
        row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm },
        rowCurrent: { backgroundColor: t.colors.surfaceAlt },
        rowDragging: { opacity: 0.4 },
        rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
        rowActions: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
        rowIcon: {
            width: 36, height: 36, borderRadius: t.radius.sm, backgroundColor: t.colors.surfaceAlt,
            alignItems: 'center', justifyContent: 'center',
        },
        rowName: { fontSize: t.type.body.fontSize, color: t.colors.text, flexShrink: 1 },
        createHeader: {
            fontSize: t.type.caption.fontSize, fontWeight: '700', color: t.colors.textTertiary,
            textTransform: 'uppercase', letterSpacing: 0.6,
            paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.lg, paddingBottom: t.spacing.xs,
        },
        createRow: { flexDirection: 'row', gap: t.spacing.sm, paddingHorizontal: t.spacing.lg },
        createBtn: {
            flex: 1, alignItems: 'center', gap: 4, paddingVertical: t.spacing.md,
            borderRadius: t.radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border,
            backgroundColor: t.colors.surfaceAlt,
        },
        createPlus: {
            position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10,
            alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.colors.borderStrong,
        },
        createTitle: { fontSize: t.type.label.fontSize, fontWeight: '700', color: t.colors.text },
        createSub: { fontSize: t.type.caption.fontSize, color: t.colors.textTertiary },
        newGroupBtn: {
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: t.spacing.xs,
            marginHorizontal: t.spacing.lg, marginTop: t.spacing.sm, paddingVertical: t.spacing.sm,
            borderRadius: t.radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border,
            borderStyle: 'dashed',
        },
        newGroupLabel: { fontSize: t.type.label.fontSize, fontWeight: '600', color: t.colors.textSecondary },
        utilityRow: {
            flexDirection: 'row', marginTop: t.spacing.md, paddingTop: t.spacing.md,
            paddingHorizontal: t.spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.border,
        },
        utilityBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: t.spacing.xs },
        utilityLabel: { fontSize: t.type.caption.fontSize, color: t.colors.textSecondary, textAlign: 'center' },
        sectionLabel: {
            fontSize: t.type.caption.fontSize, fontWeight: '700', color: t.colors.textTertiary,
            textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.lg, marginBottom: t.spacing.xs,
        },
        sectionNote: {
            fontSize: t.type.caption.fontSize, color: t.colors.textTertiary,
            fontStyle: 'italic', marginTop: t.spacing.md,
        },
        nameInput: {
            fontSize: t.type.bodyStrong.fontSize, color: t.colors.text,
            backgroundColor: t.colors.surfaceAlt, borderRadius: t.radius.md,
            paddingHorizontal: t.spacing.md, paddingVertical: t.spacing.sm,
            borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border,
        },
        switchRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.sm, minHeight: 44 },
        switchLabel: { flex: 1, fontSize: t.type.bodyStrong.fontSize, color: t.colors.text },
        actionRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.md, minHeight: 44 },
        actionLabel: { flex: 1, fontSize: t.type.bodyStrong.fontSize, color: t.colors.text },
        cardSwatch: { width: 26, height: 26, borderRadius: t.radius.sm, alignItems: 'center', justifyContent: 'center' },
        dangerRow: {
            backgroundColor: t.colors.dangerSurface, borderRadius: t.radius.sm,
            paddingHorizontal: t.spacing.md, marginTop: t.spacing.xs,
        },
        ghost: {
            position: 'absolute', top: 0, left: 0, width: GHOST_WIDTH, height: GHOST_HEIGHT,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: t.spacing.sm,
            borderRadius: GHOST_HEIGHT / 2, backgroundColor: t.colors.accent, paddingHorizontal: 16,
            shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
        },
        ghostText: { color: t.colors.onAccent, fontSize: t.type.body.fontSize, fontWeight: '700', flexShrink: 1 },
    })
}
