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
import * as Linking from 'expo-linking'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useWorklet, RPC_UPDATE, RPC_DELETE, RPC_ADD, RPC_JOIN_KEY, type NotifyType } from './hooks/_useWorklet'
import { useSubscription } from './hooks/useSubscription'
import { useReduceMotion } from './hooks/useReduceMotion'
import { Header } from './components/Header'
import { JoinDialog } from './components/JoinDialog'
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

const SIZE_VALUES: SizeOption[] = ['small', 'medium', 'normal', 'large']
const isSizeOption = (value: string | null): value is SizeOption =>
    value !== null && (SIZE_VALUES as string[]).includes(value)

function AppInner() {
    const t = useTheme()
    const insets = useSafeAreaInsets()
    const snackbar = useSnackbar()
    const reduceMotion = useReduceMotion()

    const notify = useCallback(
        (message: string, type: NotifyType = 'info') => snackbar.show(message, type),
        [snackbar]
    )

    const {
        dataList,
        setDataList,
        autobaseInviteKey,
        peerCount,
        isWorkletReady,
        isJoining,
        setIsJoining,
        isJoiningRef,
        joinPhase,
        sendRPC,
    } = useWorklet(notify)

    const subscription = useSubscription()

    const [joinDialogVisible, setJoinDialogVisible] = useState(false)
    const [joinKeyInput, setJoinKeyInput] = useState('')
    const [currentP2PMessage, setCurrentP2PMessage] = useState(0)
    const [isGridView, setIsGridView] = useState(false)
    const [categoriesEnabled, setCategoriesEnabled] = useState(true)
    const [categoryHeadersVisible, setCategoryHeadersVisible] = useState(true)
    const [gridIconSize, setGridIconSize] = useState<SizeOption>('normal')
    const [listTextSize, setListTextSize] = useState<SizeOption>('normal')
    const [itemIconVariant, setItemIconVariant] = useState<ItemIconVariant>('illustrated')
    const [menuVisible, setMenuVisible] = useState(false)
    const [loyaltyCards, setLoyaltyCards] = useState<LoyaltyCard[]>([])
    const [scannerVisible, setScannerVisible] = useState(false)
    const [selectedCard, setSelectedCard] = useState<LoyaltyCard | null>(null)
    const [isAdding, setIsAdding] = useState(false)
    const [addText, setAddText] = useState('')

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
        ]).then(([[, grid], [, cats], [, cards], [, gridSize], [, textSize], [, categoryHeaders], [, iconVariant]]) => {
            if (grid !== null) setIsGridView(grid === 'true')
            if (cats !== null) setCategoriesEnabled(cats === 'true')
            if (isSizeOption(gridSize)) setGridIconSize(gridSize)
            if (isSizeOption(textSize)) setListTextSize(textSize)
            if (categoryHeaders !== null) setCategoryHeadersVisible(categoryHeaders === 'true')
            if (iconVariant === 'illustrated' || iconVariant === 'minimal') setItemIconVariant(iconVariant)
            if (cards !== null) {
                try { setLoyaltyCards(JSON.parse(cards)) } catch {}
            }
        })
    }, [])

    const handleToggleView = useCallback(() => {
        setIsGridView((prev) => {
            AsyncStorage.setItem(PREF_GRID_VIEW, String(!prev))
            return !prev
        })
    }, [])

    const handleToggleCategories = useCallback(() => {
        setCategoriesEnabled((prev) => {
            AsyncStorage.setItem(PREF_CATEGORIES, String(!prev))
            return !prev
        })
    }, [])

    const handleGridIconSizeChange = useCallback((size: SizeOption) => {
        setGridIconSize(size)
        AsyncStorage.setItem(PREF_GRID_ICON_SIZE, size)
    }, [])

    const handleListTextSizeChange = useCallback((size: SizeOption) => {
        setListTextSize(size)
        AsyncStorage.setItem(PREF_LIST_TEXT_SIZE, size)
    }, [])

    const handleItemIconVariantChange = useCallback((variant: ItemIconVariant) => {
        setItemIconVariant(variant)
        AsyncStorage.setItem(PREF_ITEM_ICON_VARIANT, variant)
    }, [])

    const handleToggleCategoryHeaders = useCallback(() => {
        setCategoryHeadersVisible((prev) => {
            AsyncStorage.setItem(PREF_CATEGORY_HEADERS, String(!prev))
            return !prev
        })
    }, [])

    const handleCardScanned = useCallback((card: LoyaltyCard) => {
        setLoyaltyCards((prev) => {
            const next = [...prev, card]
            AsyncStorage.setItem(PREF_LOYALTY_CARDS, JSON.stringify(next))
            return next
        })
        setScannerVisible(false)
        snackbar.show(`Saved ${card.name} card`, 'success')
    }, [snackbar])

    const handleDeleteCard = useCallback((id: string) => {
        setLoyaltyCards((prev) => {
            const next = prev.filter((c) => c.id !== id)
            AsyncStorage.setItem(PREF_LOYALTY_CARDS, JSON.stringify(next))
            return next
        })
    }, [])

    const handleSelectCard = useCallback((card: LoyaltyCard) => {
        setSelectedCard(card)
    }, [])

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
        setDataList((prevList) => {
            const newList = [...prevList]
            const current = newList[index]
            if (!current) return prevList

            const updatedItem: ListEntry = {
                ...current,
                isDone: !current.isDone,
                timeOfCompletion: !current.isDone ? Date.now() : 0,
            }

            newList.splice(index, 1)
            if (updatedItem.isDone) {
                newList.push(updatedItem)
            } else {
                newList.unshift(updatedItem)
            }

            sendRPC(RPC_UPDATE, JSON.stringify({ item: updatedItem }))
            return newList
        })
    }, [animate, sendRPC, setDataList])

    const handleDelete = useCallback((index: number) => {
        const deletedItem = dataList[index]
        animate()
        setDataList((prevList) => prevList.filter((_, i) => i !== index))
        sendRPC(RPC_DELETE, JSON.stringify({ item: deletedItem }))
    }, [animate, dataList, sendRPC, setDataList])

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
        setDataList((prev) => prev.map((item, i) => (i === index ? { ...item, text: trimmed } : item)))
        sendRPC(RPC_DELETE, JSON.stringify({ item: old }))
        sendRPC(RPC_ADD, JSON.stringify(trimmed))
    }, [animate, dataList, sendRPC, setDataList, snackbar])

    const handleClearCompleted = useCallback(() => {
        const done = dataList.filter((item) => item.isDone)
        if (done.length === 0) return
        animate()
        setDataList((prev) => prev.filter((item) => !item.isDone))
        done.forEach((item) => sendRPC(RPC_DELETE, JSON.stringify({ item })))
        haptics.success()
    }, [animate, dataList, sendRPC, setDataList])

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
            snackbar.show('Invite key not ready yet — try again in a moment')
            return
        }
        try {
            const inviteLink = `https://listam.ch/join?invite=${encodeURIComponent(autobaseInviteKey)}`
            await Share.share({
                message: `Join my Listam list:\n${inviteLink}\n\nInvite code: ${autobaseInviteKey}\n\nThis invite is single-use, expires in 10 minutes, and grants writer access until the list is re-keyed.`,
                title: 'Join my Listam list',
            })
        } catch {
            snackbar.show('Could not open the share sheet', 'error')
        }
    }, [autobaseInviteKey, snackbar])

    const handleJoin = useCallback(() => {
        setJoinDialogVisible(true)
    }, [])

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
                        setDataList([])
                        haptics.delete()
                    },
                },
            ]
        )
    }, [animate, dataList, sendRPC, setDataList])

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
                autobaseInviteKey={autobaseInviteKey}
                peerCount={peerCount}
                isWorkletReady={isWorkletReady}
                onShare={handleShare}
                onJoin={handleJoin}
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
        <SafeAreaProvider>
            <SnackbarProvider>
                <AppInner />
            </SnackbarProvider>
        </SafeAreaProvider>
    )
}

export type { ListEntry }
