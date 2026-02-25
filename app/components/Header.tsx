import React, { useEffect, useRef } from 'react'
import {
    View,
    Text,
    Animated,
    Modal,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Switch,
    StyleSheet,
    Dimensions,
    ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { AnimatedIconButton } from './AnimatedIconButton'
import { headerStyles } from './_styles'
import type { LoyaltyCard } from './LoyaltyCardScanner'

const DRAWER_WIDTH = 280
const { height: SCREEN_HEIGHT } = Dimensions.get('window')

function cardColor(name: string): string {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e']
    return colors[Math.abs(hash) % colors.length]
}

type HeaderProps = {
    autobaseInviteKey: string
    peerCount: number
    blinkAnim: Animated.Value
    onShare: () => void
    onJoin: () => void
    trialDaysRemaining?: number
    menuVisible: boolean
    onMenuToggle: () => void
    onDeleteAll: () => void
    onNukeData: () => void
    isGridView: boolean
    onToggleView: () => void
    categoriesEnabled: boolean
    onToggleCategories: () => void
    loyaltyCards: LoyaltyCard[]
    onScanCard: () => void
    onSelectCard: (card: LoyaltyCard) => void
}

export function Header({
    autobaseInviteKey,
    peerCount,
    blinkAnim,
    onShare,
    onJoin,
    trialDaysRemaining,
    menuVisible,
    onMenuToggle,
    onDeleteAll,
    onNukeData,
    isGridView,
    onToggleView,
    categoriesEnabled,
    onToggleCategories,
    loyaltyCards,
    onScanCard,
    onSelectCard,
}: HeaderProps) {
    const peerCountLabel = peerCount > 99 ? '99+' : String(peerCount)
    const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current
    const overlayOpacity = useRef(new Animated.Value(0)).current

    useEffect(() => {
        if (menuVisible) {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver: true,
                }),
                Animated.timing(overlayOpacity, {
                    toValue: 1,
                    duration: 250,
                    useNativeDriver: true,
                }),
            ]).start()
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: -DRAWER_WIDTH,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(overlayOpacity, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start()
        }
    }, [menuVisible, slideAnim, overlayOpacity])

    const closeMenu = () => {
        if (menuVisible) onMenuToggle()
    }

    return (
        <SafeAreaView style={headerStyles.safeArea} edges={['top']}>
            <View style={headerStyles.container}>
                <View style={headerStyles.leftSection}>
                    <AnimatedIconButton
                        style={headerStyles.iconButton}
                        onPress={onMenuToggle}
                    >
                        <Ionicons name="menu-outline" size={24} color="#333" />
                    </AnimatedIconButton>
                    {trialDaysRemaining !== undefined && trialDaysRemaining <= 7 && (
                        <Text style={{ fontSize: 11, color: '#999', marginLeft: 8 }}>
                            {trialDaysRemaining} days left
                        </Text>
                    )}
                </View>

                {loyaltyCards.length > 0 && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={loyaltyStyles.scrollContent}
                        style={loyaltyStyles.scroll}
                    >
                        {loyaltyCards.map((card) => (
                            <TouchableOpacity
                                key={card.id}
                                style={[loyaltyStyles.cardCircle, { backgroundColor: cardColor(card.name) }]}
                                onPress={() => onSelectCard(card)}
                                activeOpacity={0.7}
                            >
                                <Text style={loyaltyStyles.cardLetter}>
                                    {card.name.charAt(0).toUpperCase()}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}

                <View style={headerStyles.rightSection}>
                    <View style={headerStyles.iconWithBadge}>
                        <AnimatedIconButton
                            style={headerStyles.iconButton}
                            onPress={onShare}
                        >
                            <Ionicons name="share-outline" size={24} color="#333" />
                        </AnimatedIconButton>
                        {!autobaseInviteKey ? (
                            <Animated.View style={[headerStyles.badge, headerStyles.orangeBadge, { opacity: blinkAnim }]} />
                        ) : peerCount > 0 ? (
                            <View style={headerStyles.pearBadge}>
                                <View style={headerStyles.pearStalk} />
                                <View style={headerStyles.pearTop} />
                                <View style={headerStyles.pearBottom}>
                                    <Text style={headerStyles.pearBadgeText}>{peerCountLabel}</Text>
                                </View>
                            </View>
                        ) : null}
                    </View>

                    <AnimatedIconButton
                        style={headerStyles.iconButton}
                        onPress={onJoin}
                    >
                        <Ionicons name="person-add-outline" size={24} color="#333" />
                    </AnimatedIconButton>
                </View>
            </View>

            <Modal
                visible={menuVisible}
                transparent
                animationType="none"
                onRequestClose={closeMenu}
            >
                <View style={drawerStyles.modalContainer}>
                    <TouchableWithoutFeedback onPress={closeMenu}>
                        <Animated.View
                            style={[
                                drawerStyles.overlay,
                                { opacity: overlayOpacity },
                            ]}
                        />
                    </TouchableWithoutFeedback>

                    <Animated.View
                        style={[
                            drawerStyles.drawer,
                            { transform: [{ translateX: slideAnim }] },
                        ]}
                    >
                        <View style={drawerStyles.drawerContent}>
                            {/* View Mode */}
                            <TouchableOpacity
                                style={drawerStyles.menuRow}
                                onPress={() => {
                                    onToggleView()
                                    closeMenu()
                                }}
                                activeOpacity={0.6}
                            >
                                <Ionicons
                                    name={isGridView ? 'list-outline' : 'grid-outline'}
                                    size={22}
                                    color="#333"
                                />
                                <Text style={drawerStyles.menuLabel}>
                                    {isGridView ? 'List View' : 'Grid View'}
                                </Text>
                            </TouchableOpacity>

                            {/* Categories */}
                            <View style={drawerStyles.menuRow}>
                                <Ionicons name="pricetags-outline" size={22} color="#333" />
                                <Text style={drawerStyles.menuLabel}>Categories</Text>
                                <Switch
                                    value={categoriesEnabled}
                                    onValueChange={onToggleCategories}
                                    trackColor={{ false: '#ccc', true: '#333' }}
                                    thumbColor="#fff"
                                    style={drawerStyles.switch}
                                />
                            </View>

                            {/* Scan Loyalty Card */}
                            <TouchableOpacity
                                style={drawerStyles.menuRow}
                                onPress={() => {
                                    onScanCard()
                                    closeMenu()
                                }}
                                activeOpacity={0.6}
                            >
                                <Ionicons name="card-outline" size={22} color="#333" />
                                <Text style={drawerStyles.menuLabel}>Scan Loyalty Card</Text>
                            </TouchableOpacity>

                            <View style={drawerStyles.separator} />

                            {/* Delete All */}
                            <TouchableOpacity
                                style={drawerStyles.menuRow}
                                onPress={() => {
                                    onDeleteAll()
                                    closeMenu()
                                }}
                                activeOpacity={0.6}
                            >
                                <Ionicons name="trash-outline" size={22} color="#d00" />
                                <Text style={[drawerStyles.menuLabel, { color: '#d00' }]}>
                                    Delete All
                                </Text>
                            </TouchableOpacity>

                            {/* Nuke Data */}
                            <TouchableOpacity
                                style={drawerStyles.menuRow}
                                onPress={() => {
                                    onNukeData()
                                    closeMenu()
                                }}
                                activeOpacity={0.6}
                            >
                                <Ionicons name="nuclear-outline" size={22} color="#d00" />
                                <Text style={[drawerStyles.menuLabel, { color: '#d00' }]}>
                                    Nuke Data
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </View>
            </Modal>
        </SafeAreaView>
    )
}

const drawerStyles = StyleSheet.create({
    modalContainer: {
        flex: 1,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    drawer: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: DRAWER_WIDTH,
        height: SCREEN_HEIGHT,
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 10,
    },
    drawerContent: {
        paddingTop: 80,
        paddingHorizontal: 20,
    },
    menuRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
    },
    menuLabel: {
        fontSize: 16,
        color: '#333',
        marginLeft: 14,
        flex: 1,
    },
    switch: {
        marginLeft: 'auto',
    },
    separator: {
        height: 1,
        backgroundColor: '#eee',
        marginVertical: 8,
    },
})

const loyaltyStyles = StyleSheet.create({
    scroll: {
        flexShrink: 1,
        marginHorizontal: 8,
    },
    scrollContent: {
        alignItems: 'center',
        gap: 6,
    },
    cardCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardLetter: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '700',
    },
})
