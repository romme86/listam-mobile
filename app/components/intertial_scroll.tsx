import React, { useRef, useCallback, useMemo } from 'react'
import {
    Animated,
    StyleSheet,
    View,
    Text,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import type { ListEntry, SizeOption } from './_types'
import { ListItem, ITEM_HEIGHT, SPACING } from './ListItem'
import { groupByCategory } from './categoryGrouping'
import { CATEGORY_ICONS } from './categoryConstants'
import { EmptyState } from './EmptyState'
import { useTheme, type Theme } from '../theme'
import { identityKey } from '../listProjection'

const TOTAL_ITEM_HEIGHT = ITEM_HEIGHT + SPACING

type FlatListItem =
    | { type: 'header'; category: string; canonicalKey: string; key: string }
    | { type: 'item'; entry: ListEntry; originalIndex: number; visualIndex: number; key: string }

type Props = {
    data: ListEntry[]
    onToggleDone?: (index: number) => void
    onDelete?: (index: number) => void
    onEdit?: (index: number, text: string) => void
    onRequestAdd?: () => void
    categoriesEnabled?: boolean
    categoryHeadersVisible?: boolean
    listTextSize?: SizeOption
    reduceMotion?: boolean
}

function getListTextScale(size: SizeOption) {
    if (size === 'small') return 0.7
    if (size === 'medium') return 0.85
    if (size === 'large') return 1.25
    return 1
}

export default function InertialElasticList({
    data,
    onToggleDone,
    onDelete,
    onEdit,
    onRequestAdd,
    categoriesEnabled = true,
    categoryHeadersVisible = true,
    listTextSize = 'normal',
    reduceMotion = false,
}: Props) {
    const t = useTheme()
    const insets = useSafeAreaInsets()
    const styles = useMemo(() => makeStyles(t), [t])
    const scrollY = useRef(new Animated.Value(0)).current
    const textScaleFactor = getListTextScale(listTextSize)

    const flatData = useMemo((): FlatListItem[] => {
        if (!categoriesEnabled) {
            return data.map((entry, i) => ({
                type: 'item' as const,
                entry,
                originalIndex: i,
                visualIndex: i,
                key: `item-${identityKey(entry)}`,
            }))
        }

        const sections = groupByCategory(data)
        const items: FlatListItem[] = []
        let visualIndex = 0

        for (const section of sections) {
            if (categoryHeadersVisible) {
                items.push({
                    type: 'header',
                    category: section.category,
                    canonicalKey: section.canonicalKey,
                    key: `header-${section.canonicalKey}`,
                })
                visualIndex++
            }

            for (const indexed of section.items) {
                items.push({
                    type: 'item',
                    entry: indexed.entry,
                    originalIndex: indexed.originalIndex,
                    visualIndex,
                    key: `item-${identityKey(indexed.entry)}`,
                })
                visualIndex++
            }
        }

        return items
    }, [data, categoriesEnabled, categoryHeadersVisible])

    const renderItem = useCallback(({ item }: { item: FlatListItem }) => {
        if (item.type === 'header') {
            const iconName = CATEGORY_ICONS[item.canonicalKey] || 'basket-outline'
            return (
                <View style={styles.headerContainer}>
                    <Ionicons name={iconName as any} size={16} color={t.colors.textSecondary} />
                    <Text style={[styles.headerTitle, { fontSize: 13 * textScaleFactor }]}>
                        {item.category.toUpperCase()}
                    </Text>
                </View>
            )
        }

        return (
            <ListItem
                item={item.entry}
                index={item.originalIndex}
                visualIndex={item.visualIndex}
                scrollY={scrollY}
                totalItemHeight={TOTAL_ITEM_HEIGHT}
                onToggleDone={onToggleDone}
                onDelete={onDelete}
                onEdit={onEdit}
                textScaleFactor={textScaleFactor}
                reduceMotion={reduceMotion}
            />
        )
    }, [scrollY, onToggleDone, onDelete, onEdit, textScaleFactor, reduceMotion, styles, t])

    const keyExtractor = useCallback((item: FlatListItem) => item.key, [])

    const getItemLayout = useCallback((_: any, index: number) => ({
        length: TOTAL_ITEM_HEIGHT,
        offset: TOTAL_ITEM_HEIGHT * index,
        index,
    }), [])

    return (
        <View style={styles.container}>
            <Animated.FlatList
                data={flatData}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                getItemLayout={getItemLayout}
                showsVerticalScrollIndicator={false}
                decelerationRate="fast"
                bounces={true}
                overScrollMode="always"
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: true }
                )}
                scrollEventThrottle={16}
                ListEmptyComponent={<EmptyState onRequestAdd={onRequestAdd} />}
                contentContainerStyle={{
                    flexGrow: 1,
                    paddingTop: t.spacing.lg,
                    paddingBottom: insets.bottom + 140,
                }}
            />
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: t.colors.bg,
        },
        headerContainer: {
            height: ITEM_HEIGHT + SPACING,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 20,
        },
        headerTitle: {
            fontSize: 13,
            fontWeight: '700',
            color: t.colors.textSecondary,
            marginLeft: 6,
            letterSpacing: 0.5,
        },
    })
}
