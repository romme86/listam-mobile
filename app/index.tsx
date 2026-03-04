import React, { useEffect, useRef, useState, useCallback } from 'react'
import { View, Share, Alert, Animated } from 'react-native'
import * as Linking from 'expo-linking'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useWorklet, RPC_UPDATE, RPC_DELETE, RPC_ADD, RPC_JOIN_KEY, RPC_NUKE } from './hooks/_useWorklet'
import { useSubscription } from './hooks/useSubscription'
import { Header } from './components/Header'
import { JoinDialog } from './components/JoinDialog'
import { JoiningOverlay, P2P_MESSAGES } from './components/JoiningOverlay'
import { Paywall } from './components/Paywall'
import { LoyaltyCardScanner } from './components/LoyaltyCardScanner'
import { LoyaltyCardViewer } from './components/LoyaltyCardViewer'
import type { LoyaltyCard } from './components/LoyaltyCardScanner'
import InertialElasticList from './components/intertial_scroll'
import { VisualGridList } from './components/VisualGridList'
import { styles } from './components/_styles'
import type { ListEntry } from './components/_types'

const PREF_GRID_VIEW = '@lista_grid_view'
const PREF_CATEGORIES = '@lista_categories'
const PREF_LOYALTY_CARDS = '@lista_loyalty_cards'
const PREF_GRID_ICON_SIZE = '@lista_grid_icon_size'
const PREF_LIST_TEXT_SIZE = '@lista_list_text_size'
const PREF_CATEGORY_HEADERS = '@lista_category_headers'

const DEFAULT_INSTRUCTIONS: ListEntry[] = [
    { text: 'Double tap to add new', isDone: false, timeOfCompletion: 0 },
    { text: 'Tap to mark as done', isDone: false, timeOfCompletion: 0 },
    { text: 'Slide right slowly to delete', isDone: false, timeOfCompletion: 0 },
]

export default function App() {
    const {
        dataList,
        setDataList,
        autobaseInviteKey,
        peerCount,
        isWorkletReady,
        isJoining,
        setIsJoining,
        isJoiningRef,
        sendRPC,
    } = useWorklet()

    const subscription = useSubscription()

    const [joinDialogVisible, setJoinDialogVisible] = useState(false)
    const [joinKeyInput, setJoinKeyInput] = useState('')
    const [currentP2PMessage, setCurrentP2PMessage] = useState(0)
    const [isGridView, setIsGridView] = useState(false)
    const [categoriesEnabled, setCategoriesEnabled] = useState(true)
    const [categoryHeadersVisible, setCategoryHeadersVisible] = useState(true)
    const [gridIconSize, setGridIconSize] = useState<'small' | 'medium' | 'normal'>('normal')
    const [listTextSize, setListTextSize] = useState<'small' | 'medium' | 'normal'>('normal')
    const [menuVisible, setMenuVisible] = useState(false)
    const [loyaltyCards, setLoyaltyCards] = useState<LoyaltyCard[]>([])
    const [scannerVisible, setScannerVisible] = useState(false)
    const [selectedCard, setSelectedCard] = useState<LoyaltyCard | null>(null)
    const blinkAnim = useRef(new Animated.Value(1)).current
    const lastAutoJoinInviteRef = useRef('')
    const pendingDeepLinkInviteRef = useRef('')

    const normalizeInvite = useCallback((raw: string) => {
        if (typeof raw !== 'string') return ''
        return raw.trim().replace(/\s+/g, '')
    }, [])

    const extractInviteFromInput = useCallback((raw: string) => {
        const trimmed = raw.trim()
        if (!trimmed) return ''
        if (trimmed.includes('://')) {
            const parsed = Linking.parse(trimmed)
            const inviteParam = parsed.queryParams?.invite
            if (typeof inviteParam === 'string') {
                return normalizeInvite(inviteParam)
            }
        }
        return normalizeInvite(trimmed)
    }, [normalizeInvite])

    const startJoinWithInvite = useCallback((rawInvite: string) => {
        const invite = extractInviteFromInput(rawInvite)
        if (!invite) {
            Alert.alert('Error', 'Please enter a valid invite key or invite link')
            return false
        }
        if (!isWorkletReady) {
            pendingDeepLinkInviteRef.current = invite
            return true
        }
        setIsJoining(true)
        setCurrentP2PMessage(0)
        isJoiningRef.current = true
        sendRPC(RPC_JOIN_KEY, JSON.stringify({ key: invite }))
        return true
    }, [extractInviteFromInput, isJoiningRef, isWorkletReady, sendRPC, setIsJoining])

    useEffect(() => {
        AsyncStorage.multiGet([
            PREF_GRID_VIEW,
            PREF_CATEGORIES,
            PREF_LOYALTY_CARDS,
            PREF_GRID_ICON_SIZE,
            PREF_LIST_TEXT_SIZE,
            PREF_CATEGORY_HEADERS,
        ]).then(([[, grid], [, cats], [, cards], [, gridSize], [, textSize], [, categoryHeaders]]) => {
            if (grid !== null) setIsGridView(grid === 'true')
            if (cats !== null) setCategoriesEnabled(cats === 'true')
            if (gridSize === 'small' || gridSize === 'medium' || gridSize === 'normal') setGridIconSize(gridSize)
            if (textSize === 'small' || textSize === 'medium' || textSize === 'normal') setListTextSize(textSize)
            if (categoryHeaders !== null) setCategoryHeadersVisible(categoryHeaders === 'true')
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

    const handleGridIconSizeChange = useCallback((size: 'small' | 'medium' | 'normal') => {
        setGridIconSize(size)
        AsyncStorage.setItem(PREF_GRID_ICON_SIZE, size)
    }, [])

    const handleListTextSizeChange = useCallback((size: 'small' | 'medium' | 'normal') => {
        setListTextSize(size)
        AsyncStorage.setItem(PREF_LIST_TEXT_SIZE, size)
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
    }, [])

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

    // Blinking animation when key is not ready
    useEffect(() => {
        if (!autobaseInviteKey) {
            const blink = Animated.loop(
                Animated.sequence([
                    Animated.timing(blinkAnim, {
                        toValue: 0.3,
                        duration: 500,
                        useNativeDriver: true,
                    }),
                    Animated.timing(blinkAnim, {
                        toValue: 1,
                        duration: 500,
                        useNativeDriver: true,
                    }),
                ])
            )
            blink.start()
            return () => blink.stop()
        } else {
            blinkAnim.setValue(1)
        }
    }, [autobaseInviteKey, blinkAnim])

    useEffect(() => {
        const handleIncomingUrl = (url: string | null) => {
            if (!url) return
            const invite = extractInviteFromInput(url)
            if (!invite) return
            if (lastAutoJoinInviteRef.current === invite) return
            lastAutoJoinInviteRef.current = invite
            startJoinWithInvite(invite)
        }

        Linking.getInitialURL().then((url) => {
            handleIncomingUrl(url)
        }).catch((error) => {
            console.log('Failed to read initial URL', error)
        })

        const subscription = Linking.addEventListener('url', ({ url }) => {
            handleIncomingUrl(url)
        })

        return () => {
            subscription.remove()
        }
    }, [extractInviteFromInput, startJoinWithInvite])

    useEffect(() => {
        if (!isWorkletReady) return
        if (!pendingDeepLinkInviteRef.current) return
        const invite = pendingDeepLinkInviteRef.current
        pendingDeepLinkInviteRef.current = ''
        startJoinWithInvite(invite)
    }, [isWorkletReady, startJoinWithInvite])

    // Rotate P2P messages while joining
    useEffect(() => {
        if (!isJoining) return
        const interval = setInterval(() => {
            setCurrentP2PMessage((prev) => (prev + 1) % P2P_MESSAGES.length)
        }, 3000)
        return () => clearInterval(interval)
    }, [isJoining])

    const handleToggleDone = useCallback((index: number) => {
        setDataList((prevList) => {
            const newList = [...prevList]
            const current = newList[index]

            if (!current) {
                return prevList
            }

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
    }, [sendRPC, setDataList])

    const handleDelete = useCallback((index: number) => {
        const deletedItem = dataList[index]
        setDataList((prevList) => prevList.filter((_, i) => i !== index))
        sendRPC(RPC_DELETE, JSON.stringify({ item: deletedItem }))
    }, [dataList, sendRPC, setDataList])

    const handleInsert = useCallback((_index: number, text: string) => {
        const defaultTexts = [
            'Tap to mark as done',
            'Double tap to add new',
            'Slide right slowly to delete'
        ]
        const defaultEntries = dataList.filter(item => defaultTexts.includes(item.text))
        if (defaultEntries.length > 0) {
            for (const entry of defaultEntries) {
                sendRPC(RPC_DELETE, JSON.stringify({ item: entry }))
            }
        }
        sendRPC(RPC_ADD, JSON.stringify(text))
    }, [dataList, sendRPC])

    const handleShare = useCallback(async () => {
        if (!autobaseInviteKey) {
            Alert.alert('Connection in progress', 'Invite key is not available yet. Please wait a moment and try again.')
            return
        }

        try {
            const inviteLink = Linking.createURL('/join', {
                scheme: 'ch.saynode.listam',
                queryParams: { invite: autobaseInviteKey }
            })
            await Share.share({
                message: inviteLink,
                title: 'Join my Listam list'
            })
        } catch (error) {
            console.log('Error sharing:', error)
        }
    }, [autobaseInviteKey])

    const handleJoin = useCallback(() => {
        setJoinDialogVisible(true)
    }, [])

    const handleJoinSubmit = useCallback(() => {
        if (!joinKeyInput.trim()) {
            Alert.alert('Error', 'Please enter an invite key')
            return
        }

        const didStartJoin = startJoinWithInvite(joinKeyInput)
        if (!didStartJoin) return

        setJoinDialogVisible(false)
        setJoinKeyInput('')
    }, [joinKeyInput, startJoinWithInvite])

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
                        dataList.forEach((item) => {
                            sendRPC(RPC_DELETE, JSON.stringify({ item }))
                        })
                        setDataList([])
                    },
                },
            ]
        )
    }, [dataList, sendRPC, setDataList])

    const handleNukeData = useCallback(() => {
        Alert.alert(
            'Nuke Data',
            'This will permanently delete all data and generate a new identity. Any connected peers will be disconnected. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Nuke',
                    style: 'destructive',
                    onPress: () => {
                        setDataList([])
                        sendRPC(RPC_NUKE)
                    },
                },
            ]
        )
    }, [sendRPC, setDataList])

    // Show paywall if trial expired and not subscribed
    if (subscription.shouldShowPaywall) {
        return (
            <SafeAreaProvider>
                <Paywall
                    state={subscription}
                    onPurchase={subscription.purchase}
                    onRestore={subscription.restore}
                />
            </SafeAreaProvider>
        )
    }

    return (
        <SafeAreaProvider>
            <View style={styles.container}>
                <Header
                    autobaseInviteKey={autobaseInviteKey}
                    peerCount={peerCount}
                    blinkAnim={blinkAnim}
                    onShare={handleShare}
                    onJoin={handleJoin}
                    trialDaysRemaining={subscription.isTrialActive ? subscription.trialDaysRemaining : undefined}
                    menuVisible={menuVisible}
                    onMenuToggle={() => setMenuVisible(v => !v)}
                    onDeleteAll={handleDeleteAll}
                    onNukeData={handleNukeData}
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
                    loyaltyCards={loyaltyCards}
                    onScanCard={() => setScannerVisible(true)}
                    onSelectCard={handleSelectCard}
                />
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
                    onCancel={handleJoiningCancel}
                />
                {isGridView ? (
                    <VisualGridList
                        data={dataList.length === 0 ? DEFAULT_INSTRUCTIONS : dataList}
                        onToggleDone={dataList.length === 0 ? () => {} : handleToggleDone}
                        onDelete={dataList.length === 0 ? () => {} : handleDelete}
                        onInsert={handleInsert}
                        categoriesEnabled={categoriesEnabled}
                        categoryHeadersVisible={categoryHeadersVisible}
                        gridIconSize={gridIconSize}
                    />
                ) : (
                    <InertialElasticList
                        data={dataList.length === 0 ? DEFAULT_INSTRUCTIONS : dataList}
                        onToggleDone={dataList.length === 0 ? () => {} : handleToggleDone}
                        onDelete={dataList.length === 0 ? () => {} : handleDelete}
                        onInsert={handleInsert}
                        categoriesEnabled={categoriesEnabled}
                        categoryHeadersVisible={categoryHeadersVisible}
                        listTextSize={listTextSize}
                    />
                )}
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
        </SafeAreaProvider>
    )
}

export type { ListEntry }
