import React, { useEffect, useRef, useState, useCallback } from 'react'
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
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
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
    type NotifyType,
} from './hooks/_useWorklet'
import { store } from './store/store'
import { useAppDispatch, useAppSelector } from './store/hooks'
import { listsActions } from './store/listsSlice'
import {
    preferencesActions,
    selectPreferences,
    isSizeOption,
    isItemIconVariant,
} from './store/preferencesSlice'
import {
    loyaltyCardsActions,
    selectLoyaltyCardHandles,
    toLoyaltyCardHandle,
    type LoyaltyCardHandle,
} from './store/loyaltyCardsSlice'
import { useSubscription } from './hooks/useSubscription'
import { useReduceMotion } from './hooks/useReduceMotion'
import { Header } from './components/Header'
import { JoinDialog } from './components/JoinDialog'
import { MembersDialog } from './components/MembersDialog'
import { JoiningOverlay, P2P_MESSAGES } from './components/JoiningOverlay'
import { Paywall } from './components/Paywall'
import { LoyaltyCardScanner } from './components/LoyaltyCardScanner'
import { LoyaltyCardViewer } from './components/LoyaltyCardViewer'
import type { LoyaltyCard } from './components/LoyaltyCardScanner'
import InertialElasticList from './components/intertial_scroll'
import { VisualGridList } from './components/VisualGridList'
import { AddItemBar } from './components/AddItemBar'
import { Fab } from './components/Fab'
import { SummaryBar } from './components/SummaryBar'
import { SnackbarProvider, useSnackbar } from './components/Snackbar'
import { haptics } from './feedback'
import { useTheme } from './theme'
import {
    createJoinConfirmationRequest,
    extractInviteFromInput,
    planIncomingLinkJoin,
    resolveJoinConfirmation,
    type JoinConfirmationRequest,
} from './invite-confirmation'
import type { ItemIconVariant } from './components/itemIconMap'
import type { ListEntry, SizeOption } from './components/_types'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true)
}

const PREF_GRID_VIEW = '@lista_grid_view'
const PREF_CATEGORIES = '@lista_categories'
const PREF_LOYALTY_CARDS = '@lista_loyalty_cards'
const PREF_GRID_ICON_SIZE = '@lista_grid_icon_size'
const PREF_LIST_TEXT_SIZE = '@lista_list_text_size'
const PREF_CATEGORY_HEADERS = '@lista_category_headers'
const PREF_ITEM_ICON_VARIANT = '@lista_item_icon_variant'
const PREF_LOCALE_CHOICE = '@lista_locale_choice'

function parseStoredLoyaltyCards(raw: string | null): LoyaltyCard[] {
    if (!raw) return []
    try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed
            .filter((card): card is LoyaltyCard => (
                card &&
                typeof card.id === 'string' &&
                typeof card.name === 'string' &&
                typeof card.data === 'string'
            ))
            .map((card) => ({
                id: card.id,
                name: card.name,
                data: card.data,
                type: typeof card.type === 'string' ? card.type : 'unknown',
            }))
    } catch {
        return []
    }
}

function indexLoyaltyCardPayloads(cards: LoyaltyCard[]): Record<string, LoyaltyCard> {
    return cards.reduce<Record<string, LoyaltyCard>>((acc, card) => {
        acc[card.id] = card
        return acc
    }, {})
}

function serializeLoyaltyCardPayloads(cardsById: Record<string, LoyaltyCard>): string {
    return JSON.stringify(Object.values(cardsById))
}

function AppInner() {
    const t = useTheme()
    const insets = useSafeAreaInsets()
    const snackbar = useSnackbar()
    const reduceMotion = useReduceMotion()
    const dispatch = useAppDispatch()
    const {
        isGridView,
        categoriesEnabled,
        categoryHeadersVisible,
        gridIconSize,
        listTextSize,
        itemIconVariant,
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
        sendRPC,
    } = useWorklet(notify)

    const subscription = useSubscription()

    const [joinDialogVisible, setJoinDialogVisible] = useState(false)
    const [joinKeyInput, setJoinKeyInput] = useState('')
    const [membersDialogVisible, setMembersDialogVisible] = useState(false)
    const [recoverCodeInput, setRecoverCodeInput] = useState('')
    const [currentP2PMessage, setCurrentP2PMessage] = useState(0)
    const [menuVisible, setMenuVisible] = useState(false)
    const [scannerVisible, setScannerVisible] = useState(false)
    const [selectedCard, setSelectedCard] = useState<LoyaltyCard | null>(null)
    const [isAdding, setIsAdding] = useState(false)
    const [addText, setAddText] = useState('')

    const loyaltyCardPayloadsRef = useRef<Record<string, LoyaltyCard>>({})
    const pendingConfirmedInviteRef = useRef('')
    const pendingJoinConfirmationInviteRef = useRef('')
    const initialDeepLinkHandledRef = useRef(false)

    const animate = useCallback(() => {
        if (!reduceMotion) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
        }
    }, [reduceMotion])

    const beginJoinWithInvite = useCallback((rawInvite: string) => {
        const invite = extractInviteFromInput(rawInvite)
        if (!invite) {
            snackbar.show('Enter a valid invite key or link', 'error')
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
    }, [isJoiningRef, isWorkletReady, sendRPC, setIsJoining, snackbar])

    const presentJoinConfirmation = useCallback((request: JoinConfirmationRequest) => {
        if (request.status === 'invalid') {
            snackbar.show(request.notification || 'Enter a valid invite key or link', 'error')
            return false
        }
        if (request.status === 'busy' || request.status === 'confirmation-open') {
            snackbar.show(request.notification || 'Already joining an invite')
            return false
        }
        if (request.status === 'already-pending') return true

        pendingJoinConfirmationInviteRef.current = request.pendingInvite
        Alert.alert(
            request.title || 'Join this Listam invite?',
            request.message || '',
            [
                {
                    text: 'Cancel',
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
                    text: 'Join',
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
    }, [beginJoinWithInvite, snackbar])

    const requestJoinConfirmation = useCallback((rawInvite: string, source: 'link' | 'manual') => {
        return presentJoinConfirmation(createJoinConfirmationRequest(rawInvite, {
            source,
            pendingInvite: pendingJoinConfirmationInviteRef.current,
            isJoining: isJoiningRef.current,
        }))
    }, [isJoiningRef, presentJoinConfirmation])

    useEffect(() => {
        AsyncStorage.multiGet([
            PREF_GRID_VIEW,
            PREF_CATEGORIES,
            PREF_LOYALTY_CARDS,
            PREF_GRID_ICON_SIZE,
            PREF_LIST_TEXT_SIZE,
            PREF_CATEGORY_HEADERS,
            PREF_ITEM_ICON_VARIANT,
            PREF_LOCALE_CHOICE,
        ]).then(([[, grid], [, cats], [, cards], [, gridSize], [, textSize], [, categoryHeaders], [, iconVariant], [, localeChoice]]) => {
            dispatch(preferencesActions.preferencesHydrated({
                ...(grid !== null ? { isGridView: grid === 'true' } : {}),
                ...(cats !== null ? { categoriesEnabled: cats === 'true' } : {}),
                ...(isSizeOption(gridSize) ? { gridIconSize: gridSize } : {}),
                ...(isSizeOption(textSize) ? { listTextSize: textSize } : {}),
                ...(categoryHeaders !== null ? { categoryHeadersVisible: categoryHeaders === 'true' } : {}),
                ...(isItemIconVariant(iconVariant) ? { itemIconVariant: iconVariant } : {}),
                ...(localeChoice !== null && localeChoice.trim() ? { localeChoice } : {}),
            }))

            const storedCards = parseStoredLoyaltyCards(cards)
            loyaltyCardPayloadsRef.current = indexLoyaltyCardPayloads(storedCards)
            dispatch(loyaltyCardsActions.loyaltyCardsHydrated(storedCards.map(toLoyaltyCardHandle)))
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

    const handleItemIconVariantChange = useCallback((variant: ItemIconVariant) => {
        dispatch(preferencesActions.itemIconVariantSet(variant))
        AsyncStorage.setItem(PREF_ITEM_ICON_VARIANT, variant)
    }, [dispatch])

    const handleToggleCategoryHeaders = useCallback(() => {
        const next = !categoryHeadersVisible
        dispatch(preferencesActions.categoryHeadersVisibleSet(next))
        AsyncStorage.setItem(PREF_CATEGORY_HEADERS, String(next))
    }, [categoryHeadersVisible, dispatch])

    const handleCardScanned = useCallback((card: LoyaltyCard) => {
        const nextPayloads = { ...loyaltyCardPayloadsRef.current, [card.id]: card }
        loyaltyCardPayloadsRef.current = nextPayloads
        dispatch(loyaltyCardsActions.loyaltyCardAdded(toLoyaltyCardHandle(card)))
        AsyncStorage.setItem(PREF_LOYALTY_CARDS, serializeLoyaltyCardPayloads(nextPayloads))
        setScannerVisible(false)
        snackbar.show(`Saved ${card.name} card`, 'success')
    }, [dispatch, snackbar])

    const handleDeleteCard = useCallback((id: string) => {
        const nextPayloads = { ...loyaltyCardPayloadsRef.current }
        delete nextPayloads[id]
        loyaltyCardPayloadsRef.current = nextPayloads
        dispatch(loyaltyCardsActions.loyaltyCardRemoved(id))
        AsyncStorage.setItem(PREF_LOYALTY_CARDS, serializeLoyaltyCardPayloads(nextPayloads))
    }, [dispatch])

    const handleSelectCard = useCallback((card: LoyaltyCardHandle) => {
        const payload = loyaltyCardPayloadsRef.current[card.payloadRef] ?? loyaltyCardPayloadsRef.current[card.id]
        if (payload) {
            setSelectedCard(payload)
            return
        }

        AsyncStorage.getItem(PREF_LOYALTY_CARDS)
            .then((raw) => {
                const storedCards = parseStoredLoyaltyCards(raw)
                loyaltyCardPayloadsRef.current = indexLoyaltyCardPayloads(storedCards)
                const reloaded = loyaltyCardPayloadsRef.current[card.payloadRef] ?? loyaltyCardPayloadsRef.current[card.id]
                if (reloaded) setSelectedCard(reloaded)
                else snackbar.show('Could not load that loyalty card', 'error')
            })
            .catch(() => snackbar.show('Could not load that loyalty card', 'error'))
    }, [snackbar])

    useEffect(() => {
        const handleIncomingUrl = (url: string | null) => {
            if (!url) return
            const request = planIncomingLinkJoin(url, {
                pendingInvite: pendingJoinConfirmationInviteRef.current,
                isJoining: isJoiningRef.current,
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
    }, [isJoiningRef, presentJoinConfirmation])

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
            setCurrentP2PMessage((prev) => (prev + 1) % P2P_MESSAGES.length)
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
            snackbar.show('An item with that name already exists', 'error')
            return
        }
        animate()
        // Rename is an in-place update, not delete+add: it preserves the item's
        // stable id (so duplicate-name convergence holds), its done state, and its
        // position. The id rides along in `...old` even for backfilled legacy items.
        const updatedItem = { ...old, text: trimmed, updatedAt: Date.now() }
        dispatch(listsActions.listItemUpdated(updatedItem))
        sendRPC(RPC_UPDATE, JSON.stringify({ item: updatedItem }))
    }, [animate, dataList, dispatch, sendRPC, snackbar])

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
            snackbar.show('That item is already on the list')
            setAddText('')
            return
        }
        handleInsert(0, value)
        haptics.toggleOn()
        setAddText('')
    }, [addText, dataList, handleInsert, snackbar])

    const handleShare = useCallback(async () => {
        if (!autobaseInviteKey) {
            snackbar.show(isWorkletReady ? 'Only the owner device can create invites' : 'Invite key not ready yet — try again in a moment')
            return
        }
        try {
            const inviteLink = `https://listam.ch/join?invite=${encodeURIComponent(autobaseInviteKey)}`
            await Share.share({
                message: `Join my Listam list:\n${inviteLink}\n\nInvite code: ${autobaseInviteKey}\n\nThis invite is single-use, expires in 10 minutes, and can be revoked before use. Removing a joined device requires re-keying.`,
                title: 'Join my Listam list',
            })
        } catch {
            snackbar.show('Could not open the share sheet', 'error')
        }
    }, [autobaseInviteKey, isWorkletReady, snackbar])

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
            snackbar.show('Enter your recovery code', 'error')
            return
        }
        sendRPC(RPC_RECOVER_OWNER, JSON.stringify({ code }))
        setRecoverCodeInput('')
    }, [recoverCodeInput, sendRPC, snackbar])

    const handleCloseMembers = useCallback(() => {
        setMembersDialogVisible(false)
        setRecoverCodeInput('')
        clearOwnerRecoveryCode()
    }, [clearOwnerRecoveryCode])

    const handleJoinSubmit = useCallback(() => {
        if (!joinKeyInput.trim()) {
            snackbar.show('Enter an invite key', 'error')
            return
        }
        const didRequestJoin = requestJoinConfirmation(joinKeyInput, 'manual')
        if (!didRequestJoin) return
        setJoinDialogVisible(false)
        setJoinKeyInput('')
    }, [joinKeyInput, requestJoinConfirmation, snackbar])

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
            'Delete All Items',
            'Are you sure you want to delete all items? This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete All',
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
    }, [animate, dataList, dispatch, sendRPC])

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
            <Header
                peerCount={peerCount}
                isWorkletReady={isWorkletReady}
                onShare={handleShare}
                onJoin={handleJoin}
                onManageMembers={handleManageMembers}
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
                gridIconSize={gridIconSize}
                onGridIconSizeChange={handleGridIconSizeChange}
                listTextSize={listTextSize}
                onListTextSizeChange={handleListTextSizeChange}
                itemIconVariant={itemIconVariant}
                onItemIconVariantChange={handleItemIconVariantChange}
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
            <JoiningOverlay
                visible={isJoining}
                currentMessageIndex={currentP2PMessage}
                joinPhase={joinPhase}
                onCancel={handleJoiningCancel}
            />

            {isGridView ? (
                <VisualGridList
                    data={dataList}
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
                    data={dataList}
                    onToggleDone={handleToggleDone}
                    onDelete={handleDelete}
                    onEdit={handleEditItem}
                    onRequestAdd={handleRequestAdd}
                    categoriesEnabled={categoriesEnabled}
                    categoryHeadersVisible={categoryHeadersVisible}
                    listTextSize={listTextSize}
                    reduceMotion={reduceMotion}
                />
            )}

            {hasItems && (
                <SummaryBar
                    remaining={remaining}
                    doneCount={doneCount}
                    onClearCompleted={handleClearCompleted}
                />
            )}

            {!isAdding && <Fab onPress={handleRequestAdd} bottomOffset={insets.bottom + 20} />}

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
        </View>
    )
}

export default function App() {
    return (
        <Provider store={store}>
            <SafeAreaProvider>
                <SnackbarProvider>
                    <AppInner />
                </SnackbarProvider>
            </SafeAreaProvider>
        </Provider>
    )
}

export type { ListEntry }
