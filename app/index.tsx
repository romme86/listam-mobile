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
    RPC_JOIN_KEY,
    RPC_REMOVE_MEMBER,
    RPC_GET_MEMBERS,
    RPC_GET_OWNER_RECOVERY_CODE,
    RPC_RECOVER_OWNER,
    RPC_CONTROL_PAIR,
    RPC_CONTROL_COMMAND,
    RPC_CONTROL_LIST,
    type NotifyType,
} from './hooks/_useWorklet'
import { store } from './store/store'
import { useAppDispatch, useAppSelector } from './store/hooks'
import { listsActions } from './store/listsSlice'
import {
    preferencesActions,
    selectPreferences,
    isSizeOption,
    isListAlignment,
    isListSpacing,
    isItemIconVariant,
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
import { JoiningOverlay, P2P_MESSAGE_KEYS } from './components/JoiningOverlay'
import { Paywall } from './components/Paywall'
import { LoyaltyCardScanner } from './components/LoyaltyCardScanner'
import { LoyaltyCardViewer } from './components/LoyaltyCardViewer'
import type { LoyaltyCard } from './components/LoyaltyCardScanner'
import InertialElasticList from './components/intertial_scroll'
import { VisualGridList } from './components/VisualGridList'
import { CategoryDragProvider } from './components/CategoryDrag'
import { getDisplayCategoryName } from './components/categoryGrouping'
import { identityKey } from './listProjection'
import { AddItemBar } from './components/AddItemBar'
import { Fab } from './components/Fab'
import { SummaryBar } from './components/SummaryBar'
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
import type { ItemIconVariant } from './components/itemIconMap'
import type { ListAlignment, ListEntry, ListSpacing, SizeOption } from './components/_types'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true)
}

const PREF_GRID_VIEW = '@lista_grid_view'
const PREF_CATEGORIES = '@lista_categories'
const PREF_GRID_ICON_SIZE = '@lista_grid_icon_size'
const PREF_LIST_TEXT_SIZE = '@lista_list_text_size'
const PREF_LIST_ALIGNMENT = '@lista_list_alignment'
const PREF_LIST_ITEM_SPACING = '@lista_list_item_spacing'
const PREF_CATEGORY_HEADERS = '@lista_category_headers'
const PREF_SHOW_FAB = '@lista_show_fab'
const PREF_ITEM_ICON_VARIANT = '@lista_item_icon_variant'
const PREF_LOCALE_CHOICE = '@lista_locale_choice'
const PREF_THEME_CHOICE = '@lista_theme_choice'

// Max gap between the two taps of a double-tap-to-add gesture.
const DOUBLE_TAP_MS = 300

function AppInner() {
    const t = useTheme()
    const i18n = useI18n()
    const insets = useSafeAreaInsets()
    const snackbar = useSnackbar()
    const reduceMotion = useReduceMotion()
    const dispatch = useAppDispatch()
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
        localeChoice,
        themeChoice,
    } = useAppSelector(selectPreferences)
    const loyaltyCards = useAppSelector(selectLoyaltyCardHandles)

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
        membershipRoster,
        ownerRecoveryCode,
        clearOwnerRecoveryCode,
        ownerControl,
        sendRPC,
    } = useWorklet(notify)

    const subscription = useSubscription()
    const { apply: applyLearnedCategories, learn: learnCategory } = useLearnedCategories()

    // The list as shown: entries without an explicit (dragged) category override
    // inherit one from what was learned for that item name. The raw `dataList`
    // is still the source of truth for mutations — this view is index-aligned.
    const displayList = useMemo(
        () => applyLearnedCategories(dataList),
        [applyLearnedCategories, dataList]
    )

    const [joinDialogVisible, setJoinDialogVisible] = useState(false)
    const [joinKeyInput, setJoinKeyInput] = useState('')
    const [membersDialogVisible, setMembersDialogVisible] = useState(false)
    const [ownedDevicesVisible, setOwnedDevicesVisible] = useState(false)
    const [recoverCodeInput, setRecoverCodeInput] = useState('')
    const [currentP2PMessage, setCurrentP2PMessage] = useState(0)
    const [menuVisible, setMenuVisible] = useState(false)
    const [scannerVisible, setScannerVisible] = useState(false)
    const [selectedCard, setSelectedCard] = useState<LoyaltyCard | null>(null)
    const [isAdding, setIsAdding] = useState(false)
    const [addText, setAddText] = useState('')

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

    const beginJoinWithInvite = useCallback((rawInvite: string) => {
        const invite = extractInviteFromInput(rawInvite)
        if (!invite) {
            snackbar.show(i18n.t('invite.notification.invalid'), 'error')
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
    }, [i18n, isJoiningRef, isWorkletReady, sendRPC, setIsJoining, snackbar])

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
            PREF_GRID_VIEW,
            PREF_CATEGORIES,
            PREF_GRID_ICON_SIZE,
            PREF_LIST_TEXT_SIZE,
            PREF_LIST_ALIGNMENT,
            PREF_LIST_ITEM_SPACING,
            PREF_CATEGORY_HEADERS,
            PREF_SHOW_FAB,
            PREF_ITEM_ICON_VARIANT,
            PREF_LOCALE_CHOICE,
            PREF_THEME_CHOICE,
        ]).then(([[, grid], [, cats], [, gridSize], [, textSize], [, alignment], [, itemSpacing], [, categoryHeaders], [, showFab], [, iconVariant], [, localeChoice], [, themeChoice]]) => {
            dispatch(preferencesActions.preferencesHydrated({
                ...(grid !== null ? { isGridView: grid === 'true' } : {}),
                ...(cats !== null ? { categoriesEnabled: cats === 'true' } : {}),
                ...(isSizeOption(gridSize) ? { gridIconSize: gridSize } : {}),
                ...(isSizeOption(textSize) ? { listTextSize: textSize } : {}),
                ...(isListAlignment(alignment) ? { listAlignment: alignment } : {}),
                ...(isListSpacing(itemSpacing) ? { listItemSpacing: itemSpacing } : {}),
                ...(categoryHeaders !== null ? { categoryHeadersVisible: categoryHeaders === 'true' } : {}),
                ...(showFab !== null ? { showFab: showFab === 'true' } : {}),
                ...(isItemIconVariant(iconVariant) ? { itemIconVariant: iconVariant } : {}),
                ...(isLocaleChoice(localeChoice) ? { localeChoice } : {}),
                ...(isThemeChoice(themeChoice) ? { themeChoice } : {}),
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

    const handleToggleView = useCallback(() => {
        const next = !isGridView
        dispatch(preferencesActions.gridViewSet(next))
        AsyncStorage.setItem(PREF_GRID_VIEW, String(next))
    }, [dispatch, isGridView])

    const handleToggleCategories = useCallback(() => {
        const next = !categoriesEnabled
        dispatch(preferencesActions.categoriesEnabledSet(next))
        AsyncStorage.setItem(PREF_CATEGORIES, String(next))
    }, [categoriesEnabled, dispatch])

    const handleGridIconSizeChange = useCallback((size: SizeOption) => {
        dispatch(preferencesActions.gridIconSizeSet(size))
        AsyncStorage.setItem(PREF_GRID_ICON_SIZE, size)
    }, [dispatch])

    const handleListTextSizeChange = useCallback((size: SizeOption) => {
        dispatch(preferencesActions.listTextSizeSet(size))
        AsyncStorage.setItem(PREF_LIST_TEXT_SIZE, size)
    }, [dispatch])

    const handleListItemSpacingChange = useCallback((spacing: ListSpacing) => {
        dispatch(preferencesActions.listItemSpacingSet(spacing))
        AsyncStorage.setItem(PREF_LIST_ITEM_SPACING, spacing)
    }, [dispatch])

    const handleListAlignmentChange = useCallback((alignment: ListAlignment) => {
        dispatch(preferencesActions.listAlignmentSet(alignment))
        AsyncStorage.setItem(PREF_LIST_ALIGNMENT, alignment)
    }, [dispatch])

    const handleItemIconVariantChange = useCallback((variant: ItemIconVariant) => {
        dispatch(preferencesActions.itemIconVariantSet(variant))
        AsyncStorage.setItem(PREF_ITEM_ICON_VARIANT, variant)
    }, [dispatch])

    const handleLocaleChoiceChange = useCallback((choice: LocaleChoice) => {
        dispatch(preferencesActions.localeChoiceSet(choice))
        AsyncStorage.setItem(PREF_LOCALE_CHOICE, choice)
    }, [dispatch])

    const handleThemeChoiceChange = useCallback((choice: ThemeChoice) => {
        dispatch(preferencesActions.themeChoiceSet(choice))
        AsyncStorage.setItem(PREF_THEME_CHOICE, choice)
    }, [dispatch])

    const handleToggleCategoryHeaders = useCallback(() => {
        const next = !categoryHeadersVisible
        dispatch(preferencesActions.categoryHeadersVisibleSet(next))
        AsyncStorage.setItem(PREF_CATEGORY_HEADERS, String(next))
    }, [categoryHeadersVisible, dispatch])

    const handleToggleFab = useCallback(() => {
        const next = !showFab
        dispatch(preferencesActions.showFabSet(next))
        AsyncStorage.setItem(PREF_SHOW_FAB, String(next))
    }, [showFab, dispatch])

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
        sendRPC(RPC_ADD, JSON.stringify(text))
    }, [sendRPC])

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

    const handleClearCompleted = useCallback(() => {
        const done = dataList.filter((item) => item.isDone)
        if (done.length === 0) return
        animate()
        dispatch(listsActions.selectedListItemsReplaced(dataList.filter((item) => !item.isDone)))
        done.forEach((item) => sendRPC(RPC_DELETE, JSON.stringify({ item })))
        haptics.success()
    }, [animate, dataList, dispatch, sendRPC])

    const handleRequestAdd = useCallback(() => {
        setAddText('')
        setIsAdding(true)
    }, [])

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

    const handleJoin = useCallback(() => {
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

    const handleJoinSubmit = useCallback(() => {
        if (!joinKeyInput.trim()) {
            snackbar.show(i18n.t('invite.notification.emptyManual'), 'error')
            return
        }
        const didRequestJoin = requestJoinConfirmation(joinKeyInput, 'manual')
        if (!didRequestJoin) return
        setJoinDialogVisible(false)
        setJoinKeyInput('')
    }, [i18n, joinKeyInput, requestJoinConfirmation, snackbar])

    const handleJoinCancel = useCallback(() => {
        setJoinDialogVisible(false)
        setJoinKeyInput('')
    }, [])

    const handleJoiningCancel = useCallback(() => {
        setIsJoining(false)
        isJoiningRef.current = false
    }, [setIsJoining, isJoiningRef])

    const handleDeleteAll = useCallback(() => {
        Alert.alert(
            i18n.t('main.deleteAll.title'),
            i18n.t('main.deleteAll.message'),
            [
                { text: i18n.t('common.cancel'), style: 'cancel' },
                {
                    text: i18n.t('main.deleteAll.action'),
                    style: 'destructive',
                    onPress: () => {
                        animate()
                        dataList.forEach((item) => {
                            sendRPC(RPC_DELETE, JSON.stringify({ item }))
                        })
                        dispatch(listsActions.selectedListItemsReplaced([]))
                        haptics.delete()
                    },
                },
            ]
        )
    }, [animate, dataList, dispatch, i18n, sendRPC])

    const remaining = dataList.reduce((acc, item) => acc + (item.isDone ? 0 : 1), 0)
    const doneCount = dataList.length - remaining
    const hasItems = dataList.length > 0

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
                enabled={categoriesEnabled}
                groceryLocale={i18n.groceryLocale}
                onAssign={handleAssignCategory}
                onDelete={handleDeleteDragged}
            >
            <Header
                peerCount={peerCount}
                isWorkletReady={isWorkletReady}
                onShare={handleShare}
                onJoin={handleJoin}
                onManageMembers={handleManageMembers}
                onManageOwnedDevices={handleOpenOwnedDevices}
                trialDaysRemaining={subscription.isTrialActive ? subscription.trialDaysRemaining : undefined}
                menuVisible={menuVisible}
                onMenuToggle={() => setMenuVisible(v => !v)}
                onDeleteAll={handleDeleteAll}
                isGridView={isGridView}
                onToggleView={handleToggleView}
                categoriesEnabled={categoriesEnabled}
                onToggleCategories={handleToggleCategories}
                categoryHeadersVisible={categoryHeadersVisible}
                onToggleCategoryHeaders={handleToggleCategoryHeaders}
                showFab={showFab}
                onToggleFab={handleToggleFab}
                gridIconSize={gridIconSize}
                onGridIconSizeChange={handleGridIconSizeChange}
                listTextSize={listTextSize}
                onListTextSizeChange={handleListTextSizeChange}
                listAlignment={listAlignment}
                onListAlignmentChange={handleListAlignmentChange}
                listItemSpacing={listItemSpacing}
                onListItemSpacingChange={handleListItemSpacingChange}
                itemIconVariant={itemIconVariant}
                onItemIconVariantChange={handleItemIconVariantChange}
                localeChoice={localeChoice}
                onLocaleChoiceChange={handleLocaleChoiceChange}
                themeChoice={themeChoice}
                onThemeChoiceChange={handleThemeChoiceChange}
                loyaltyCards={loyaltyCards}
                onScanCard={() => setScannerVisible(true)}
                onSelectCard={handleSelectCard}
            />

            {isAdding && (
                <AddItemBar
                    value={addText}
                    onChangeText={setAddText}
                    onSubmit={handleSubmitAdd}
                    onClose={() => setIsAdding(false)}
                />
            )}

            <JoinDialog
                visible={joinDialogVisible}
                joinKeyInput={joinKeyInput}
                setJoinKeyInput={setJoinKeyInput}
                onSubmit={handleJoinSubmit}
                onCancel={handleJoinCancel}
            />
            <MembersDialog
                visible={membersDialogVisible}
                roster={membershipRoster}
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
            <JoiningOverlay
                visible={isJoining}
                currentMessageIndex={currentP2PMessage}
                joinPhase={joinPhase}
                onCancel={handleJoiningCancel}
            />

            <View style={{ flex: 1 }} onStartShouldSetResponder={handleBackgroundTap}>
                {isGridView ? (
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
                        onRequestAdd={handleRequestAdd}
                        categoriesEnabled={categoriesEnabled}
                        categoryHeadersVisible={categoryHeadersVisible}
                        listTextSize={listTextSize}
                        listAlignment={listAlignment}
                        listItemSpacing={listItemSpacing}
                        reduceMotion={reduceMotion}
                    />
                )}
            </View>

            {hasItems && (
                <SummaryBar
                    remaining={remaining}
                    doneCount={doneCount}
                    onClearCompleted={handleClearCompleted}
                />
            )}

            {!isAdding && showFab && <Fab onPress={handleRequestAdd} bottomOffset={insets.bottom + 20} />}

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
