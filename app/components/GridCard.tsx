import React, { useRef, useCallback } from 'react'
import {
    Animated,
    View,
    Text,
    Image,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import type { ListEntry } from './_types'
import { getIconForItem } from './itemIconMap'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const CARD_MARGIN = 6
const NUM_COLUMNS = 3
const CARD_WIDTH = (SCREEN_WIDTH - 20 - CARD_MARGIN * (NUM_COLUMNS + 1)) / NUM_COLUMNS

type GridCardProps = {
    item: ListEntry
    originalIndex: number
    cardKey: number
    onToggleDone?: (index: number) => void
    onDelete?: (index: number) => void
}

export function GridCard({ item, originalIndex, cardKey, onToggleDone, onDelete }: GridCardProps) {
    const bubbleScale = useRef(new Animated.Value(1)).current
    const bubbleOpacity = useRef(new Animated.Value(0)).current

    const handlePress = useCallback(() => {
        if (!item.isDone) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

            bubbleScale.setValue(1)
            bubbleOpacity.setValue(1)

            Animated.sequence([
                Animated.delay(80),
                Animated.parallel([
                    Animated.timing(bubbleScale, {
                        toValue: 1.15,
                        duration: 300,
                        useNativeDriver: true,
                    }),
                    Animated.timing(bubbleOpacity, {
                        toValue: 0,
                        duration: 300,
                        useNativeDriver: true,
                    }),
                ]),
            ]).start(() => {
                bubbleScale.setValue(1)
                bubbleOpacity.setValue(0)
                onToggleDone?.(originalIndex)
            })
        } else {
            onToggleDone?.(originalIndex)
        }
    }, [item.isDone, originalIndex, onToggleDone, bubbleScale, bubbleOpacity])

    return (
        <TouchableOpacity
            style={[styles.card, item.isDone && styles.cardDone]}
            onPress={handlePress}
            onLongPress={() => onDelete?.(originalIndex)}
            delayLongPress={500}
        >
            <View style={styles.iconContainer}>
                <Image
                    source={getIconForItem(item.text).source}
                    style={[styles.cardIcon, item.isDone && styles.cardIconDone]}
                    resizeMode="contain"
                />
            </View>
            <Text
                style={[styles.cardText, item.isDone && styles.cardTextDone]}
                numberOfLines={2}
            >
                {item.text}
            </Text>
            {item.isDone && (
                <View style={styles.checkmark}>
                    <Ionicons name="checkmark-circle" size={18} color="#333" />
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

const styles = StyleSheet.create({
    card: {
        width: CARD_WIDTH,
        aspectRatio: 1,
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingHorizontal: 4,
        paddingTop: 4,
        paddingBottom: 2,
        marginRight: CARD_MARGIN,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    cardDone: {
        backgroundColor: '#fafafa',
        opacity: 0.6,
    },
    iconContainer: {
        marginBottom: 2,
    },
    cardIcon: {
        width: 76,
        height: 76,
    },
    cardIconDone: {
        opacity: 0.4,
    },
    cardText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#333',
        textAlign: 'center',
    },
    cardTextDone: {
        color: '#999',
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
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#34c759',
        borderRadius: 12,
    },
})
