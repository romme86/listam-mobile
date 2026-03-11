import React, { useEffect, useRef } from 'react'
import {
    View,
    Text,
    Animated,
    Modal,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Switch,
    ScrollView,
    StyleSheet,
    Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { AnimatedIconButton } from './AnimatedIconButton'
import { headerStyles } from './_styles'
import type { LoyaltyCard } from './LoyaltyCardScanner'
import type { ItemIconVariant } from './itemIconMap'

const DRAWER_WIDTH = 280
const { height: SCREEN_HEIGHT } = Dimensions.get('window')
const HEADER_ICON_SIZE = 22
const HEADER_TEXT_SIZE = 12
const GRID_SIZE_OPTIONS = ['small', 'medium', 'normal'] as const
const LIST_TEXT_SIZE_OPTIONS = ['small', 'medium', 'normal'] as const
const ITEM_ICON_VARIANT_OPTIONS: ItemIconVariant[] = ['illustrated', 'minimal']

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
    isGridView: boolean
    onToggleView: () => void
    categoriesEnabled: boolean
    onToggleCategories: () => void
    categoryHeadersVisible: boolean
    onToggleCategoryHeaders: () => void
    gridIconSize: 'small' | 'medium' | 'normal'
    onGridIconSizeChange: (size: 'small' | 'medium' | 'normal') => void
    listTextSize: 'small' | 'medium' | 'normal'
    onListTextSizeChange: (size: 'small' | 'medium' | 'normal') => void
    itemIconVariant: ItemIconVariant
    onItemIconVariantChange: (variant: ItemIconVariant) => void
    loyaltyCards: LoyaltyCard[]
    onScanCard: () => void
    onSelectCard: (card: LoyaltyCard) => void
}

function LoyaltyCardChip({
    card,
    onPress,
    compact = false,
}: {
    card: LoyaltyCard
    onPress?: () => void
    compact?: boolean
}) {
    const content = (
        <View
            style={[
                loyaltyStyles.cardChip,
                compact && loyaltyStyles.cardChipCompact,
                { backgroundColor: cardColor(card.name) },
            ]}
        >
            <Ionicons
                name="card-outline"
                size={compact ? 16 : HEADER_ICON_SIZE}
                color="#fff"
            />
            <Text
                style={[
                    loyaltyStyles.cardLetter,
                    compact && loyaltyStyles.cardLetterCompact,
                ]}
            >
                {card.name.charAt(0).toUpperCase()}
            </Text>
        </View>
    )

    if (!onPress) return content

    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
            {content}
        </TouchableOpacity>
    )
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
    isGridView,
    onToggleView,
    categoriesEnabled,
    onToggleCategories,
    categoryHeadersVisible,
    onToggleCategoryHeaders,
    gridIconSize,
    onGridIconSizeChange,
    listTextSize,
    onListTextSizeChange,
    itemIconVariant,
    onItemIconVariantChange,
    loyaltyCards,
    onScanCard,
    onSelectCard,
}: HeaderProps) {
    const peerCountLabel = peerCount > 99 ? '99+' : String(peerCount)
    const primaryLoyaltyCard = loyaltyCards[0] ?? null
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
                        <Ionicons name="menu-outline" size={HEADER_ICON_SIZE} color="#333" />
                    </AnimatedIconButton>
                    {trialDaysRemaining !== undefined && trialDaysRemaining <= 7 && (
                        <Text style={{ fontSize: HEADER_TEXT_SIZE, color: '#999', marginLeft: 8 }}>
                            {trialDaysRemaining} days left
                        </Text>
                    )}
                </View>

                <View style={headerStyles.rightSection}>
                    <AnimatedIconButton
                        style={headerStyles.iconButton}
                        onPress={() => {
                            if (primaryLoyaltyCard) {
                                onSelectCard(primaryLoyaltyCard)
                            } else {
                                onScanCard()
                            }
                        }}
                    >
                        <Ionicons name="card-outline" size={HEADER_ICON_SIZE} color="#333" />
                    </AnimatedIconButton>

                    <View style={headerStyles.iconWithBadge}>
                        <AnimatedIconButton
                            style={headerStyles.iconButton}
                            onPress={onShare}
                        >
                            <Ionicons name="share-outline" size={HEADER_ICON_SIZE} color="#333" />
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
                        <Ionicons name="person-add-outline" size={HEADER_ICON_SIZE} color="#333" />
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
                        <ScrollView
                            style={drawerStyles.drawerScroll}
                            contentContainerStyle={drawerStyles.drawerContent}
                            showsVerticalScrollIndicator={false}
                        >
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

                            <View style={drawerStyles.menuRow}>
                                <Ionicons name="eye-off-outline" size={22} color="#333" />
                                <Text style={drawerStyles.menuLabel}>Category Headers</Text>
                                <Switch
                                    value={categoryHeadersVisible}
                                    onValueChange={onToggleCategoryHeaders}
                                    trackColor={{ false: '#ccc', true: '#333' }}
                                    thumbColor="#fff"
                                    style={drawerStyles.switch}
                                />
                            </View>

                            <View style={drawerStyles.settingGroup}>
                                <Text style={drawerStyles.settingTitle}>Grid Icon Size</Text>
                                <View style={drawerStyles.optionRow}>
                                    {GRID_SIZE_OPTIONS.map((option) => (
                                        <TouchableOpacity
                                            key={option}
                                            style={[
                                                drawerStyles.optionButton,
                                                gridIconSize === option && drawerStyles.optionButtonActive,
                                            ]}
                                            onPress={() => onGridIconSizeChange(option)}
                                            activeOpacity={0.7}
                                        >
                                            <Text
                                                style={[
                                                    drawerStyles.optionLabel,
                                                    gridIconSize === option && drawerStyles.optionLabelActive,
                                                ]}
                                            >
                                                {option[0].toUpperCase() + option.slice(1)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            <View style={drawerStyles.settingGroup}>
                                <Text style={drawerStyles.settingTitle}>List Text Size</Text>
                                <View style={drawerStyles.optionRow}>
                                    {LIST_TEXT_SIZE_OPTIONS.map((option) => (
                                        <TouchableOpacity
                                            key={option}
                                            style={[
                                                drawerStyles.optionButton,
                                                listTextSize === option && drawerStyles.optionButtonActive,
                                            ]}
                                            onPress={() => onListTextSizeChange(option)}
                                            activeOpacity={0.7}
                                        >
                                            <Text
                                                style={[
                                                    drawerStyles.optionLabel,
                                                    listTextSize === option && drawerStyles.optionLabelActive,
                                                ]}
                                            >
                                                {option[0].toUpperCase() + option.slice(1)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            <View style={drawerStyles.settingGroup}>
                                <Text style={drawerStyles.settingTitle}>Item Icons</Text>
                                <View style={drawerStyles.optionRow}>
                                    {ITEM_ICON_VARIANT_OPTIONS.map((option) => (
                                        <TouchableOpacity
                                            key={option}
                                            style={[
                                                drawerStyles.optionButton,
                                                itemIconVariant === option && drawerStyles.optionButtonActive,
                                            ]}
                                            onPress={() => onItemIconVariantChange(option)}
                                            activeOpacity={0.7}
                                        >
                                            <Text
                                                style={[
                                                    drawerStyles.optionLabel,
                                                    itemIconVariant === option && drawerStyles.optionLabelActive,
                                                ]}
                                            >
                                                {option === 'illustrated' ? 'Illustrated' : 'Minimalistic'}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
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

                            {loyaltyCards.map((card) => (
                                <TouchableOpacity
                                    key={card.id}
                                    style={drawerStyles.menuRow}
                                    onPress={() => {
                                        onSelectCard(card)
                                        closeMenu()
                                    }}
                                    activeOpacity={0.6}
                                >
                                    <Ionicons name="card-outline" size={22} color="#333" />
                                    <Text style={drawerStyles.menuLabel}>{card.name}</Text>
                                </TouchableOpacity>
                            ))}

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

                        </ScrollView>
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
        paddingBottom: 32,
    },
    drawerScroll: {
        flex: 1,
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
    settingGroup: {
        paddingVertical: 10,
    },
    settingTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#333',
        marginBottom: 10,
    },
    optionRow: {
        flexDirection: 'row',
        gap: 8,
    },
    optionButton: {
        flex: 1,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#ddd',
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
    },
    optionButtonActive: {
        backgroundColor: '#333',
        borderColor: '#333',
    },
    optionLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#333',
    },
    optionLabelActive: {
        color: '#fff',
    },
})

const loyaltyStyles = StyleSheet.create({
    cardChip: {
        minWidth: 52,
        height: 30,
        borderRadius: 15,
        paddingHorizontal: 10,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 4,
    },
    cardChipCompact: {
        minWidth: 40,
        height: 24,
        borderRadius: 12,
        paddingHorizontal: 8,
    },
    cardLetter: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '700',
    },
    cardLetterCompact: {
        fontSize: 11,
    },
})
