import React, { useEffect, useMemo, useRef } from 'react'
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
import { useTheme, cardColor, type Theme } from '../theme'
import { useReduceMotion } from '../hooks/useReduceMotion'
import type { LoyaltyCardHandle } from '../store/loyaltyCardsSlice'
import type { ItemIconVariant } from './itemIconMap'
import type { SizeOption } from './_types'

const DRAWER_WIDTH = 280
const { height: SCREEN_HEIGHT } = Dimensions.get('window')
const HEADER_ICON_SIZE = 22
const SIZE_OPTIONS: SizeOption[] = ['small', 'medium', 'normal', 'large']
const ITEM_ICON_VARIANT_OPTIONS: ItemIconVariant[] = ['illustrated', 'minimal']

type HeaderProps = {
    peerCount: number
    isWorkletReady: boolean
    onShare: () => void
    onJoin: () => void
    onManageMembers: () => void
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
    gridIconSize: SizeOption
    onGridIconSizeChange: (size: SizeOption) => void
    listTextSize: SizeOption
    onListTextSizeChange: (size: SizeOption) => void
    itemIconVariant: ItemIconVariant
    onItemIconVariantChange: (variant: ItemIconVariant) => void
    loyaltyCards: LoyaltyCardHandle[]
    onScanCard: () => void
    onSelectCard: (card: LoyaltyCardHandle) => void
}

export function Header(props: HeaderProps) {
    const {
        peerCount,
        isWorkletReady,
        onShare,
        onJoin,
        onManageMembers,
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
    } = props

    const t = useTheme()
    const reduceMotion = useReduceMotion()
    const styles = useMemo(() => makeStyles(t), [t])

    const peerCountLabel = peerCount > 99 ? '99+' : String(peerCount)
    const primaryLoyaltyCard = loyaltyCards[0] ?? null
    const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current
    const overlayOpacity = useRef(new Animated.Value(0)).current
    const pulse = useRef(new Animated.Value(1)).current

    const ready = isWorkletReady
    const status = !ready
        ? { label: 'Starting up…', color: t.colors.warning }
        : peerCount > 0
            ? { label: `Synced · ${peerCount} ${peerCount === 1 ? 'device' : 'devices'}`, color: t.colors.accent }
            : { label: 'Ready · share to sync', color: t.colors.textTertiary }

    useEffect(() => {
        if (!ready && !reduceMotion) {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
                    Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
                ])
            )
            loop.start()
            return () => loop.stop()
        }
        pulse.setValue(1)
    }, [ready, reduceMotion, pulse])

    useEffect(() => {
        const duration = reduceMotion ? 0 : menuVisible ? t.motion.duration.base : t.motion.duration.fast
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: menuVisible ? 0 : -DRAWER_WIDTH,
                duration,
                easing: t.motion.easing,
                useNativeDriver: true,
            }),
            Animated.timing(overlayOpacity, {
                toValue: menuVisible ? 1 : 0,
                duration,
                useNativeDriver: true,
            }),
        ]).start()
    }, [menuVisible, slideAnim, overlayOpacity, reduceMotion, t.motion])

    const closeMenu = () => {
        if (menuVisible) onMenuToggle()
    }

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            <View style={styles.container}>
                <View style={styles.leftSection}>
                    <AnimatedIconButton style={styles.iconButton} onPress={onMenuToggle}>
                        <Ionicons name="menu-outline" size={HEADER_ICON_SIZE} color={t.colors.text} />
                    </AnimatedIconButton>
                    {trialDaysRemaining !== undefined && trialDaysRemaining <= 7 && (
                        <Text style={styles.trialText}>{trialDaysRemaining} days left</Text>
                    )}
                </View>

                <View style={styles.rightSection}>
                    <AnimatedIconButton
                        style={styles.iconButton}
                        onPress={() => (primaryLoyaltyCard ? onSelectCard(primaryLoyaltyCard) : onScanCard())}
                    >
                        <Ionicons name="card-outline" size={HEADER_ICON_SIZE} color={t.colors.text} />
                    </AnimatedIconButton>

                    <View style={styles.iconWithBadge}>
                        <AnimatedIconButton style={styles.iconButton} onPress={onShare}>
                            <Ionicons name="share-outline" size={HEADER_ICON_SIZE} color={t.colors.text} />
                        </AnimatedIconButton>
                        {peerCount > 0 && (
                            <View style={styles.peerBadge}>
                                <Text style={styles.peerBadgeText}>{peerCountLabel}</Text>
                            </View>
                        )}
                    </View>

                    <AnimatedIconButton style={styles.iconButton} onPress={onJoin}>
                        <Ionicons name="person-add-outline" size={HEADER_ICON_SIZE} color={t.colors.text} />
                    </AnimatedIconButton>
                </View>
            </View>

            <View style={styles.statusRow}>
                <Animated.View style={[styles.statusDot, { backgroundColor: status.color, opacity: pulse }]} />
                <Text style={styles.statusText}>{status.label}</Text>
            </View>

            <Modal visible={menuVisible} transparent animationType="none" onRequestClose={closeMenu}>
                <View style={styles.modalContainer}>
                    <TouchableWithoutFeedback onPress={closeMenu}>
                        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
                    </TouchableWithoutFeedback>

                    <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}>
                        <ScrollView
                            style={styles.drawerScroll}
                            contentContainerStyle={styles.drawerContent}
                            showsVerticalScrollIndicator={false}
                        >
                            <TouchableOpacity
                                style={styles.menuRow}
                                onPress={() => { onToggleView(); closeMenu() }}
                                activeOpacity={0.6}
                            >
                                <Ionicons
                                    name={isGridView ? 'list-outline' : 'grid-outline'}
                                    size={22}
                                    color={t.colors.text}
                                />
                                <Text style={styles.menuLabel}>{isGridView ? 'List View' : 'Grid View'}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.menuRow}
                                onPress={() => { onManageMembers(); closeMenu() }}
                                activeOpacity={0.6}
                            >
                                <Ionicons name="people-outline" size={22} color={t.colors.text} />
                                <Text style={styles.menuLabel}>Members & recovery</Text>
                            </TouchableOpacity>

                            <Text style={styles.sectionLabel}>Display</Text>

                            <View style={styles.menuRow}>
                                <Ionicons name="pricetags-outline" size={22} color={t.colors.text} />
                                <Text style={styles.menuLabel}>Categories</Text>
                                <Switch
                                    value={categoriesEnabled}
                                    onValueChange={onToggleCategories}
                                    trackColor={{ false: t.colors.border, true: t.colors.primary }}
                                    thumbColor={t.colors.surface}
                                />
                            </View>

                            <View style={styles.menuRow}>
                                <Ionicons name="albums-outline" size={22} color={t.colors.text} />
                                <Text style={styles.menuLabel}>Category Headers</Text>
                                <Switch
                                    value={categoryHeadersVisible}
                                    onValueChange={onToggleCategoryHeaders}
                                    trackColor={{ false: t.colors.border, true: t.colors.primary }}
                                    thumbColor={t.colors.surface}
                                />
                            </View>

                            {isGridView ? (
                                <SegmentedSetting
                                    title="Grid Icon Size"
                                    options={SIZE_OPTIONS}
                                    value={gridIconSize}
                                    onChange={onGridIconSizeChange}
                                    styles={styles}
                                    labelFor={(o) => o[0].toUpperCase() + o.slice(1)}
                                />
                            ) : (
                                <SegmentedSetting
                                    title="List Text Size"
                                    options={SIZE_OPTIONS}
                                    value={listTextSize}
                                    onChange={onListTextSizeChange}
                                    styles={styles}
                                    labelFor={(o) => o[0].toUpperCase() + o.slice(1)}
                                />
                            )}

                            <SegmentedSetting
                                title="Item Icons"
                                options={ITEM_ICON_VARIANT_OPTIONS}
                                value={itemIconVariant}
                                onChange={onItemIconVariantChange}
                                styles={styles}
                                labelFor={(o) => (o === 'illustrated' ? 'Illustrated' : 'Minimal')}
                            />

                            <Text style={styles.sectionLabel}>Loyalty Cards</Text>

                            <TouchableOpacity
                                style={styles.menuRow}
                                onPress={() => { onScanCard(); closeMenu() }}
                                activeOpacity={0.6}
                            >
                                <Ionicons name="scan-outline" size={22} color={t.colors.text} />
                                <Text style={styles.menuLabel}>Scan Loyalty Card</Text>
                            </TouchableOpacity>

                            {loyaltyCards.map((card) => (
                                <TouchableOpacity
                                    key={card.id}
                                    style={styles.menuRow}
                                    onPress={() => { onSelectCard(card); closeMenu() }}
                                    activeOpacity={0.6}
                                >
                                    <View style={[styles.cardSwatch, { backgroundColor: cardColor(card.name) }]}>
                                        <Ionicons name="card-outline" size={14} color="#fff" />
                                    </View>
                                    <Text style={styles.menuLabel}>{card.name}</Text>
                                </TouchableOpacity>
                            ))}

                            <Text style={styles.sectionLabel}>Danger Zone</Text>

                            <TouchableOpacity
                                style={[styles.menuRow, styles.dangerRow]}
                                onPress={() => { onDeleteAll(); closeMenu() }}
                                activeOpacity={0.6}
                            >
                                <Ionicons name="trash-outline" size={22} color={t.colors.danger} />
                                <Text style={[styles.menuLabel, { color: t.colors.danger }]}>Delete All</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </Animated.View>
                </View>
            </Modal>
        </SafeAreaView>
    )
}

function SegmentedSetting<T extends string>({
    title,
    options,
    value,
    onChange,
    labelFor,
    styles,
}: {
    title: string
    options: readonly T[]
    value: T
    onChange: (value: T) => void
    labelFor: (option: T) => string
    styles: ReturnType<typeof makeStyles>
}) {
    return (
        <View style={styles.settingGroup}>
            <Text style={styles.settingTitle}>{title}</Text>
            <View style={styles.optionRow}>
                {options.map((option) => {
                    const active = value === option
                    return (
                        <TouchableOpacity
                            key={option}
                            style={[styles.optionButton, active && styles.optionButtonActive]}
                            onPress={() => onChange(option)}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                        >
                            <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                                {labelFor(option)}
                            </Text>
                        </TouchableOpacity>
                    )
                })}
            </View>
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        safeArea: {
            backgroundColor: t.colors.bg,
        },
        container: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: t.colors.bg,
            paddingHorizontal: t.spacing.sm,
            paddingVertical: t.spacing.sm,
            minHeight: 52,
        },
        leftSection: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        rightSection: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
        },
        iconButton: {
            padding: t.spacing.sm,
        },
        trialText: {
            fontSize: t.type.caption.fontSize,
            color: t.colors.textTertiary,
            marginLeft: t.spacing.sm,
        },
        iconWithBadge: {
            position: 'relative',
            justifyContent: 'center',
            alignItems: 'center',
        },
        peerBadge: {
            position: 'absolute',
            top: -2,
            right: -6,
            minWidth: 16,
            height: 16,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.accent,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 4,
        },
        peerBadgeText: {
            color: t.colors.onAccent,
            fontSize: 9,
            fontWeight: '700',
        },
        statusRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            paddingHorizontal: t.spacing.md,
            paddingBottom: t.spacing.sm,
        },
        statusDot: {
            width: 8,
            height: 8,
            borderRadius: 4,
        },
        statusText: {
            fontSize: t.type.caption.fontSize,
            color: t.colors.textTertiary,
        },
        modalContainer: {
            flex: 1,
        },
        overlay: {
            ...StyleSheet.absoluteFillObject,
            backgroundColor: t.colors.overlay,
        },
        drawer: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: DRAWER_WIDTH,
            height: SCREEN_HEIGHT,
            backgroundColor: t.colors.surface,
            shadowColor: '#000',
            shadowOffset: { width: 2, height: 0 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 10,
        },
        drawerContent: {
            paddingTop: 72,
            paddingHorizontal: t.spacing.lg,
            paddingBottom: t.spacing.xxl,
        },
        drawerScroll: {
            flex: 1,
        },
        sectionLabel: {
            fontSize: t.type.caption.fontSize,
            fontWeight: '700',
            color: t.colors.textTertiary,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            marginTop: t.spacing.lg,
            marginBottom: t.spacing.xs,
        },
        menuRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: t.spacing.md,
            minHeight: 48,
        },
        dangerRow: {
            backgroundColor: t.colors.dangerSurface,
            borderRadius: t.radius.sm,
            paddingHorizontal: t.spacing.md,
            marginTop: t.spacing.xs,
        },
        menuLabel: {
            fontSize: t.type.bodyStrong.fontSize,
            color: t.colors.text,
            marginLeft: t.spacing.md,
            flex: 1,
        },
        cardSwatch: {
            width: 26,
            height: 26,
            borderRadius: t.radius.sm,
            alignItems: 'center',
            justifyContent: 'center',
        },
        settingGroup: {
            paddingVertical: t.spacing.sm,
        },
        settingTitle: {
            fontSize: t.type.label.fontSize,
            fontWeight: '600',
            color: t.colors.text,
            marginBottom: t.spacing.sm,
        },
        optionRow: {
            flexDirection: 'row',
            gap: t.spacing.sm,
        },
        optionButton: {
            flex: 1,
            borderRadius: t.radius.sm,
            borderWidth: 1,
            borderColor: t.colors.border,
            paddingVertical: t.spacing.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.colors.surface,
        },
        optionButtonActive: {
            backgroundColor: t.colors.primary,
            borderColor: t.colors.primary,
        },
        optionLabel: {
            fontSize: t.type.caption.fontSize,
            fontWeight: '600',
            color: t.colors.text,
        },
        optionLabelActive: {
            color: t.colors.onPrimary,
        },
    })
}
