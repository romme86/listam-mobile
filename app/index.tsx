import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
    View,
    Share,
    Alert,
    AppState,
    StatusBar,
    LayoutAnimation,
    Platform,
    UIManager,
} from 'react-native'
import { Provider } from 'react-redux'
import * as Linking from 'expo-linking'
import { useFonts } from 'expo-font'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { isLocaleChoice } from '@listam/i18n'
import {
    useWorklet,
    RPC_UPDATE,
    RPC_DELETE,
    RPC_ADD,
    RPC_MOVE,
    RPC_JOIN_KEY,
    RPC_CREATE_INVITE,
    RPC_REMOVE_MEMBER,
    RPC_GET_MEMBERS,
    RPC_GET_OWNER_RECOVERY_CODE,
    RPC_RECOVER_OWNER,
    RPC_CONTROL_PAIR,
    RPC_CONTROL_COMMAND,
    RPC_CONTROL_LIST,
    RPC_GET_BOARD_CONFIG,
    type NotifyType,
} from './hooks/_useWorklet'
import { RPC_LIST_BACKUPS, RPC_SET_BACKUP_SCHEDULE, RPC_SHARE_LIST, RPC_JOIN_LIST } from '@listam/protocol'
import { store } from './store/store'
import { syncActions } from './store/syncSlice'
import { useAppDispatch, useAppSelector } from './store/hooks'
import { listsActions, selectItemsForList, selectSelectedListItems, selectAllItems } from './store/listsSlice'
import {
    preferencesActions,
    selectPreferences,
    isThemeChoice,
    type ThemeChoice,
} from './store/preferencesSlice'
import {
    loyaltyCardsActions,
    selectLoyaltyCardHandles,
    type LoyaltyCardHandle,
} from './store/loyaltyCardsSlice'
import { useSubscription } from './hooks/useSubscription'
import { useReduceMotion } from './hooks/useReduceMotion'
import { useLearnedCategories } from './hooks/useLearnedCategories'
import { Header } from './components/Header'
import { JoinDialog } from './components/JoinDialog'
import { MembersDialog } from './components/MembersDialog'
import { OwnedDevicesDialog } from './components/OwnedDevicesDialog'
import { LeafPairingDialog } from './components/LeafPairingDialog'
import { JoiningOverlay, P2P_MESSAGE_KEYS } from './components/JoiningOverlay'
import { Paywall } from './components/Paywall'
import { LoyaltyCardScanner } from './components/LoyaltyCardScanner'
import { LoyaltyCardViewer } from './components/LoyaltyCardViewer'
import type { LoyaltyCard } from './components/LoyaltyCardScanner'
import InertialElasticList from './components/intertial_scroll'
import { VisualGridList } from './components/VisualGridList'
import { CategoryDragProvider } from './components/CategoryDrag'
import { getDisplayCategoryName, groupByCategory } from './components/categoryGrouping'
import { computeReorder, sortByOrder } from '@listam/domain/ordering'
import { identityKey, DEFAULT_LIST_TYPE, DEFAULT_LIST_ID, decodeSurface, isTodoType } from './listProjection'
import { AddItemBar } from './components/AddItemBar'
import { Fab } from './components/Fab'
import { ListsMenu } from './components/ListsMenu'
import { MoveItemSheet } from './components/MoveItemSheet'
import { ListContextBar } from './components/ListContextBar'
import { ListSwipePager } from './components/ListSwipePager'
import { BoardView } from './components/board/BoardView'
import { TicketDetail } from './components/board/TicketDetail'
import { CreateTicket, type TicketDraft } from './components/board/CreateTicket'
import { ValueRateSheet } from './components/ValueRateSheet'
import { useListPager } from './nav/useListPager'
import { selectGroupedLists, selectCurrentListView, selectSyncedDefaultList, DEFAULT_VIEW, isBuiltinSurfaceId, builtinSurfaceNameKey } from './store/registrySelectors'
import { selectBoardConfig } from './store/boardConfigSlice'
import { selectPeerLabels, selectValueReturnEnabled } from './store/labelsSlice'
import { buildListMetaItem, buildGroupMetaItem, buildProjectSettingsItem, type RegistryListView } from '@listam/domain/list-registry'
import { UNGROUPED_GROUP_ID } from '@listam/domain/list-nav'
import { buildPeerLabelItem, buildSurfaceLabelItem, buildBuiltinGroupItem, buildValueReturnItem, surfaceLabelKey, MAX_LABEL_NAME } from '@listam/domain'
import { BOARD_WRITE_TYPE, BOARD_LIST_TYPE, isBoardType, buildStatusChange, validateTicketDraft } from '@listam/domain/board'
import {
    reducePlan,
    groupPlanByDate,
    buildItemPlanEntry,
    buildListPlanEntry,
    buildPlanItem,
    isPlanItem,
    planItemKey,
    planListKey,
    toDateKey,
} from '@listam/domain/plan'
import { OverviewScreen } from './components/OverviewScreen'
import { PlanSheet } from './components/PlanSheet'
import { SnackbarProvider, useSnackbar } from './components/Snackbar'
import { haptics } from './feedback'
import { I18nProvider, useI18n, type LocaleChoice } from './i18n'
import { appLogger } from './logger'
import { useTheme } from './theme'
import {
    deleteLoyaltyCard as deleteStoredLoyaltyCard,
    persistLoyaltyCard as persistStoredLoyaltyCard,
    prepareLoyaltyCards,
    readLoyaltyCard as readStoredLoyaltyCard,
} from './secrets'
import {
    createJoinConfirmationRequest,
    extractInviteFromInput,
    planIncomingLinkJoin,
    resolveJoinConfirmation,
    type JoinConfirmationRequest,
} from './invite-confirmation'
import type { ListEntry } from './components/_types'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true)
}

const PREF_LOCALE_CHOICE = '@lista_locale_choice'
const PREF_THEME_CHOICE = '@lista_theme_choice'
const PREF_DEFAULT_LIST = '@lista_default_list'
const PREF_BOARD_ENABLED = '@lista_board_enabled'
const PREF_OVERVIEW_ENABLED = '@lista_overview_enabled'
const PREF_OVERVIEW_OPEN = '@lista_overview_open'
const PREF_DEVICE_NAME = '@lista_device_name'
const PREF_BACKUP_PROMPTED = '@lista_backup_prompted'
const PREF_BUILTIN_VIEWS = '@lista_builtin_views'

// Parse the persisted built-in-surface view map; tolerate absent/corrupt JSON.
// Keep only well-formed per-surface entries so one corrupt value can't shadow a
// surface's real override.
function parseBuiltinViews(raw: string | null): Record<string, Partial<RegistryListView>> | null {
    if (!raw) return null
    try {
        const value = JSON.parse(raw)
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null
        const clean: Record<string, Partial<RegistryListView>> = {}
        for (const [id, view] of Object.entries(value)) {
            if (view && typeof view === 'object' && !Array.isArray(view)) {
                clean[id] = view as Partial<RegistryListView>
            }
        }
        return clean
    } catch {
        return null
    }
}

// Max gap between the two taps of a double-tap-to-add gesture.
const DOUBLE_TAP_MS = 300
// Settle window for row-toggle taps while the Overview is enabled: within it,
// further taps keep flipping in place and a third tap becomes a capture; only
// after it does the row reorder + the write go out (see handleToggleDone).
const TAP_SETTLE_MS = 300
// Identity for a pending toggle (same shape as the plan item ref's payload).
const toggleKeyOf = (item: ListEntry) => `${item.listId ?? ''}::${item.id ?? ''}`

function AppInner() {
    const t = useTheme()
    const i18n = useI18n()
    const insets = useSafeAreaInsets()
    const snackbar = useSnackbar()
    const reduceMotion = useReduceMotion()
    const dispatch = useAppDispatch()
    const { localeChoice, themeChoice, defaultListId, boardEnabled, overviewEnabled, deviceName, builtinViews } = useAppSelector(selectPreferences)
    const peerLabels = useAppSelector(selectPeerLabels)
    const valueReturnMap = useAppSelector(selectValueReturnEnabled)
    // Whether a surface has the value-return property enabled (keyed by the
    // canonical type, so a board's wire type 'kanban' is folded to BOARD_LIST_TYPE).
    const isValueOn = useCallback(
        (listId: string, type: string) => valueReturnMap.has(surfaceLabelKey(listId, isBoardType(type) ? BOARD_LIST_TYPE : type)),
        [valueReturnMap],
    )
    // List PRESENTATION settings are per-list and synced (registry meta-item),
    // not global — sourced from the currently-selected list.
    const {
        isGridView,
        categoriesEnabled,
        categoryHeadersVisible,
        showFab,
        gridIconSize,
        listTextSize,
        listAlignment,
        listItemSpacing,
        itemIconVariant,
    } = useAppSelector(selectCurrentListView)
    const loyaltyCards = useAppSelector(selectLoyaltyCardHandles)
    const groupedLists = useAppSelector(selectGroupedLists)
    const syncedDefaultList = useAppSelector(selectSyncedDefaultList)
    const boardConfig = useAppSelector(selectBoardConfig)
    // Every materialized item (incl. the plan channel) — the Overview reduces the
    // plan entries out of this and joins them to their source rows.
    const allItems = useAppSelector(selectAllItems)

    const notify = useCallback(
        (message: string, type: NotifyType = 'info') => snackbar.show(message, type),
        [snackbar]
    )

    const {
        dataList,
        peerCount,
        isWorkletReady,
        isJoining,
        setIsJoining,
        isJoiningRef,
        joinPhase,
        networkStatus,
        membershipRoster,
        ownerRecoveryCode,
        clearOwnerRecoveryCode,
        ownerControl,
        autobaseInviteKey,
        sendRPC,
        sendRPCWithReply,
    } = useWorklet(notify)

    const subscription = useSubscription()
    const { apply: applyLearnedCategories, learn: learnCategory } = useLearnedCategories()
    const { lib, currentId, position, commit } = useListPager()
    const currentListType = lib.listsById[currentId]?.type
    // The current surface's display name: its synced rename, else the localized
    // built-in fallback (a fresh, un-renamed built-in), else the raw id.
    const currentListName = useMemo(() => {
        const rec = lib.listsById[currentId]
        if (rec?.name) return rec.name
        if (isBuiltinSurfaceId(currentId)) return i18n.t(builtinSurfaceNameKey(decodeSurface(currentId).listType))
        return currentId
    }, [lib, currentId, i18n])
    const isBoard = isBoardType(currentListType)
    // Grocery items are NOT movable to other lists — the "move to another list"
    // affordance is offered only on to-do (and board) surfaces. A grocery list is
    // neither a board nor a to-do, so the move icon is suppressed there.
    const isTodo = isTodoType(currentListType)

    // The list as shown: entries without an explicit (dragged) category override
    // inherit one from what was learned for that item name. The raw `dataList`
    // is still the source of truth for mutations — this view is index-aligned.
    // Skipped when categories are off (always so for a to-do list): there is no
    // category UI to feed, so the device-local learned map must not bleed grocery
    // categories onto a plain text list.
    const displayList = useMemo(
        () => (categoriesEnabled ? applyLearnedCategories(dataList) : dataList),
        [categoriesEnabled, applyLearnedCategories, dataList]
    )

    // Live plan state, reduced once per items change: the record map feeds the
    // per-day grouping (tray badge) and the ref set (row/header flag state,
    // 'i:listId::itemId' / 'l:listId::type').
    const planRecords = useMemo(() => reducePlan(allItems), [allItems])
    const plannedRefs = useMemo(() => new Set([...planRecords.keys()]), [planRecords])
    const planByDate = useMemo(() => groupPlanByDate(planRecords), [planRecords])
    const todayPlanCount = planByDate.get(toDateKey(Date.now()))?.length ?? 0

    const [joinDialogVisible, setJoinDialogVisible] = useState(false)
    // The join dialog is reused for both the destructive whole-project join
    // ('project') and the additive single-list join ('list', RPC_JOIN_LIST).
    const [joinMode, setJoinMode] = useState<'project' | 'list'>('project')
    // Whether a backup password is set. Joins are gated on it so the pre-join
    // auto-backup can always run. null = not yet queried.
    const [backupPasswordSet, setBackupPasswordSet] = useState<boolean | null>(null)
    // Latest known rolling-backup schedule.enabled (from RPC_LIST_BACKUPS). The
    // foreground catch-up re-asserts this on background→active so the backend
    // scheduler restarts and writes any tier that came due while suspended. The
    // backend stays the source of truth; this is just the value to re-send.
    const backupScheduleEnabledRef = useRef(true)
    const [joinKeyInput, setJoinKeyInput] = useState('')
    const [membersDialogVisible, setMembersDialogVisible] = useState(false)
    const [ownedDevicesVisible, setOwnedDevicesVisible] = useState(false)
    const [leafPairingVisible, setLeafPairingVisible] = useState(false)
    const [recoverCodeInput, setRecoverCodeInput] = useState('')
    const [currentP2PMessage, setCurrentP2PMessage] = useState(0)
    const [scannerVisible, setScannerVisible] = useState(false)
    const [selectedCard, setSelectedCard] = useState<LoyaltyCard | null>(null)
    const [isAdding, setIsAdding] = useState(false)
    const [addText, setAddText] = useState('')
    const [listsMenuVisible, setListsMenuVisible] = useState(false)
    // Which sub-view the lists menu opens in: the burger jumps to 'settings',
    // the list-name strip opens the 'lists' switcher.
    const [menuInitialView, setMenuInitialView] = useState<'lists' | 'settings'>('lists')
    // The day-plan Overview is an OPT-IN capability behind its own preference
    // (preferences.overviewEnabled, general settings). By default the app is just
    // a grocery + to-do list app: no Overview surface, and none of the plan
    // gestures (triple-tap, swipe-right flag, long-press sheet) are wired.
    // overviewVisible is whether the surface is currently shown; it is persisted
    // (PREF_OVERVIEW_OPEN) via setOverviewShown so an opted-in user relaunches
    // onto the Overview when they left it open.
    const [overviewVisible, setOverviewVisible] = useState(false)
    // Effective Overview visibility: it can only ever show while the feature is
    // enabled, so disabling it always collapses back to the list — even if
    // overviewVisible lingered true.
    const overviewOpen = overviewEnabled && overviewVisible
    // The item whose plan sheet (edit / plan-for-a-day) is open (null = closed).
    const [planSheetItem, setPlanSheetItem] = useState<ListEntry | null>(null)
    const [pendingListSettingsId, setPendingListSettingsId] = useState<string | null>(null)
    const [boardTicketId, setBoardTicketId] = useState<string | null>(null)
    // Pending to-do add awaiting its mandatory value/delay rating (text to file).
    const [valueRateAdd, setValueRateAdd] = useState<string | null>(null)
    const [createTicketVisible, setCreateTicketVisible] = useState(false)
    // The item whose "move to another list" picker is open (null = closed).
    const [moveTarget, setMoveTarget] = useState<ListEntry | null>(null)
    // Description seeded into the create-ticket form (used when promoting an item
    // into a rigor board via a move, so the user only fills the missing fields).
    const [createTicketInitialDesc, setCreateTicketInitialDesc] = useState('')
    // When set, the next create-ticket submit MOVES this source item into the
    // target board (id preserved) instead of adding a brand-new ticket.
    const pendingMoveRef = useRef<{ item: ListEntry; targetListId: string } | null>(null)

    // The board ticket currently open in the detail editor (live from the store,
    // so edits reflect immediately).
    const selectedTicket = useMemo(
        () => (boardTicketId ? dataList.find((it) => it.id === boardTicketId) ?? null : null),
        [boardTicketId, dataList]
    )

    const pendingConfirmedInviteRef = useRef('')
    const pendingJoinConfirmationInviteRef = useRef('')
    const initialDeepLinkHandledRef = useRef(false)

    const joinConfirmationCopy = useMemo(() => ({
        invalidNotification: i18n.t('invite.notification.invalid'),
        busyNotification: i18n.t('invite.notification.alreadyJoining'),
        promptOpenNotification: i18n.t('invite.notification.finishPrompt'),
        title: i18n.t('invite.confirm.title'),
        sourceLink: (source: string) => i18n.t('invite.confirm.sourceLink', { source }),
        sourceManual: i18n.t('invite.confirm.sourceManual'),
        message: (sourceText: string, trustWarning: string) => (
            i18n.t('invite.confirm.message', { sourceText, trustWarning })
        ),
        untrustedWarning: i18n.t('invite.confirm.untrustedWarning'),
        sourceLabel: (sourceLabel: string) => (
            sourceLabel === 'the Listam app' ? i18n.t('invite.source.listamApp') : sourceLabel
        ),
    }), [i18n])

    const animate = useCallback(() => {
        if (!reduceMotion) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
        }
    }, [reduceMotion])

    // Query whether a backup password is set (gates joining). Also captures the
    // rolling-backup schedule.enabled so the foreground catch-up knows what to
    // re-assert.
    const refreshBackupPasswordSet = useCallback(async () => {
        try {
            const reply = await sendRPCWithReply(RPC_LIST_BACKUPS)
            const res = reply ? JSON.parse(reply) : null
            if (res?.ok) {
                setBackupPasswordSet(!!res.passwordSet)
                if (res.schedule && typeof res.schedule.enabled === 'boolean') {
                    backupScheduleEnabledRef.current = res.schedule.enabled
                }
            }
        } catch { /* leave as-is on failure */ }
    }, [sendRPCWithReply])

    const beginJoinWithInvite = useCallback((rawInvite: string) => {
        const invite = extractInviteFromInput(rawInvite)
        if (!invite) {
            snackbar.show(i18n.t('invite.notification.invalid'), 'error')
            return false
        }
        // Require a backup password before joining, so the current lists are
        // backed up first. (null = not yet known → don't block.)
        if (backupPasswordSet === false) {
            Alert.alert(
                i18n.t('backup.auto.setPassword'),
                i18n.t('backup.auto.joinNeedsPassword'),
                [
                    { text: i18n.t('common.cancel'), style: 'cancel' },
                    { text: i18n.t('lists.menu.title'), onPress: () => { setMenuInitialView('lists'); setPendingListSettingsId(null); setListsMenuVisible(true) } },
                ],
            )
            return false
        }
        if (!isWorkletReady) {
            pendingConfirmedInviteRef.current = invite
            return true
        }
        setIsJoining(true)
        setCurrentP2PMessage(0)
        isJoiningRef.current = true
        sendRPC(RPC_JOIN_KEY, JSON.stringify({ key: invite }))
        return true
    }, [backupPasswordSet, i18n, isJoiningRef, isWorkletReady, sendRPC, setIsJoining, snackbar])

    const presentJoinConfirmation = useCallback((request: JoinConfirmationRequest) => {
        if (request.status === 'invalid') {
            snackbar.show(request.notification || i18n.t('invite.notification.invalid'), 'error')
            return false
        }
        if (request.status === 'busy' || request.status === 'confirmation-open') {
            snackbar.show(request.notification || i18n.t('invite.notification.alreadyJoining'))
            return false
        }
        if (request.status === 'already-pending') return true

        pendingJoinConfirmationInviteRef.current = request.pendingInvite
        Alert.alert(
            request.title || i18n.t('invite.confirm.title'),
            request.message || '',
            [
                {
                    text: i18n.t('common.cancel'),
                    style: 'cancel',
                    onPress: () => {
                        const result = resolveJoinConfirmation(
                            pendingJoinConfirmationInviteRef.current,
                            request.invite,
                            false
                        )
                        pendingJoinConfirmationInviteRef.current = result.pendingInvite
                    },
                },
                {
                    text: i18n.t('common.join'),
                    style: 'default',
                    onPress: () => {
                        const result = resolveJoinConfirmation(
                            pendingJoinConfirmationInviteRef.current,
                            request.invite,
                            true
                        )
                        pendingJoinConfirmationInviteRef.current = result.pendingInvite
                        if (result.confirmedInvite) beginJoinWithInvite(result.confirmedInvite)
                    },
                },
            ]
        )
        return true
    }, [beginJoinWithInvite, i18n, snackbar])

    const requestJoinConfirmation = useCallback((rawInvite: string, source: 'link' | 'manual') => {
        return presentJoinConfirmation(createJoinConfirmationRequest(rawInvite, {
            source,
            pendingInvite: pendingJoinConfirmationInviteRef.current,
            isJoining: isJoiningRef.current,
            copy: joinConfirmationCopy,
        }))
    }, [isJoiningRef, joinConfirmationCopy, presentJoinConfirmation])

    useEffect(() => {
        AsyncStorage.multiGet([
            PREF_LOCALE_CHOICE,
            PREF_THEME_CHOICE,
            PREF_DEFAULT_LIST,
            PREF_BOARD_ENABLED,
            PREF_OVERVIEW_ENABLED,
            PREF_OVERVIEW_OPEN,
            PREF_DEVICE_NAME,
            PREF_BUILTIN_VIEWS,
        ]).then(([[, localeChoice], [, themeChoice], [, defaultList], [, boardEnabled], [, overviewEnabledRaw], [, overviewOpenRaw], [, deviceName], [, builtinViewsRaw]]) => {
            const parsedBuiltinViews = parseBuiltinViews(builtinViewsRaw)
            dispatch(preferencesActions.preferencesHydrated({
                ...(isLocaleChoice(localeChoice) ? { localeChoice } : {}),
                ...(isThemeChoice(themeChoice) ? { themeChoice } : {}),
                ...(defaultList !== null ? { defaultListId: defaultList } : {}),
                ...(boardEnabled === '1' || boardEnabled === '0' ? { boardEnabled: boardEnabled === '1' } : {}),
                ...(overviewEnabledRaw === '1' || overviewEnabledRaw === '0' ? { overviewEnabled: overviewEnabledRaw === '1' } : {}),
                ...(deviceName !== null ? { deviceName } : {}),
                ...(parsedBuiltinViews ? { builtinViews: parsedBuiltinViews } : {}),
            }))
            // Land back on the Overview when the user left it open. Decided here,
            // with both persisted values in hand, so it can't race the hydration
            // dispatch or the default-list restore (which only changes the list
            // UNDER the overlay).
            if (overviewEnabledRaw === '1' && overviewOpenRaw === '1') setOverviewVisible(true)
        })

        void prepareLoyaltyCards()
            .then(({ handles, warnings }) => {
                if (warnings.length > 0) appLogger.warn('Loyalty-card storage warnings', { warnings })
                dispatch(loyaltyCardsActions.loyaltyCardsHydrated(handles))
            })
            .catch((error) => {
                appLogger.error('Failed to hydrate loyalty-card handles', error)
                dispatch(loyaltyCardsActions.loyaltyCardsHydrated([]))
            })
    }, [dispatch])

    // Per-list view settings live on the list's synced registry meta-item.
    // writeListView re-emits the WHOLE meta-item (LWW replace) for the given list
    // with the patched view + a fresh updatedAt, so the per-board/list settings
    // screen can configure ANY list, not only the selected one.
    const writeListView = useCallback((listId: string, patch: Partial<RegistryListView>) => {
        const rec = lib.listsById[listId]
        if (!rec) return
        // Built-in surfaces share listId 'default' and have no registry meta-item,
        // so their view can't ride the synced registry (writing one would surface a
        // phantom list under the composite id). Persist it per-device instead, so
        // toggles like categories actually work on the built-in Spesa surface.
        if (isBuiltinSurfaceId(rec.id)) {
            const next = { ...builtinViews, [rec.id]: { ...(builtinViews[rec.id] ?? {}), ...patch } }
            dispatch(preferencesActions.builtinViewPatched({ surfaceId: rec.id, patch }))
            void AsyncStorage.setItem(PREF_BUILTIN_VIEWS, JSON.stringify(next))
            return
        }
        const now = Date.now()
        const view = { ...DEFAULT_VIEW, ...(rec.view ?? {}), ...patch }
        const meta = buildListMetaItem({
            id: rec.id,
            name: rec.name,
            type: rec.type,
            groupId: rec.groupId ?? null,
            order: rec.order ?? now,
            view,
            updatedAt: now,
        })
        sendRPC(RPC_UPDATE, JSON.stringify({ item: meta }))
    }, [lib, sendRPC, builtinViews, dispatch])

    // Rename a list/board: re-emit its meta-item with a new name (mirrors
    // handleRenameGroup). Preserves type/group/order/view.
    const handleRenameList = useCallback((listId: string, name: string) => {
        const rec = lib.listsById[listId]
        const trimmed = name.trim()
        if (!rec || !trimmed || trimmed === rec.name) return
        const now = Date.now()
        // A built-in surface has no registry meta-item; its rename syncs via the
        // surface-name label channel (keyed by the real listId+type), like desktop.
        if (isBuiltinSurfaceId(rec.id)) {
            const { listId: realId, listType } = decodeSurface(rec.id)
            sendRPC(RPC_UPDATE, JSON.stringify({ item: buildSurfaceLabelItem({ listId: realId, type: listType, name: trimmed, updatedAt: now }) }))
            return
        }
        const meta = buildListMetaItem({
            id: rec.id,
            name: trimmed,
            type: rec.type,
            groupId: rec.groupId ?? null,
            order: rec.order ?? now,
            view: rec.view,
            updatedAt: now,
        })
        sendRPC(RPC_UPDATE, JSON.stringify({ item: meta }))
    }, [lib, sendRPC])

    const handleToggleBoardEnabled = useCallback(() => {
        const next = !boardEnabled
        dispatch(preferencesActions.boardEnabledSet(next))
        AsyncStorage.setItem(PREF_BOARD_ENABLED, next ? '1' : '0')
    }, [boardEnabled, dispatch])

    // Show/hide the Overview surface AND persist it, so relaunches land where
    // the user left off. Persisting happens ONLY here (never from an effect —
    // a mount-time effect writer would race the multiGet restore above).
    const setOverviewShown = useCallback((next: boolean) => {
        setOverviewVisible(next)
        AsyncStorage.setItem(PREF_OVERVIEW_OPEN, next ? '1' : '0')
    }, [])

    const handleToggleOverviewEnabled = useCallback(() => {
        const next = !overviewEnabled
        dispatch(preferencesActions.overviewEnabledSet(next))
        AsyncStorage.setItem(PREF_OVERVIEW_ENABLED, next ? '1' : '0')
        // Turning the feature off also forgets the open state: re-enabling weeks
        // later must not relaunch straight into the Overview.
        if (!next) {
            setOverviewVisible(false)
            AsyncStorage.setItem(PREF_OVERVIEW_OPEN, '0')
        }
    }, [overviewEnabled, dispatch])

    // This device's own writer key. Prefer the owner-signed roster's isSelf
    // writer, but fall back to the raw local writer key (present once the base is
    // writable) so a device that isn't in the owner-signed writer set yet can
    // still advertise its synced peer label instead of staying silently nameless.
    const selfWriterKey = useMemo(
        () => membershipRoster?.writers.find((m) => m.isSelf)?.writerKey
            ?? membershipRoster?.localWriterKey
            ?? null,
        [membershipRoster],
    )

    // Write the synced peer-label for THIS device, keyed by our own writer key.
    // No-op until the self writer key is known. Empty name clears the label.
    const writePeerLabel = useCallback((name: string) => {
        if (!selfWriterKey) return
        const meta = buildPeerLabelItem({
            writerKey: selfWriterKey,
            name,
            updatedAt: Date.now(),
        })
        sendRPC(RPC_UPDATE, JSON.stringify({ item: meta }))
    }, [selfWriterKey, sendRPC])

    // Device-name input commit: persist the device-local pref AND publish the
    // synced peer-label. Trimmed + clamped to MAX_LABEL_NAME (mirrors desktop).
    const handleDeviceNameChange = useCallback((raw: string) => {
        const name = raw.trim().slice(0, MAX_LABEL_NAME)
        if (name === deviceName) return
        dispatch(preferencesActions.deviceNameSet(name))
        AsyncStorage.setItem(PREF_DEVICE_NAME, name)
        writePeerLabel(name)
    }, [deviceName, dispatch, writePeerLabel])

    // Re-assert the peer-label when the roster (and thus the self writer key)
    // becomes known, since at name-set time the key may have been unavailable.
    // Only when our stored name differs from what's already synced for us.
    useEffect(() => {
        if (!selfWriterKey || !deviceName) return
        if (peerLabels.get(selfWriterKey) === deviceName) return
        writePeerLabel(deviceName)
    }, [selfWriterKey, deviceName, peerLabels, writePeerLabel])

    const handleLocaleChoiceChange = useCallback((choice: LocaleChoice) => {
        dispatch(preferencesActions.localeChoiceSet(choice))
        AsyncStorage.setItem(PREF_LOCALE_CHOICE, choice)
    }, [dispatch])

    const handleThemeChoiceChange = useCallback((choice: ThemeChoice) => {
        dispatch(preferencesActions.themeChoiceSet(choice))
        AsyncStorage.setItem(PREF_THEME_CHOICE, choice)
    }, [dispatch])

    const handleCardScanned = useCallback((card: LoyaltyCard) => {
        void persistStoredLoyaltyCard(card)
            .then(({ handle, warnings }) => {
                if (warnings.length > 0) appLogger.warn('Loyalty-card save warnings', { warnings })
                dispatch(loyaltyCardsActions.loyaltyCardAdded(handle))
                snackbar.show(i18n.t('loyalty.notification.saved', { name: card.name }), 'success')
            })
            .catch((error) => {
                appLogger.error('Failed to save loyalty card', error)
                snackbar.show(i18n.t('loyalty.notification.saveFailed'), 'error')
            })
        setScannerVisible(false)
    }, [dispatch, i18n, snackbar])

    const handleDeleteCard = useCallback((id: string) => {
        void deleteStoredLoyaltyCard(id)
            .then(({ warnings }) => {
                if (warnings.length > 0) appLogger.warn('Loyalty-card delete warnings', { warnings })
                dispatch(loyaltyCardsActions.loyaltyCardRemoved(id))
            })
            .catch((error) => {
                appLogger.error('Failed to delete loyalty card', error)
                snackbar.show(i18n.t('loyalty.notification.deleteFailed'), 'error')
            })
    }, [dispatch, i18n, snackbar])

    const handleSelectCard = useCallback((card: LoyaltyCardHandle) => {
        void readStoredLoyaltyCard(card)
            .then((payload) => {
                if (payload) setSelectedCard(payload)
                else snackbar.show(i18n.t('loyalty.notification.loadFailed'), 'error')
            })
            .catch((error) => {
                appLogger.error('Failed to load loyalty card', error)
                snackbar.show(i18n.t('loyalty.notification.loadFailed'), 'error')
            })
    }, [i18n, snackbar])

    useEffect(() => {
        const handleIncomingUrl = (url: string | null) => {
            if (!url) return
            const request = planIncomingLinkJoin(url, {
                pendingInvite: pendingJoinConfirmationInviteRef.current,
                isJoining: isJoiningRef.current,
                copy: joinConfirmationCopy,
            })
            if (request) presentJoinConfirmation(request)
        }

        if (!initialDeepLinkHandledRef.current) {
            initialDeepLinkHandledRef.current = true
            Linking.getInitialURL()
                .then(handleIncomingUrl)
                .catch(() => {
                    // A missing/unreadable initial URL is non-fatal — nothing to join.
                })
        }

        const subscription = Linking.addEventListener('url', ({ url }) => {
            handleIncomingUrl(url)
        })

        return () => {
            subscription.remove()
        }
    }, [isJoiningRef, joinConfirmationCopy, presentJoinConfirmation])

    useEffect(() => {
        if (!isWorkletReady) return
        if (!pendingConfirmedInviteRef.current) return
        const invite = pendingConfirmedInviteRef.current
        pendingConfirmedInviteRef.current = ''
        beginJoinWithInvite(invite)
    }, [beginJoinWithInvite, isWorkletReady])

    // Learn whether a backup password is set once the worklet is up.
    useEffect(() => {
        if (!isWorkletReady) return
        void refreshBackupPasswordSet()
    }, [isWorkletReady, refreshBackupPasswordSet])

    // Foreground catch-up for rolling backups. A backend timer only fires while
    // the worklet is alive; iOS suspends it in the background. On each
    // background→active transition (only — not on every state change) we re-send
    // RPC_SET_BACKUP_SCHEDULE with the current enabled flag, which restarts the
    // backend scheduler; its catch-up pass writes any tier that came due while we
    // were suspended. Cheap and idempotent: skipped while disabled or not ready.
    const appStateRef = useRef(AppState.currentState)
    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            const prev = appStateRef.current
            appStateRef.current = next
            const cameToForeground = prev.match(/inactive|background/) && next === 'active'
            if (!cameToForeground || !isWorkletReady) return
            if (!backupScheduleEnabledRef.current) return
            sendRPC(RPC_SET_BACKUP_SCHEDULE, JSON.stringify({ enabled: true }))
            // Re-read so the ref (and any open Settings UI) reflects fresh lastAt.
            void refreshBackupPasswordSet()
        })
        return () => sub.remove()
    }, [isWorkletReady, sendRPC, refreshBackupPasswordSet])

    // Prompt once (ever) to set a backup password when none is set — it's
    // required before joining a shared list, to protect the current lists.
    const backupPromptShownRef = useRef(false)
    useEffect(() => {
        if (backupPasswordSet !== false || backupPromptShownRef.current) return
        backupPromptShownRef.current = true
        AsyncStorage.getItem(PREF_BACKUP_PROMPTED).then((seen) => {
            if (seen === '1') return
            void AsyncStorage.setItem(PREF_BACKUP_PROMPTED, '1')
            Alert.alert(
                i18n.t('backup.auto.setPassword'),
                i18n.t('backup.auto.required'),
                [
                    { text: i18n.t('common.cancel'), style: 'cancel' },
                    { text: i18n.t('lists.menu.title'), onPress: () => { setMenuInitialView('lists'); setPendingListSettingsId(null); setListsMenuVisible(true) } },
                ],
            )
        }).catch(() => { /* non-fatal */ })
    }, [backupPasswordSet, i18n])

    // Open the user's default list once on launch (per-device preference). A
    // legacy bare 'default' maps to the grocery built-in surface's composite id so
    // it resolves in the split nav (the three surfaces replaced raw 'default').
    const defaultLaunchedRef = useRef(false)
    useEffect(() => {
        if (!isWorkletReady || defaultLaunchedRef.current || !defaultListId) return
        defaultLaunchedRef.current = true
        const launchId = defaultListId === DEFAULT_LIST_ID
            ? `${DEFAULT_LIST_ID}:${DEFAULT_LIST_TYPE}`
            : defaultListId
        dispatch(listsActions.selectedListChanged({
            listId: launchId,
            listType: lib.listsById[launchId]?.type,
        }))
    }, [isWorkletReady, defaultListId, lib, dispatch])

    // Rotate P2P messages while joining
    useEffect(() => {
        if (!isJoining) return
        const interval = setInterval(() => {
            setCurrentP2PMessage((prev) => (prev + 1) % P2P_MESSAGE_KEYS.length)
        }, 3000)
        return () => clearInterval(interval)
    }, [isJoining])

    // Toggling done is two-phase while the Overview is enabled: the state flip
    // lands immediately IN PLACE (instant strikethrough, no row movement), and
    // the reorder + synced write settle TAP_SETTLE_MS later. Within the window
    // further taps keep flipping in place — a fast double-tap nets zero and
    // sends nothing — and a third tap is diverted to capture (captureToggle
    // cancels the pending settle). With the Overview disabled everything runs
    // in one shot, which is exactly the pre-Overview behavior.
    const pendingToggleRef = useRef(new Map<string, { originalIsDone: boolean; timer: ReturnType<typeof setTimeout> | null }>())

    const settleToggle = useCallback((key: string) => {
        const pending = pendingToggleRef.current.get(key)
        if (!pending) return
        pendingToggleRef.current.delete(key)
        if (pending.timer) clearTimeout(pending.timer)
        const list = selectSelectedListItems(store.getState())
        const index = list.findIndex((it) => toggleKeyOf(it) === key)
        if (index >= 0) {
            const current = list[index]
            // Net-zero (double-tap): nothing moved, nothing to sync.
            if (!!current.isDone === pending.originalIsDone) return
            animate()
            const newList = [...list]
            newList.splice(index, 1)
            if (current.isDone) newList.push(current)
            else newList.unshift(current)
            dispatch(listsActions.selectedListItemsReplaced(newList))
            sendRPC(RPC_UPDATE, JSON.stringify({ item: current }))
            return
        }
        // The row left the visible list mid-window (surface switch): still send
        // a net-nonzero flip so it is never local-only.
        const item = selectAllItems(store.getState()).find((it) => !isPlanItem(it) && toggleKeyOf(it) === key)
        if (item && !!item.isDone !== pending.originalIsDone) {
            sendRPC(RPC_UPDATE, JSON.stringify({ item }))
        }
    }, [animate, dispatch, sendRPC])

    // A triple-tap's first two taps flipped in place and netted zero — dropping
    // the pending settle restores "nothing happened" for them, with no write.
    const cancelPendingToggle = useCallback((item: ListEntry) => {
        const pending = pendingToggleRef.current.get(toggleKeyOf(item))
        if (!pending) return
        if (pending.timer) clearTimeout(pending.timer)
        pendingToggleRef.current.delete(toggleKeyOf(item))
    }, [])

    const handleToggleDone = useCallback((index: number) => {
        const current = dataList[index]
        if (!current) return

        const updatedItem: ListEntry = {
            ...current,
            isDone: !current.isDone,
            timeOfCompletion: !current.isDone ? Date.now() : 0,
            updatedAt: Date.now(),
        }

        if (!overviewEnabled) {
            animate()
            const newList = [...dataList]
            newList.splice(index, 1)
            if (updatedItem.isDone) {
                newList.push(updatedItem)
            } else {
                newList.unshift(updatedItem)
            }
            dispatch(listsActions.selectedListItemsReplaced(newList))
            sendRPC(RPC_UPDATE, JSON.stringify({ item: updatedItem }))
            return
        }

        dispatch(listsActions.listItemUpdated(updatedItem))
        const key = toggleKeyOf(current)
        const pending = pendingToggleRef.current.get(key) ?? { originalIsDone: !!current.isDone, timer: null }
        if (pending.timer) clearTimeout(pending.timer)
        pending.timer = setTimeout(() => settleToggle(key), TAP_SETTLE_MS)
        pendingToggleRef.current.set(key, pending)
    }, [dataList, overviewEnabled, animate, dispatch, sendRPC, settleToggle])

    // The list-view row cadence (ListItem) disambiguates single/double/triple
    // taps before it calls back, so a resolved toggle is one-shot: flip, reorder,
    // sync. It fires up to TRIPLE_TAP_MS AFTER the tap, so it must NOT trust a
    // snapshot captured at tap time — resolve against the LIVE list and match by
    // identity (mirrors settleToggle) so a peer add / a swipe-delete / a second
    // toggle landing inside that window is neither clobbered nor resurrected. The
    // row passes the item (not an index) precisely because the index goes stale.
    const handleRowToggleDone = useCallback((item: ListEntry) => {
        const key = toggleKeyOf(item)
        const list = selectSelectedListItems(store.getState())
        const index = list.findIndex((it) => toggleKeyOf(it) === key)
        if (index < 0) return // the row was deleted during the tap window — do nothing
        const current = list[index]
        const updatedItem: ListEntry = {
            ...current,
            isDone: !current.isDone,
            timeOfCompletion: !current.isDone ? Date.now() : 0,
            updatedAt: Date.now(),
        }
        animate()
        const newList = [...list]
        newList.splice(index, 1)
        if (updatedItem.isDone) newList.push(updatedItem)
        else newList.unshift(updatedItem)
        dispatch(listsActions.selectedListItemsReplaced(newList))
        sendRPC(RPC_UPDATE, JSON.stringify({ item: updatedItem }))
    }, [animate, dispatch, sendRPC])

    const handleDelete = useCallback((index: number) => {
        const deletedItem = dataList[index]
        if (!deletedItem) return
        animate()
        dispatch(listsActions.listItemDeleted(deletedItem))
        sendRPC(RPC_DELETE, JSON.stringify({ item: deletedItem }))
    }, [animate, dataList, dispatch, sendRPC])

    const handleInsert = useCallback((_index: number, text: string, rates?: { valueRate: number; delayRate: number }) => {
        // Scope the add to the list currently in view. With a bare-string payload
        // the backend files every item under DEFAULT_LIST_ID, so additions to any
        // other list silently land in (and only ever show up on) the default list.
        const listType = lib.listsById[currentId]?.type || DEFAULT_LIST_TYPE
        // A shared list's writes carry its baseKey so the backend routes them to
        // that base (UPDATE/DELETE/MOVE already carry it on the item).
        const baseKey = lib.listsById[currentId]?.baseKey || undefined
        // A built-in surface's nav id is composite ('default:type'); the item must
        // be written to the REAL 'default' bucket (with the surface's listType),
        // never to a 'default:type' listId.
        const listId = decodeSurface(currentId).listId
        sendRPC(RPC_ADD, JSON.stringify({ text, listId, listType, baseKey, ...(rates ? { valueRate: rates.valueRate, delayRate: rates.delayRate } : {}) }))
    }, [sendRPC, lib, currentId])

    const handleEditItem = useCallback((index: number, newText: string) => {
        const old = dataList[index]
        if (!old) return
        const trimmed = newText.trim()
        if (!trimmed || trimmed === old.text) return
        if (dataList.some((item, i) => i !== index && item.text === trimmed)) {
            snackbar.show(i18n.t('main.notification.duplicateEdit'), 'error')
            return
        }
        animate()
        // Rename is an in-place update, not delete+add: it preserves the item's
        // stable id (so duplicate-name convergence holds), its done state, and its
        // position. The id rides along in `...old` even for backfilled legacy items.
        const updatedItem = { ...old, text: trimmed, updatedAt: Date.now() }
        dispatch(listsActions.listItemUpdated(updatedItem))
        sendRPC(RPC_UPDATE, JSON.stringify({ item: updatedItem }))
    }, [animate, dataList, dispatch, i18n, sendRPC, snackbar])

    // --- day plan (Overview) ------------------------------------------------
    // Plan entries are synced meta-items keyed on a deterministic ref; every
    // write upserts via RPC_UPDATE (an empty plannedFor clears the entry), with
    // an optimistic listItemUpdated that the listsSlice files into itemsById.
    const writePlan = useCallback((entry: ListEntry) => {
        dispatch(listsActions.listItemUpdated(entry))
        sendRPC(RPC_UPDATE, JSON.stringify({ item: entry }))
    }, [dispatch, sendRPC])

    const clearPlanRef = useCallback((ref: string) => {
        const rec = planRecords.get(ref)
        if (!rec) return
        writePlan(buildPlanItem({ id: ref, kind: rec.kind, refListId: rec.refListId, refItemId: rec.refItemId, refType: rec.refType, plannedFor: '', planOrder: rec.planOrder, updatedAt: Date.now() }) as unknown as ListEntry)
    }, [planRecords, writePlan])

    const flagItemForDay = useCallback((item: ListEntry, dateKey: string) => {
        if (!item.id || !item.listId) return
        writePlan(buildItemPlanEntry({ listId: item.listId, itemId: item.id, plannedFor: dateKey, planOrder: Date.now(), updatedAt: Date.now() }) as unknown as ListEntry)
    }, [writePlan])

    // Re-home a plan entry onto another day (the Overview "move to today" on a
    // carried-over row). Upserts the same ref with a new plannedFor.
    const movePlanForRef = useCallback((ref: string, dateKey: string) => {
        const rec = planRecords.get(ref)
        if (!rec || rec.plannedFor === dateKey) return
        writePlan(buildPlanItem({ id: ref, kind: rec.kind, refListId: rec.refListId, refItemId: rec.refItemId, refType: rec.refType, plannedFor: dateKey, planOrder: Date.now(), updatedAt: Date.now() }) as unknown as ListEntry)
    }, [planRecords, writePlan])

    const toggleItemPlan = useCallback((item: ListEntry) => {
        const ref = planItemKey(item.listId ?? '', item.id ?? '')
        if (plannedRefs.has(ref)) clearPlanRef(ref)
        else flagItemForDay(item, toDateKey(Date.now()))
    }, [plannedRefs, clearPlanRef, flagItemForDay])

    // Single entry point for every capture gesture (triple-tap, swipe-right,
    // plan-sheet action): toggles plan membership for TODAY with a haptic and
    // an undoable snackbar. The undo closure is self-contained — it restores
    // the exact prior record (or clears the fresh one) via writePlan, so it
    // stays correct even though the surrounding memos have moved on by then.
    const captureToggle = useCallback((item: ListEntry) => {
        cancelPendingToggle(item)
        const ref = planItemKey(item.listId ?? '', item.id ?? '')
        const prev = planRecords.get(ref)
        toggleItemPlan(item)
        if (prev) haptics.toggleOff()
        else haptics.toggleOn()
        const undo = () => {
            if (prev) {
                writePlan(buildPlanItem({ id: ref, kind: prev.kind, refListId: prev.refListId, refItemId: prev.refItemId, refType: prev.refType, plannedFor: prev.plannedFor, planOrder: prev.planOrder, updatedAt: Date.now() }) as unknown as ListEntry)
            } else {
                writePlan(buildPlanItem({ id: ref, kind: 'item', refListId: item.listId ?? '', refItemId: item.id ?? '', refType: '', plannedFor: '', planOrder: Date.now(), updatedAt: Date.now() }) as unknown as ListEntry)
            }
        }
        snackbar.show(
            i18n.t(prev ? 'plan.removedFromOverview' : 'plan.addedToOverview'),
            'success',
            { label: i18n.t('plan.undo'), onPress: undo },
        )
    }, [cancelPendingToggle, planRecords, toggleItemPlan, writePlan, snackbar, i18n])

    const handleFlagToday = useCallback((index: number) => {
        const item = dataList[index]
        if (item) captureToggle(item)
    }, [dataList, captureToggle])

    const handlePlanFor = useCallback((item: ListEntry) => setPlanSheetItem(item), [])

    const isItemPlanned = useCallback(
        (item: ListEntry) => plannedRefs.has(planItemKey(item.listId ?? '', item.id ?? '')),
        [plannedRefs],
    )

    // Marking done / editing a row from the Overview writes through to the SOURCE.
    const toggleSourceDone = useCallback((item: ListEntry) => {
        const updated: ListEntry = { ...item, isDone: !item.isDone, timeOfCompletion: !item.isDone ? Date.now() : 0, updatedAt: Date.now() }
        dispatch(listsActions.listItemUpdated(updated))
        sendRPC(RPC_UPDATE, JSON.stringify({ item: updated }))
    }, [dispatch, sendRPC])

    const editPlanItemText = useCallback((item: ListEntry, text: string) => {
        const trimmed = text.trim()
        if (!trimmed || trimmed === item.text) return
        const updated: ListEntry = { ...item, text: trimmed, updatedAt: Date.now() }
        dispatch(listsActions.listItemUpdated(updated))
        sendRPC(RPC_UPDATE, JSON.stringify({ item: updated }))
    }, [dispatch, sendRPC])

    // Plan records store the REAL listId ('default' for built-in surfaces), but
    // nav + names key off the composite surface id ('default:shopping' …), so
    // re-encode before any lookup or selection.
    const planNavId = useCallback((listId: string, type: string) => {
        const canonical = isBoardType(type) ? BOARD_LIST_TYPE : type
        return listId === DEFAULT_LIST_ID ? surfaceLabelKey(listId, canonical) : listId
    }, [])

    const planListName = useCallback((listId: string, type: string) => {
        const navId = planNavId(listId, type)
        const rec = lib.listsById[navId]
        if (rec?.name) return rec.name
        if (isBuiltinSurfaceId(navId)) return i18n.t(builtinSurfaceNameKey(decodeSurface(navId).listType))
        return lib.listsById[listId]?.name ?? listId
    }, [planNavId, lib, i18n])

    const openListFromOverview = useCallback((listId: string, type: string) => {
        const navId = planNavId(listId, type)
        setOverviewShown(false)
        dispatch(listsActions.selectedListChanged({ listId: navId, listType: lib.listsById[navId]?.type ?? type }))
    }, [planNavId, lib, dispatch, setOverviewShown])

    const planSheetRef = planSheetItem ? planItemKey(planSheetItem.listId ?? '', planSheetItem.id ?? '') : ''

    // Drag-to-category: pin the dragged item to the dropped-on category. The
    // override rides along the same update path as a rename, so it survives the
    // reducer round-trip and replicates to peers. We also remember the choice by
    // item name, so the next time the same item is added it lands here too.
    const handleAssignCategory = useCallback((item: ListEntry, canonicalKey: string) => {
        const target = identityKey(item)
        const current = dataList.find((entry) => identityKey(entry) === target)
        if (!current || current.categoryOverride === canonicalKey) return
        animate()
        const updatedItem = { ...current, categoryOverride: canonicalKey, updatedAt: Date.now() }
        dispatch(listsActions.listItemUpdated(updatedItem))
        sendRPC(RPC_UPDATE, JSON.stringify({ item: updatedItem }))
        learnCategory(current.text, canonicalKey, i18n.groceryLocale)
        haptics.success()
        snackbar.show(i18n.t('main.drag.moved', {
            item: current.text,
            category: getDisplayCategoryName(canonicalKey, i18n.groceryLocale),
        }))
    }, [animate, dataList, dispatch, i18n, learnCategory, sendRPC, snackbar])

    // Drag-to-delete: dropping a picked-up item on the trash zone removes it.
    const handleDeleteDragged = useCallback((item: ListEntry) => {
        const target = identityKey(item)
        const current = dataList.find((entry) => identityKey(entry) === target)
        if (!current) return
        animate()
        dispatch(listsActions.listItemDeleted(current))
        sendRPC(RPC_DELETE, JSON.stringify({ item: current }))
        haptics.delete()
    }, [animate, dataList, dispatch, sendRPC])

    // Drag-to-reorder: dropping on the "move to top/bottom" zone re-ranks the item
    // within its display group via the shared `order` field (computeReorder picks
    // midpoints / renormalizes). With categories on, the group is the item's
    // category section (groupByCategory reorders, so re-apply sortByOrder); else
    // it's the whole list. Each changed item rides the normal LWW update path.
    const handleReorderToEdge = useCallback((item: ListEntry, edge: 'top' | 'bottom') => {
        const target = identityKey(item)
        let group: ListEntry[]
        if (categoriesEnabled) {
            const section = groupByCategory(dataList, i18n.groceryLocale)
                .find((s) => s.items.some((x) => identityKey(x.entry) === target))
            group = sortByOrder(section ? section.items.map((x) => x.entry) : dataList)
        } else {
            group = dataList
        }
        const fromIndex = group.findIndex((entry) => identityKey(entry) === target)
        if (fromIndex < 0) return
        const { updates } = computeReorder(group, fromIndex, edge === 'top' ? 0 : group.length - 1)
        if (updates.length === 0) return
        animate()
        const ts = Date.now()
        for (const update of updates) {
            const updatedItem = { ...update, updatedAt: ts }
            dispatch(listsActions.listItemUpdated(updatedItem))
            sendRPC(RPC_UPDATE, JSON.stringify({ item: updatedItem }))
        }
        haptics.success()
    }, [animate, categoriesEnabled, dataList, dispatch, i18n, sendRPC])

    // Clear the completed items from a specific list (the action now lives in
    // that list's settings rather than a bottom bar, so it must target listId,
    // not the visible list — mirrors handleDeleteListItems).
    const handleClearListCompleted = useCallback((listId: string) => {
        const items = selectItemsForList(store.getState(), listId)
        const done = items.filter((item) => item.isDone)
        if (done.length === 0) return
        animate()
        done.forEach((item) => sendRPC(RPC_DELETE, JSON.stringify({ item })))
        dispatch(listsActions.selectedListItemsReplaced({
            listId,
            listType: lib.listsById[listId]?.type,
            items: items.filter((item) => !item.isDone),
        }))
        haptics.success()
    }, [animate, dispatch, lib, sendRPC])

    // When a board list opens, fetch its owner-signed config (rigor mode + states).
    useEffect(() => {
        if (isWorkletReady && isBoard) sendRPC(RPC_GET_BOARD_CONFIG)
    }, [isWorkletReady, isBoard, currentId, sendRPC])

    const handleOpenTicket = useCallback((ticket: ListEntry) => {
        if (ticket.id) setBoardTicketId(ticket.id)
    }, [])

    // Board tickets are created with their rigor fields so the backend's gate
    // accepts them. The backend stamps id/createdBy/status and echoes the canonical
    // item back, which lands in the store via the add-from-backend path.
    // Move the open item to a chosen destination (listId, type). The backend
    // decomposes the move into add+delete (different listId) or a single in-place
    // type flip (same listId), so the existing FROM_BACKEND echoes update the
    // store with no new reducer. Promoting into a rigor board first collects the
    // required ticket fields via the create form (see pendingMoveRef).
    const handleMove = useCallback((targetListId: string, targetType: string) => {
        const item = moveTarget
        if (!item) return
        setMoveTarget(null)
        const sameSurface = item.listId === targetListId && (
            isBoardType(item.listType) ? isBoardType(targetType)
                : isTodoType(item.listType) ? isTodoType(targetType)
                    : (!isBoardType(targetType) && !isTodoType(targetType))
        )
        if (sameSurface) return
        if (isBoardType(targetType) && boardConfig.rigorOn && validateTicketDraft(item, boardConfig).missing.length > 0) {
            pendingMoveRef.current = { item, targetListId }
            setCreateTicketInitialDesc(item.text)
            setCreateTicketVisible(true)
            return
        }
        sendRPC(RPC_MOVE, JSON.stringify({
            item,
            targetListId,
            targetListType: isBoardType(targetType) ? BOARD_WRITE_TYPE : targetType,
        }))
        haptics.success()
    }, [moveTarget, boardConfig, sendRPC])

    const handleCreateTicket = useCallback((draft: TicketDraft) => {
        const pending = pendingMoveRef.current
        if (pending) {
            // Promote-into-board move: relocate the existing item (id preserved)
            // and supply the rigor fields the form collected.
            pendingMoveRef.current = null
            const valueFields = draft.valueRate != null && draft.delayRate != null ? { valueRate: draft.valueRate, delayRate: draft.delayRate } : {}
            sendRPC(RPC_MOVE, JSON.stringify({
                item: pending.item,
                targetListId: pending.targetListId,
                targetListType: BOARD_WRITE_TYPE,
                fields: {
                    status: 'todo',
                    description: draft.description,
                    checklist: draft.checklist,
                    estimatedHours: draft.estimatedHours,
                    estimatedComplexity: draft.estimatedComplexity,
                    ...valueFields,
                },
            }))
        } else {
            const valueFields = draft.valueRate != null && draft.delayRate != null ? { valueRate: draft.valueRate, delayRate: draft.delayRate } : {}
            sendRPC(RPC_ADD, JSON.stringify({
                text: draft.description,
                listId: currentId,
                listType: BOARD_WRITE_TYPE,
                status: 'todo',
                description: draft.description,
                checklist: draft.checklist,
                estimatedHours: draft.estimatedHours,
                estimatedComplexity: draft.estimatedComplexity,
                ...valueFields,
            }))
        }
        setCreateTicketVisible(false)
        setCreateTicketInitialDesc('')
        haptics.success()
    }, [currentId, sendRPC])

    // Field/block edits: merge the patch, dispatch for instant UI, then sync. LWW
    // by updatedAt, so the bump guarantees the write is never dropped.
    const handleUpdateTicket = useCallback((patch: Record<string, unknown>) => {
        if (!selectedTicket) return
        const updated = { ...selectedTicket, ...patch, updatedAt: Date.now() } as ListEntry
        dispatch(listsActions.listItemUpdated(updated))
        sendRPC(RPC_UPDATE, JSON.stringify({ item: updated }))
    }, [selectedTicket, dispatch, sendRPC])

    // Status moves go through buildStatusChange; the backend freezes the
    // time-in-progress + timeliness fields and echoes them back.
    const handleChangeTicketStatus = useCallback((statusId: string) => {
        if (!selectedTicket) return
        const change = buildStatusChange(selectedTicket, statusId)
        if (!change) return
        dispatch(listsActions.listItemUpdated(change))
        sendRPC(RPC_UPDATE, JSON.stringify({ item: change }))
        haptics.toggleOn()
    }, [selectedTicket, dispatch, sendRPC])

    const handleRequestAdd = useCallback(() => {
        // A board ticket needs its rigor fields, so the plain add bar can't create
        // one — route every add entry point (FAB, empty-state, double-tap) to the
        // ticket create form instead.
        if (isBoard) {
            setCreateTicketVisible(true)
            return
        }
        setAddText('')
        setIsAdding(true)
    }, [isBoard])

    const handleSelectList = useCallback((listId: string, type: string) => {
        dispatch(listsActions.selectedListChanged({ listId, listType: type }))
        setListsMenuVisible(false)
    }, [dispatch])

    // Toggle a list's launch-default flag (set it, or clear back to "first list"
    // if it's already the default). This now lives only in each list's settings.
    const handleSetDefaultList = useCallback((listId: string) => {
        const next = defaultListId === listId ? null : listId
        dispatch(preferencesActions.defaultListIdSet(next))
        if (next === null) AsyncStorage.removeItem(PREF_DEFAULT_LIST)
        else AsyncStorage.setItem(PREF_DEFAULT_LIST, next)
    }, [defaultListId, dispatch])

    // A new list is a registry meta-item (synced via the normal item pipeline)
    // plus selecting it (which materializes its empty ListRecord).
    const handleCreateList = useCallback((type: string) => {
        const id = `list-${Date.now().toString(36)}`
        const now = Date.now()
        const isGrocery = !isBoardType(type) && !isTodoType(type)
        const name = isBoardType(type)
            ? i18n.t('lists.menu.newBoard')
            : isTodoType(type)
                ? i18n.t('lists.menu.newTodo')
                : i18n.t('lists.menu.newGrocery')
        // New grocery lists ship lean: categories off by default (the user can
        // re-enable per-list from list settings). User-created lists carry a real
        // registry meta-item, so unlike the built-in surfaces this override sticks.
        const meta = buildListMetaItem({
            id, name, type, groupId: null, order: now, updatedAt: now,
            ...(isGrocery ? { view: { ...DEFAULT_VIEW, categoriesEnabled: false } } : {}),
        })
        sendRPC(RPC_UPDATE, JSON.stringify({ item: meta }))
        dispatch(listsActions.selectedListChanged({ listId: id, listType: type }))
        setListsMenuVisible(false)
    }, [dispatch, i18n, sendRPC])

    // Groups are registry meta-items too (synced). Rename re-emits the whole
    // group meta-item with the same id (LWW replace by updatedAt).
    const handleCreateGroup = useCallback(() => {
        const id = `group-${Date.now().toString(36)}`
        const now = Date.now()
        const meta = buildGroupMetaItem({ id, name: i18n.t('lists.menu.newGroupDefault'), order: now, updatedAt: now })
        sendRPC(RPC_UPDATE, JSON.stringify({ item: meta }))
    }, [i18n, sendRPC])

    const handleRenameGroup = useCallback((groupId: string, name: string) => {
        const trimmed = name.trim()
        if (!trimmed) return
        const g = groupedLists.find((x) => x.group.id === groupId)?.group
        const now = Date.now()
        const meta = buildGroupMetaItem({ id: groupId, name: trimmed, order: now, updatedAt: now })
        if (g) sendRPC(RPC_UPDATE, JSON.stringify({ item: meta }))
    }, [groupedLists, sendRPC])

    // Move a list into another group (or Ungrouped) by re-emitting its full meta
    // with a new groupId, appended to the end of the destination group's order.
    const handleMoveListToGroup = useCallback((listId: string, groupId: string | null) => {
        const moving = lib.listsById[listId]
        if (!moving) return
        if ((moving.groupId ?? null) === groupId) return
        // A built-in surface's group placement syncs via the BUILTIN-GROUP channel
        // (empty groupId = back to Ungrouped/general), not a registry meta-item.
        if (isBuiltinSurfaceId(moving.id)) {
            const { listId: realId, listType } = decodeSurface(moving.id)
            sendRPC(RPC_UPDATE, JSON.stringify({ item: buildBuiltinGroupItem({ listId: realId, type: listType, groupId: groupId ?? '', updatedAt: Date.now() }) }))
            return
        }
        const destId = groupId ?? UNGROUPED_GROUP_ID
        const dest = groupedLists.find((x) => x.group.id === destId)
        const maxOrder = Math.max(0, ...(dest?.lists.map((l) => l.order ?? 0) ?? []))
        const now = Date.now()
        const meta = buildListMetaItem({
            id: moving.id,
            name: moving.name,
            type: moving.type,
            groupId,
            order: maxOrder + 1,
            view: moving.view,
            updatedAt: now,
        })
        sendRPC(RPC_UPDATE, JSON.stringify({ item: meta }))
    }, [lib, groupedLists, sendRPC])

    const handleSubmitAdd = useCallback(() => {
        const value = addText.trim()
        if (!value) return
        if (dataList.some((item) => item.text === value)) {
            snackbar.show(i18n.t('main.notification.duplicateAdd'))
            setAddText('')
            return
        }
        // On a value-return surface, rating is mandatory: defer to the rating
        // sheet, which finishes the add with the chosen value + delay.
        const { listId, listType } = decodeSurface(currentId)
        if (isValueOn(listId, lib.listsById[currentId]?.type || listType)) {
            setValueRateAdd(value)
            setAddText('')
            return
        }
        handleInsert(0, value)
        haptics.toggleOn()
        setAddText('')
    }, [addText, dataList, handleInsert, i18n, snackbar, currentId, lib, isValueOn])

    // Double-tap an empty part of the list to open the add bar. The handler runs
    // during the responder-negotiation bubble: an item or button that handles the
    // tap claims the responder deeper in the tree and stops the bubble before it
    // reaches this wrapper, so only taps on blank space are ever observed here. We
    // always return false (never become the responder), leaving scrolling and item
    // gestures untouched.
    //
    // Known limitation: while a non-empty list is still momentum-scrolling, the
    // ScrollView captures the next touch-start (to halt momentum) before the
    // bubble reaches us, so a fast double-FLICK's second tap can be missed. A
    // deliberate double-tap on a settled list is unaffected, and the empty-list
    // case (the primary target) never scrolls. We don't disable that capture
    // because it would break tap-to-stop-momentum.
    const lastBackgroundTapRef = useRef(0)
    const handleBackgroundTap = useCallback(() => {
        if (isAdding) return false
        const now = Date.now()
        if (now - lastBackgroundTapRef.current < DOUBLE_TAP_MS) {
            lastBackgroundTapRef.current = 0
            handleRequestAdd()
        } else {
            lastBackgroundTapRef.current = now
        }
        return false
    }, [isAdding, handleRequestAdd])

    // Mint a whole-project invite and offer it via the OS share sheet. Whoever
    // joins it gets EVERY list in this project — distinct from handleShareList
    // below, which shares one list only. The backend answers over the
    // invite-key event (not an RPC reply), so park a pending flag here and
    // finish in the effect below once the key lands in the store.
    const shareProjectPendingRef = useRef(false)
    const handleShareProject = useCallback(() => {
        shareProjectPendingRef.current = true
        // Clear any stale key first: re-minting can return the same invite, and
        // an unchanged store value would never re-trigger the effect below.
        dispatch(syncActions.autobaseInviteKeySet(''))
        sendRPC(RPC_CREATE_INVITE)
        // The backend replies with an empty key when this device may not mint
        // (only the project owner can create invites) — indistinguishable from
        // "still working" here, so time out with the roster's best explanation.
        const ownerOnly = membershipRoster ? !membershipRoster.canAdminister : false
        setTimeout(() => {
            if (!shareProjectPendingRef.current) return
            shareProjectPendingRef.current = false
            snackbar.show(i18n.t(ownerOnly ? 'invite.share.ownerOnly' : 'invite.share.notReady'), 'error')
        }, ownerOnly ? 4000 : 10000)
    }, [dispatch, sendRPC, i18n, snackbar, membershipRoster])

    useEffect(() => {
        if (!shareProjectPendingRef.current || !autobaseInviteKey) return
        shareProjectPendingRef.current = false
        void Share.share({
            title: i18n.t('invite.share.title'),
            message: i18n.t('invite.share.message', { inviteKey: autobaseInviteKey }),
        }).catch(() => snackbar.show(i18n.t('invite.share.failed'), 'error'))
    }, [autobaseInviteKey, i18n, snackbar])

    // Promote ONE list to its own shared base and offer its co-edit invite via
    // the OS share sheet. Others who join this invite get only this list.
    const handleShareList = useCallback(async (listId: string) => {
        // The built-in surfaces share the 'default' base and can't be promoted to
        // their own shared base (desktop blocks this too).
        if (decodeSurface(listId).listId === DEFAULT_LIST_ID) {
            snackbar.show(i18n.t('shareList.failed'), 'error')
            return
        }
        let result: { ok?: boolean; invite?: string } | null = null
        try {
            const reply = await sendRPCWithReply(RPC_SHARE_LIST, JSON.stringify({ listId }))
            result = reply ? JSON.parse(reply) : null
        } catch { result = null }
        if (!result || !result.ok || !result.invite) {
            snackbar.show(i18n.t('shareList.failed'), 'error')
            return
        }
        try {
            await Share.share({
                message: `${i18n.t('shareList.message')}\n\n${result.invite}`,
                title: i18n.t('shareList.title'),
            })
        } catch {
            snackbar.show(i18n.t('shareList.failed'), 'error')
        }
    }, [sendRPCWithReply, i18n, snackbar])

    // Additively join ONE shared list via its invite (NOT the destructive
    // whole-project join). The rest of your lists stay private.
    const handleJoinList = useCallback(async (invite: string) => {
        const value = (invite || '').trim().replace(/\s+/g, '')
        if (!value) {
            snackbar.show(i18n.t('invite.notification.emptyManual'), 'error')
            return
        }
        let result: { ok?: boolean } | null = null
        try {
            const reply = await sendRPCWithReply(RPC_JOIN_LIST, JSON.stringify({ invite: value }))
            result = reply ? JSON.parse(reply) : null
        } catch { result = null }
        snackbar.show(
            result && result.ok ? i18n.t('joinList.joined') : i18n.t('joinList.failed'),
            result && result.ok ? 'success' : 'error',
        )
    }, [sendRPCWithReply, i18n, snackbar])

    const handleJoin = useCallback(() => {
        setJoinMode('project')
        setJoinDialogVisible(true)
    }, [])

    // Open the same paste-an-invite dialog, but in single-list ('list') mode so
    // submitting joins one shared list additively instead of replacing the base.
    const handleOpenJoinList = useCallback(() => {
        setJoinMode('list')
        setJoinDialogVisible(true)
    }, [])

    const handleManageMembers = useCallback(() => {
        setMembersDialogVisible(true)
        sendRPC(RPC_GET_MEMBERS)
    }, [sendRPC])

    const handleRemoveMember = useCallback((writerKey: string) => {
        sendRPC(RPC_REMOVE_MEMBER, JSON.stringify({ writerKey }))
    }, [sendRPC])

    const handleRevealRecoveryCode = useCallback(() => {
        sendRPC(RPC_GET_OWNER_RECOVERY_CODE)
    }, [sendRPC])

    const handleRecoverOwnership = useCallback(() => {
        const code = recoverCodeInput.trim()
        if (!code) {
            snackbar.show(i18n.t('members.recovery.emptyCode'), 'error')
            return
        }
        sendRPC(RPC_RECOVER_OWNER, JSON.stringify({ code }))
        setRecoverCodeInput('')
    }, [i18n, recoverCodeInput, sendRPC, snackbar])

    const handleCloseMembers = useCallback(() => {
        setMembersDialogVisible(false)
        setRecoverCodeInput('')
        clearOwnerRecoveryCode()
    }, [clearOwnerRecoveryCode])

    const handleOpenOwnedDevices = useCallback(() => {
        setOwnedDevicesVisible(true)
        sendRPC(RPC_CONTROL_LIST)
    }, [sendRPC])

    const handlePairOwnedDevice = useCallback((code: string, name: string) => {
        sendRPC(RPC_CONTROL_PAIR, JSON.stringify({ code, name }))
    }, [sendRPC])

    const handleOwnedDeviceStatus = useCallback((serverPublicKeyHex: string) => {
        sendRPC(RPC_CONTROL_COMMAND, JSON.stringify({ serverPublicKeyHex, command: 'status' }))
    }, [sendRPC])

    const handleOpenLeafPairing = useCallback(() => {
        setLeafPairingVisible(true)
        // Refresh the paired-hub list so the dialog can pick one to read the
        // leaf bridge's control key + address from.
        sendRPC(RPC_CONTROL_LIST)
    }, [sendRPC])

    const handleJoinSubmit = useCallback(() => {
        if (!joinKeyInput.trim()) {
            snackbar.show(i18n.t('invite.notification.emptyManual'), 'error')
            return
        }
        if (joinMode === 'list') {
            // Additive single-list join (no base swap → no confirmation/backup gate).
            void handleJoinList(joinKeyInput)
            setJoinDialogVisible(false)
            setJoinKeyInput('')
            return
        }
        const didRequestJoin = requestJoinConfirmation(joinKeyInput, 'manual')
        if (!didRequestJoin) return
        setJoinDialogVisible(false)
        setJoinKeyInput('')
    }, [i18n, joinKeyInput, joinMode, handleJoinList, requestJoinConfirmation, snackbar])

    const handleJoinCancel = useCallback(() => {
        setJoinDialogVisible(false)
        setJoinKeyInput('')
    }, [])

    const handleJoiningCancel = useCallback(() => {
        setIsJoining(false)
        isJoiningRef.current = false
    }, [setIsJoining, isJoiningRef])

    const handleDeleteListItems = useCallback((listId: string) => {
        Alert.alert(
            i18n.t('main.deleteAll.title'),
            i18n.t('main.deleteAll.message'),
            [
                { text: i18n.t('common.cancel'), style: 'cancel' },
                {
                    text: i18n.t('main.deleteAll.action'),
                    style: 'destructive',
                    onPress: () => {
                        const items = selectItemsForList(store.getState(), listId)
                        if (items.length === 0) return
                        animate()
                        items.forEach((item) => sendRPC(RPC_DELETE, JSON.stringify({ item })))
                        dispatch(listsActions.selectedListItemsReplaced({
                            listId,
                            listType: lib.listsById[listId]?.type,
                            items: [],
                        }))
                        haptics.delete()
                    },
                },
            ]
        )
    }, [animate, dispatch, i18n, lib, sendRPC])

    // Delete a whole named list (registry tombstone + cascade its items), mirrors
    // desktop's deleteList. Built-in surfaces (Groceries/Board/Todo) share the
    // 'default' bucket and have no registry meta-item, so they can't be deleted —
    // only cleared; the button is hidden for them and this bails as a safety net.
    const handleDeleteList = useCallback((listId: string) => {
        const rec = lib.listsById[listId]
        if (!rec || isBuiltinSurfaceId(listId)) return
        Alert.alert(
            i18n.t('main.deleteList.title'),
            i18n.t('main.deleteList.message'),
            [
                { text: i18n.t('common.cancel'), style: 'cancel' },
                {
                    text: i18n.t('main.deleteList.action'),
                    style: 'destructive',
                    onPress: () => {
                        animate()
                        // Cascade the items FIRST, while the list's base is still
                        // routed — the registry tombstone can trigger a shared-base
                        // reconcile that closes the base and would strand later writes.
                        const items = selectItemsForList(store.getState(), listId)
                        items.forEach((item) => sendRPC(RPC_DELETE, JSON.stringify({ item })))
                        // Soft-delete tombstone: reduceRegistry drops regDeleted metas
                        // (mirrors desktop deleteListMeta). Rides the normal LWW pipeline.
                        const now = Date.now()
                        const meta = {
                            ...buildListMetaItem({
                                id: rec.id,
                                name: rec.name,
                                type: rec.type,
                                groupId: rec.groupId ?? null,
                                order: rec.order ?? now,
                                view: rec.view,
                                baseKey: rec.baseKey ?? null,
                                updatedAt: now,
                            }),
                            regDeleted: true,
                        }
                        sendRPC(RPC_UPDATE, JSON.stringify({ item: meta }))
                        // Remove the bucket outright (not just empty it) so the list
                        // can't resurface as a stray Ungrouped list via extraLists.
                        dispatch(listsActions.listRemoved({ listId }))
                        // If the deleted list was the one on screen, fall back to Groceries.
                        if (currentId === listId) {
                            dispatch(listsActions.selectedListChanged({
                                listId: `${DEFAULT_LIST_ID}:${DEFAULT_LIST_TYPE}`,
                                listType: DEFAULT_LIST_TYPE,
                            }))
                        }
                        haptics.delete()
                    },
                },
            ]
        )
    }, [animate, currentId, dispatch, i18n, lib, sendRPC])

    // Show paywall if trial expired and not subscribed
    if (subscription.shouldShowPaywall) {
        return (
            <Paywall
                state={subscription}
                onPurchase={subscription.purchase}
                onRestore={subscription.restore}
            />
        )
    }

    return (
        <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
            <StatusBar
                barStyle={t.dark ? 'light-content' : 'dark-content'}
                backgroundColor={t.colors.bg}
            />
            <CategoryDragProvider
                data={displayList}
                enabled={categoriesEnabled && !isBoard}
                groceryLocale={i18n.groceryLocale}
                onAssign={handleAssignCategory}
                onDelete={handleDeleteDragged}
                reorderEnabled={!isBoard}
                onReorder={handleReorderToEdge}
            >
            <Header
                peerCount={peerCount}
                isWorkletReady={isWorkletReady}
                networkStatus={networkStatus}
                isJoining={isJoining}
                onMenuToggle={() => { setMenuInitialView('settings'); setPendingListSettingsId(null); setListsMenuVisible(true) }}
                trialDaysRemaining={subscription.isTrialActive ? subscription.trialDaysRemaining : undefined}
                groupCount={position?.groupCount ?? 0}
                groupIndex={position?.groupIndex ?? 0}
                groupSize={position?.groupSize ?? 0}
                listIndex={position?.indexInGroup ?? 0}
                groupName={position?.groupName ?? ''}
                onOpenLists={() => { setMenuInitialView('lists'); setPendingListSettingsId(null); setListsMenuVisible(true) }}
            />

            {overviewOpen && (
                <OverviewScreen
                    allItems={allItems}
                    listName={planListName}
                    onToggleSource={toggleSourceDone}
                    onClearPlan={clearPlanRef}
                    onOpenList={openListFromOverview}
                    onMovePlan={movePlanForRef}
                />
            )}

            {!overviewOpen && (
                <ListContextBar
                    listName={currentListName}
                    onOpenMenu={() => { setMenuInitialView('lists'); setPendingListSettingsId(null); setListsMenuVisible(true) }}
                    onBarcode={() => { const card = loyaltyCards[0]; if (card) { handleSelectCard(card) } else { setScannerVisible(true) } }}
                    showBarcode={!isTodo && !isBoard}
                    onOpenListSettings={() => { setPendingListSettingsId(currentId); setListsMenuVisible(true) }}
                />
            )}

            {!overviewOpen && isAdding && (
                <AddItemBar
                    value={addText}
                    onChangeText={setAddText}
                    onSubmit={handleSubmitAdd}
                    onClose={() => setIsAdding(false)}
                />
            )}

            <JoinDialog
                visible={joinDialogVisible}
                mode={joinMode}
                joinKeyInput={joinKeyInput}
                setJoinKeyInput={setJoinKeyInput}
                onSubmit={handleJoinSubmit}
                onCancel={handleJoinCancel}
            />
            <MembersDialog
                visible={membersDialogVisible}
                roster={membershipRoster}
                peerLabels={peerLabels}
                recoveryCode={ownerRecoveryCode}
                recoverCodeInput={recoverCodeInput}
                setRecoverCodeInput={setRecoverCodeInput}
                onRemoveMember={handleRemoveMember}
                onRevealRecoveryCode={handleRevealRecoveryCode}
                onDismissRecoveryCode={clearOwnerRecoveryCode}
                onRecoverOwnership={handleRecoverOwnership}
                onClose={handleCloseMembers}
            />
            <OwnedDevicesDialog
                visible={ownedDevicesVisible}
                ownerControl={ownerControl}
                onPair={handlePairOwnedDevice}
                onCheckStatus={handleOwnedDeviceStatus}
                onClose={() => setOwnedDevicesVisible(false)}
            />
            <LeafPairingDialog
                visible={leafPairingVisible}
                ownerControl={ownerControl}
                onFetchHubInfo={handleOwnedDeviceStatus}
                onClose={() => setLeafPairingVisible(false)}
            />
            <JoiningOverlay
                visible={isJoining}
                currentMessageIndex={currentP2PMessage}
                joinPhase={joinPhase}
                onCancel={handleJoiningCancel}
            />
            <ListsMenu
                visible={listsMenuVisible}
                groups={groupedLists}
                currentListId={currentId}
                defaultListId={defaultListId}
                syncedDefaultListId={syncedDefaultList?.defaultListId ?? null}
                onSetSyncedDefault={(listId: string, listType: string) => sendRPC(RPC_UPDATE, JSON.stringify({ item: buildProjectSettingsItem({ defaultListId: listId, defaultListType: listType, updatedAt: Date.now() }) }))}
                onSelect={(id: string, type: string) => { setOverviewShown(false); handleSelectList(id, type) }}
                onSetDefault={handleSetDefaultList}
                onCreate={handleCreateList}
                onCreateGroup={handleCreateGroup}
                onRenameGroup={handleRenameGroup}
                onMoveListToGroup={handleMoveListToGroup}
                onClose={() => { setListsMenuVisible(false); setPendingListSettingsId(null); void refreshBackupPasswordSet() }}
                peerCount={peerCount}
                isWorkletReady={isWorkletReady}
                networkStatus={networkStatus}
                isJoining={isJoining}
                onManageMembers={handleManageMembers}
                onManageOwnedDevices={handleOpenOwnedDevices}
                onPairLeaf={handleOpenLeafPairing}
                localeChoice={localeChoice}
                onLocaleChoiceChange={handleLocaleChoiceChange}
                themeChoice={themeChoice}
                onThemeChoiceChange={handleThemeChoiceChange}
                boardEnabled={boardEnabled}
                onToggleBoardEnabled={handleToggleBoardEnabled}
                overviewEnabled={overviewEnabled}
                onToggleOverviewEnabled={handleToggleOverviewEnabled}
                overviewOpen={overviewOpen}
                overviewTodayCount={todayPlanCount}
                onOpenOverview={() => { setOverviewShown(true); setListsMenuVisible(false); setPendingListSettingsId(null) }}
                showInOverviewFor={(surfaceId: string, type: string) => plannedRefs.has(planListKey(decodeSurface(surfaceId).listId, isBoardType(type) ? BOARD_LIST_TYPE : type))}
                onSetShowInOverview={(surfaceId: string, type: string, enabled: boolean) => {
                    const listId = decodeSurface(surfaceId).listId
                    const canonical = isBoardType(type) ? BOARD_LIST_TYPE : type
                    if (enabled) writePlan(buildListPlanEntry({ listId, listType: canonical, plannedFor: toDateKey(Date.now()), planOrder: Date.now(), updatedAt: Date.now() }) as unknown as ListEntry)
                    else clearPlanRef(planListKey(listId, canonical))
                }}
                deviceName={deviceName}
                onDeviceNameChange={handleDeviceNameChange}
                onChangeListView={writeListView}
                valueReturnFor={(surfaceId, type) => isValueOn(decodeSurface(surfaceId).listId, type)}
                onSetValueReturn={(surfaceId, type, enabled) => sendRPC(RPC_UPDATE, JSON.stringify({ item: buildValueReturnItem({ listId: decodeSurface(surfaceId).listId, type: isBoardType(type) ? BOARD_LIST_TYPE : type, enabled, updatedAt: Date.now() }) }))}
                onRenameList={handleRenameList}
                onDeleteListItems={handleDeleteListItems}
                onDeleteList={handleDeleteList}
                onClearDone={handleClearListCompleted}
                onShareList={handleShareList}
                onShareProject={handleShareProject}
                onJoin={handleJoin}
                onJoinList={handleOpenJoinList}
                initialListSettingsId={pendingListSettingsId}
                initialView={menuInitialView}
                loyaltyCards={loyaltyCards}
                onScanCard={() => setScannerVisible(true)}
                onSelectCard={handleSelectCard}
                sendRPCWithReply={sendRPCWithReply}
                notify={notify}
            />

            {!overviewOpen && (
            <ListSwipePager
                canPage={!isAdding && !listsMenuVisible && !joinDialogVisible && !membersDialogVisible && !ownedDevicesVisible && !leafPairingVisible && !isJoining && boardTicketId === null && !createTicketVisible}
                reduceMotion={reduceMotion}
                onCommit={commit}
            >
            <View style={{ flex: 1 }} onStartShouldSetResponder={handleBackgroundTap}>
                {isBoard ? (
                    <BoardView
                        tickets={dataList}
                        config={boardConfig}
                        onOpenTicket={handleOpenTicket}
                        onTripleTapTicket={overviewEnabled ? captureToggle : undefined}
                    />
                ) : isGridView ? (
                    <VisualGridList
                        data={displayList}
                        onToggleDone={handleToggleDone}
                        onDelete={handleDelete}
                        onRequestAdd={handleRequestAdd}
                        categoriesEnabled={categoriesEnabled}
                        categoryHeadersVisible={categoryHeadersVisible}
                        gridIconSize={gridIconSize}
                        itemIconVariant={itemIconVariant}
                        reduceMotion={reduceMotion}
                    />
                ) : (
                    <InertialElasticList
                        data={displayList}
                        onToggleDone={handleRowToggleDone}
                        onDelete={handleDelete}
                        onEdit={handleEditItem}
                        onRequestAdd={handleRequestAdd}
                        onFlagToday={overviewEnabled ? handleFlagToday : undefined}
                        onPlanFor={overviewEnabled ? handlePlanFor : undefined}
                        onTripleTap={overviewEnabled ? captureToggle : undefined}
                        isPlanned={overviewEnabled ? isItemPlanned : undefined}
                        categoriesEnabled={categoriesEnabled}
                        categoryHeadersVisible={categoryHeadersVisible}
                        listTextSize={listTextSize}
                        listAlignment={listAlignment}
                        listItemSpacing={listItemSpacing}
                        reduceMotion={reduceMotion}
                    />
                )}
            </View>
            </ListSwipePager>
            )}

            {!overviewOpen && !isAdding && showFab && !isBoard && <Fab onPress={handleRequestAdd} bottomOffset={insets.bottom + 20} />}

            <PlanSheet
                visible={planSheetItem !== null}
                item={planSheetItem}
                planned={planSheetRef !== '' && plannedRefs.has(planSheetRef)}
                onToggleOverview={() => { if (planSheetItem) captureToggle(planSheetItem); setPlanSheetItem(null) }}
                onEdit={(text) => { if (planSheetItem) editPlanItemText(planSheetItem, text); setPlanSheetItem(null) }}
                onMove={isTodo ? () => { setMoveTarget(planSheetItem); setPlanSheetItem(null) } : undefined}
                onClose={() => setPlanSheetItem(null)}
            />

            <LoyaltyCardScanner
                visible={scannerVisible}
                onClose={() => setScannerVisible(false)}
                onCardScanned={handleCardScanned}
            />
            <LoyaltyCardViewer
                visible={selectedCard !== null}
                card={selectedCard}
                onClose={() => setSelectedCard(null)}
                onDelete={handleDeleteCard}
            />
            <TicketDetail
                visible={boardTicketId !== null && selectedTicket !== null}
                ticket={selectedTicket}
                config={boardConfig}
                listName={currentListName}
                valueReturnOn={!!selectedTicket && isValueOn(selectedTicket.listId || '', selectedTicket.listType || '')}
                onUpdate={handleUpdateTicket}
                onChangeStatus={handleChangeTicketStatus}
                onRequestMove={(ticket) => { setBoardTicketId(null); setMoveTarget(ticket) }}
                onClose={() => setBoardTicketId(null)}
            />
            <CreateTicket
                visible={createTicketVisible}
                config={boardConfig}
                initialDescription={createTicketInitialDesc}
                valueReturnOn={isValueOn(decodeSurface(pendingMoveRef.current?.targetListId ?? currentId).listId, BOARD_LIST_TYPE)}
                onCreate={handleCreateTicket}
                onClose={() => { setCreateTicketVisible(false); setCreateTicketInitialDesc(''); pendingMoveRef.current = null }}
            />
            <ValueRateSheet
                visible={valueRateAdd !== null}
                text={valueRateAdd ?? undefined}
                onConfirm={(valueRate, delayRate) => { handleInsert(0, valueRateAdd ?? '', { valueRate, delayRate }); haptics.toggleOn(); setValueRateAdd(null) }}
                onClose={() => setValueRateAdd(null)}
            />
            <MoveItemSheet
                visible={moveTarget !== null}
                item={moveTarget}
                groups={groupedLists}
                onMove={handleMove}
                onClose={() => setMoveTarget(null)}
            />
            </CategoryDragProvider>
        </View>
    )
}

export default function App() {
    const [fontsLoaded] = useFonts({
        'CasinoGrotesk-Bold': require('./assets/fonts/CasinoGrotesk-Bold.ttf'),
        'CasinoGrotesk-Medium': require('./assets/fonts/CasinoGrotesk-Medium.ttf'),
        'CasinoGrotesk-Regular': require('./assets/fonts/CasinoGrotesk-Regular.ttf'),
    })
    if (!fontsLoaded) return null
    return (
        <Provider store={store}>
            <SafeAreaProvider>
                <I18nProvider>
                    <SnackbarProvider>
                        <AppInner />
                    </SnackbarProvider>
                </I18nProvider>
            </SafeAreaProvider>
        </Provider>
    )
}

export type { ListEntry }
