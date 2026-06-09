import React, { useRef, useCallback, useMemo } from 'react'
import {
    Animated,
    View,
    Text,
    Image,
    StyleSheet,
    TouchableOpacity,
    Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { haptics } from '../feedback'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'
import type { ListEntry } from './_types'
import { getIconForItem, type ItemIconVariant } from './itemIconMap'

const CARD_MARGIN = 6

type GridCardProps = {
    item: ListEntry
    originalIndex: number
    cardKey: number
    cardWidth: number
    onToggleDone?: (index: number) => void
    onDelete?: (index: number) => void
    itemIconVariant?: ItemIconVariant
    reduceMotion?: boolean
}

export function GridCard({
    item,
    originalIndex,
    cardWidth,
    onToggleDone,
    onDelete,
    itemIconVariant = 'illustrated',
    reduceMotion = false,
}: GridCardProps) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const bubbleScale = useRef(new Animated.Value(1)).current
    const bubbleOpacity = useRef(new Animated.Value(0)).current
    const iconSize = Math.max(28, Math.min(cardWidth * 0.68, 76))

    const handlePress = useCallback(() => {
        // Commit the state change immediately — feedback animates in parallel,
        // so the tap never feels delayed.
        if (item.isDone) {
            haptics.toggleOff()
        } else {
            haptics.toggleOn()
            if (!reduceMotion) {
                bubbleScale.setValue(1)
                bubbleOpacity.setValue(1)
                Animated.parallel([
                    Animated.timing(bubbleScale, {
                        toValue: 1.25,
                        duration: 320,
                        useNativeDriver: true,
                    }),
                    Animated.timing(bubbleOpacity, {
                        toValue: 0,
                        duration: 320,
                        useNativeDriver: true,
                    }),
                ]).start(() => {
                    bubbleScale.setValue(1)
                    bubbleOpacity.setValue(0)
                })
            }
        }
        onToggleDone?.(originalIndex)
    }, [item.isDone, originalIndex, onToggleDone, bubbleScale, bubbleOpacity, reduceMotion])

    const confirmDelete = useCallback(() => {
        Alert.alert(
            i18n.t('main.grid.removeItem.title'),
            i18n.t('main.grid.removeItem.message', { item: item.text }),
            [
                { text: i18n.t('common.cancel'), style: 'cancel' },
                {
                    text: i18n.t('common.remove'),
                    style: 'destructive',
                    onPress: () => {
                        haptics.delete()
                        onDelete?.(originalIndex)
                    },
                },
            ]
        )
    }, [i18n, item.text, originalIndex, onDelete])

    return (
        <TouchableOpacity
            style={[styles.card, { width: cardWidth }, item.isDone && styles.cardDone]}
            onPress={handlePress}
            onLongPress={confirmDelete}
            delayLongPress={400}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.isDone }}
            accessibilityLabel={item.text}
            accessibilityHint={i18n.t('main.grid.accessibilityHint')}
        >
            <View style={styles.iconContainer}>
                <Image
                    source={getIconForItem(item.text, itemIconVariant).source}
                    style={[{ width: iconSize, height: iconSize }, item.isDone && styles.cardIconDone]}
                    resizeMode="contain"
                />
            </View>
            <Text
                style={[
                    styles.cardText,
                    { fontSize: Math.max(8, Math.min(cardWidth * 0.12, 11)) },
                    item.isDone && styles.cardTextDone,
                ]}
                numberOfLines={2}
            >
                {item.text}
            </Text>
            {item.isDone && (
                <View style={styles.checkmark}>
                    <Ionicons name="checkmark-circle" size={18} color={t.colors.accent} />
                </View>
            )}
            <Animated.View
                pointerEvents="none"
                style={[
                    styles.bubbleOverlay,
                    {
                        transform: [{ scale: bubbleScale }],
                        opacity: bubbleOpacity,
                    },
                ]}
            />
        </TouchableOpacity>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        card: {
            aspectRatio: 1,
            backgroundColor: t.colors.surface,
            borderRadius: t.radius.md,
            paddingHorizontal: 4,
            paddingTop: 4,
            paddingBottom: 2,
            marginRight: CARD_MARGIN,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: t.colors.border,
        },
        cardDone: {
            backgroundColor: t.colors.surfaceAlt,
            opacity: 0.6,
        },
        iconContainer: {
            marginBottom: 2,
        },
        cardIconDone: {
            opacity: 0.4,
        },
        cardText: {
            fontSize: 11,
            fontWeight: '600',
            color: t.colors.text,
            textAlign: 'center',
        },
        cardTextDone: {
            color: t.colors.textDisabled,
            textDecorationLine: 'line-through',
        },
        checkmark: {
            position: 'absolute',
            top: 8,
            right: 8,
        },
        bubbleOverlay: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderWidth: 2,
            borderColor: t.colors.accent,
            borderRadius: t.radius.md,
        },
    })
}
