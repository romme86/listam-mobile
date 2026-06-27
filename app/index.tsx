import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
    View,
    Share,
    Alert,
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
import { RPC_LIST_BACKUPS, RPC_SHARE_LIST, RPC_JOIN_LIST } from '@listam/protocol'
import { store } from './store/store'
import { useAppDispatch, useAppSelector } from './store/hooks'
import { listsActions, selectItemsForList, selectAllItems } from './store/listsSlice'
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
import { SummaryBar } from './components/SummaryBar'
import { ListsMenu } from './components/ListsMenu'
import { MoveItemSheet } from './components/MoveItemSheet'
import { ListContextBar } from './components/ListContextBar'
import { ListSwipePager } from './components/ListSwipePager'
import { BoardView } from './components/board/BoardView'
import { TicketDetail } from './components/board/TicketDetail'
import { CreateTicket, type TicketDraft } from './components/board/CreateTicket'
import { useListPager } from './nav/useListPager'
import { selectGroupedLists, selectCurrentListView, DEFAULT_VIEW, isBuiltinSurfaceId, builtinSurfaceNameKey } from './store/registrySelectors'
import { selectBoardConfig } from './store/boardConfigSlice'
import { selectPeerLabels } from './store/labelsSlice'
import { buildListMetaItem, buildGroupMetaItem, type RegistryListView } from '@listam/domain/list-registry'
import { UNGROUPED_GROUP_ID } from '@listam/domain/list-nav'
import { buildPeerLabelItem, buildSurfaceLabelItem, buildBuiltinGroupItem, MAX_LABEL_NAME } from '@listam/domain'
import { BOARD_WRITE_TYPE, isBoardType, buildStatusChange, validateTicketDraft } from '@listam/domain/board'
import {
    reducePlan,
    buildItemPlanEntry,
    buildPlanItem,
    planItemKey,
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
const PREF_DEVICE_NAME = '@lista_device_name'
const PREF_BACKUP_PROMPTED = '@lista_backup_prompted'

// Max gap between the two taps of a double-tap-to-add gesture.
const DOUBLE_TAP_MS = 300

function AppInner() {
    const t = useTheme()
    const i18n = useI18n()
    const insets = useSafeAreaInsets()
    const snackbar = useSnackbar()
    const reduceMotion = useReduceMotion()
    const dispatch = useAppDispatch()
    const { localeChoice, themeChoice, defaultListId, boardEnabled, deviceName } = useAppSelector(selectPreferences)
    const peerLabels = useAppSelector(selectPeerLabels)
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
        autobaseInviteKey,
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

    // The set of live plan refs ('i:listId::itemId' / 'l:listId::type'), recomputed
    // when items change so rows/headers can show their flag state.
    const plannedRefs = useMemo(() => new Set([...reducePlan(allItems).keys()]), [allItems])

    const [joinDialogVisible, setJoinDialogVisible] = useState(false)
    // The join dialog is reused for both the destructive whole-project join
    // ('project') and the additive single-list join ('list', RPC_JOIN_LIST).
    const [joinMode, setJoinMode] = useState<'project' | 'list'>('project')
    // Whether a backup password is set. Joins are gated on it so the pre-join
    // auto-backup can always run. null = not yet queried.
    const [backupPasswordSet, setBackupPasswordSet] = useState<boolean | null>(null)
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
    // The day-plan Overview is an OPT-IN organization capability, gated behind the
    // same toggle as boards (preferences.boardEnabled). By default the app is just
    // a grocery + to-do list app, so the Overview is off: the app launches straight
    // onto the selected list and the Header's sun button is hidden. Enabling boards
    // reveals the sun button and lets the user toggle the day plan on.
    const [overviewVisible, setOverviewVisible] = useState(false)
    // Effective Overview visibility: it can only ever show while boards are
    // enabled, so disabling boards (or the default, boards-off state) always
    // collapses back to the list — even if overviewVisible lingered true.
    const overviewOpen = boardEnabled && overviewVisible
    // The item whose plan sheet (edit / plan-for-a-day) is open (null = closed).
    const [planSheetItem, setPlanSheetItem] = useState<ListEntry | null>(null)
    const [pendingListSettingsId, setPendingListSettingsId] = useState<string | null>(null)
    const [boardTicketId, setBoardTicketId] = useState<string | null>(null)
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

    // Query whether a backup password is set (gates joining).
    const refreshBackupPasswordSet = useCallback(async () => {
        try {
            const reply = await sendRPCWithReply(RPC_LIST_BACKUPS)
            const res = reply ? JSON.parse(reply) : null
            if (res?.ok) setBackupPasswordSet(!!res.passwordSet)
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
                    { text: i18n.t('lists.menu.title'), onPress: () => { setPendingListSettingsId(null); setListsMenuVisible(true) } },
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
            PREF_DEVICE_NAME,
        ]).then(([[, localeChoice], [, themeChoice], [, defaultList], [, boardEnabled], [, deviceName]]) => {
            dispatch(preferencesActions.preferencesHydrated({
                ...(isLocaleChoice(localeChoice) ? { localeChoice } : {}),
                ...(isThemeChoice(themeChoice) ? { themeChoice } : {}),
                ...(defaultList !== null ? { defaultListId: defaultList } : {}),
                ...(boardEnabled === '1' || boardEnabled === '0' ? { boardEnabled: boardEnabled === '1' } : {}),
                ...(deviceName !== null ? { deviceName } : {}),
            }))
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
        // Built-in surfaces have no registry meta-item to carry per-list view
        // overrides; they use the default view on mobile. Skip to avoid writing a
        // phantom registry list under the composite id.
        if (isBuiltinSurfaceId(rec.id)) return
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
    }, [lib, sendRPC])

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

    // This device's own writer key, learned from the membership roster (unknown
    // at boot — the roster arrives asynchronously once peers connect).
    const selfWriterKey = useMemo(
        () => membershipRoster?.writers.find((m) => m.isSelf)?.writerKey ?? null,
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
                    { text: i18n.t('lists.menu.title'), onPress: () => { setPendingListSettingsId(null); setListsMenuVisible(true) } },
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

    const handleToggleDone = useCallback((index: number) => {
        animate()
        const newList = [...dataList]
        const current = newList[index]
        if (!current) return

        const updatedItem: ListEntry = {
            ...current,
            isDone: !current.isDone,
            timeOfCompletion: !current.isDone ? Date.now() : 0,
            updatedAt: Date.now(),
        }

        newList.splice(index, 1)
        if (updatedItem.isDone) {
            newList.push(updatedItem)
        } else {
            newList.unshift(updatedItem)
        }

        dispatch(listsActions.selectedListItemsReplaced(newList))
        sendRPC(RPC_UPDATE, JSON.stringify({ item: updatedItem }))
    }, [animate, dataList, dispatch, sendRPC])

    const handleDelete = useCallback((index: number) => {
        const deletedItem = dataList[index]
        if (!deletedItem) return
        animate()
        dispatch(listsActions.listItemDeleted(deletedItem))
        sendRPC(RPC_DELETE, JSON.stringify({ item: deletedItem }))
    }, [animate, dataList, dispatch, sendRPC])

    const handleInsert = useCallback((_index: number, text: string) => {
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
        sendRPC(RPC_ADD, JSON.stringify({ text, listId, listType, baseKey }))
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
        const rec = reducePlan(allItems).get(ref)
        if (!rec) return
        writePlan(buildPlanItem({ id: ref, kind: rec.kind, refListId: rec.refListId, refItemId: rec.refItemId, refType: rec.refType, plannedFor: '', planOrder: rec.planOrder, updatedAt: Date.now() }) as unknown as ListEntry)
    }, [allItems, writePlan])

    const flagItemForDay = useCallback((item: ListEntry, dateKey: string) => {
        if (!item.id || !item.listId) return
        writePlan(buildItemPlanEntry({ listId: item.listId, itemId: item.id, plannedFor: dateKey, planOrder: Date.now(), updatedAt: Date.now() }) as unknown as ListEntry)
    }, [writePlan])

    const toggleItemPlan = useCallback((item: ListEntry) => {
        const ref = planItemKey(item.listId ?? '', item.id ?? '')
        if (plannedRefs.has(ref)) clearPlanRef(ref)
        else flagItemForDay(item, toDateKey(Date.now()))
    }, [plannedRefs, clearPlanRef, flagItemForDay])

    const handleFlagToday = useCallback((index: number) => {
        const item = dataList[index]
        if (item) toggleItemPlan(item)
    }, [dataList, toggleItemPlan])

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

    const planListName = useCallback((listId: string) => lib.listsById[listId]?.name ?? listId, [lib])

    const openListFromOverview = useCallback((listId: string) => {
        setOverviewVisible(false)
        dispatch(listsActions.selectedListChanged({ listId }))
    }, [dispatch])

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

    const handleClearCompleted = useCallback(() => {
        const done = dataList.filter((item) => item.isDone)
        if (done.length === 0) return
        animate()
        dispatch(listsActions.selectedListItemsReplaced(dataList.filter((item) => !item.isDone)))
        done.forEach((item) => sendRPC(RPC_DELETE, JSON.stringify({ item })))
        haptics.success()
    }, [animate, dataList, dispatch, sendRPC])

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
                },
            }))
        } else {
            sendRPC(RPC_ADD, JSON.stringify({
                text: draft.description,
                listId: currentId,
                listType: BOARD_WRITE_TYPE,
                status: 'todo',
                description: draft.description,
                checklist: draft.checklist,
                estimatedHours: draft.estimatedHours,
                estimatedComplexity: draft.estimatedComplexity,
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

    const handleSetDefaultList = useCallback((listId: string) => {
        dispatch(preferencesActions.defaultListIdSet(listId))
        AsyncStorage.setItem(PREF_DEFAULT_LIST, listId)
    }, [dispatch])

    // Context-bar star: make the current list the launch default, or clear it
    // (back to "first list") if it already is.
    const handleToggleDefaultList = useCallback(() => {
        const next = defaultListId === currentId ? null : currentId
        dispatch(preferencesActions.defaultListIdSet(next))
        if (next === null) AsyncStorage.removeItem(PREF_DEFAULT_LIST)
        else AsyncStorage.setItem(PREF_DEFAULT_LIST, next)
    }, [defaultListId, currentId, dispatch])

    // A new list is a registry meta-item (synced via the normal item pipeline)
    // plus selecting it (which materializes its empty ListRecord).
    const handleCreateList = useCallback((type: string) => {
        const id = `list-${Date.now().toString(36)}`
        const now = Date.now()
        const name = isBoardType(type)
            ? i18n.t('lists.menu.newBoard')
            : isTodoType(type)
                ? i18n.t('lists.menu.newTodo')
                : i18n.t('lists.menu.newGrocery')
        const meta = buildListMetaItem({ id, name, type, groupId: null, order: now, updatedAt: now })
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
        handleInsert(0, value)
        haptics.toggleOn()
        setAddText('')
    }, [addText, dataList, handleInsert, i18n, snackbar])

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

    const handleShare = useCallback(async () => {
        if (!autobaseInviteKey) {
            snackbar.show(isWorkletReady ? i18n.t('invite.share.ownerOnly') : i18n.t('invite.share.notReady'))
            return
        }
        try {
            const inviteLink = `https://listam.ch/join?invite=${encodeURIComponent(autobaseInviteKey)}`
            await Share.share({
                message: i18n.t('invite.share.message', {
                    inviteLink,
                    inviteKey: autobaseInviteKey,
                }),
                title: i18n.t('invite.share.title'),
            })
        } catch {
            snackbar.show(i18n.t('invite.share.failed'), 'error')
        }
    }, [autobaseInviteKey, i18n, isWorkletReady, snackbar])

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

    const remaining = dataList.reduce((acc, item) => acc + (item.isDone ? 0 : 1), 0)
    const doneCount = dataList.length - remaining

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
                onShare={handleShare}
                onJoin={handleJoin}
                onMenuToggle={() => { setPendingListSettingsId(null); setListsMenuVisible(true) }}
                onOverview={() => setOverviewVisible((v) => !v)}
                overviewActive={overviewOpen}
                showOverview={boardEnabled}
                trialDaysRemaining={subscription.isTrialActive ? subscription.trialDaysRemaining : undefined}
                loyaltyCards={loyaltyCards}
                onScanCard={() => setScannerVisible(true)}
                onSelectCard={handleSelectCard}
            />

            {overviewOpen && (
                <OverviewScreen
                    allItems={allItems}
                    listName={planListName}
                    onToggleSource={toggleSourceDone}
                    onClearPlan={clearPlanRef}
                    onOpenList={openListFromOverview}
                />
            )}

            {!overviewOpen && (
                <ListContextBar
                    listName={currentListName}
                    isDefault={defaultListId === currentId}
                    onOpenMenu={() => { setPendingListSettingsId(null); setListsMenuVisible(true) }}
                    onOpenListSettings={() => { setPendingListSettingsId(currentId); setListsMenuVisible(true) }}
                    onSetDefault={handleToggleDefaultList}
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
                onSelect={(id: string, type: string) => { setOverviewVisible(false); handleSelectList(id, type) }}
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
                deviceName={deviceName}
                onDeviceNameChange={handleDeviceNameChange}
                onChangeListView={writeListView}
                onRenameList={handleRenameList}
                onDeleteListItems={handleDeleteListItems}
                onShareList={handleShareList}
                onJoinList={handleOpenJoinList}
                initialListSettingsId={pendingListSettingsId}
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
                        onCreate={() => setCreateTicketVisible(true)}
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
                        onToggleDone={handleToggleDone}
                        onDelete={handleDelete}
                        onEdit={handleEditItem}
                        onRequestMove={isTodo ? setMoveTarget : undefined}
                        onRequestAdd={handleRequestAdd}
                        onFlagToday={handleFlagToday}
                        onPlanFor={handlePlanFor}
                        isPlanned={isItemPlanned}
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

            {!overviewOpen && !isBoard && (
                <SummaryBar
                    remaining={remaining}
                    doneCount={doneCount}
                    onClearCompleted={handleClearCompleted}
                    positionCount={position?.groupSize ?? 0}
                    positionIndex={position?.indexInGroup ?? 0}
                />
            )}

            {!overviewOpen && !isAdding && showFab && !isBoard && <Fab onPress={handleRequestAdd} bottomOffset={insets.bottom + 20} />}

            <PlanSheet
                visible={planSheetItem !== null}
                item={planSheetItem}
                planned={planSheetRef !== '' && plannedRefs.has(planSheetRef)}
                onPickDay={(dateKey) => { if (planSheetItem) flagItemForDay(planSheetItem, dateKey); setPlanSheetItem(null) }}
                onClear={() => { if (planSheetRef) clearPlanRef(planSheetRef); setPlanSheetItem(null) }}
                onEdit={(text) => { if (planSheetItem) editPlanItemText(planSheetItem, text); setPlanSheetItem(null) }}
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
                onUpdate={handleUpdateTicket}
                onChangeStatus={handleChangeTicketStatus}
                onRequestMove={(ticket) => { setBoardTicketId(null); setMoveTarget(ticket) }}
                onClose={() => setBoardTicketId(null)}
            />
            <CreateTicket
                visible={createTicketVisible}
                config={boardConfig}
                initialDescription={createTicketInitialDesc}
                onCreate={handleCreateTicket}
                onClose={() => { setCreateTicketVisible(false); setCreateTicketInitialDesc(''); pendingMoveRef.current = null }}
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
