import React, { useRef, useCallback, useMemo } from 'react'
import {
    Animated,
    StyleSheet,
    View,
    Text,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { ListAlignment, ListEntry, ListSpacing, SizeOption } from './_types'
import { ListItem, ITEM_HEIGHT, SPACING } from './ListItem'
import { groupByCategory } from './categoryGrouping'
import { CATEGORY_ICONS } from './categoryConstants'
import { EmptyState } from './EmptyState'
import { useCategoryDrag } from './CategoryDrag'
import { useTheme, type Theme } from '../theme'
import { useI18n } from '../i18n'
import { identityKey } from '../listProjection'

type FlatListItem =
    | { type: 'header'; category: string; canonicalKey: string; key: string }
    | { type: 'item'; entry: ListEntry; originalIndex: number; visualIndex: number; canonicalKey: string; key: string }

type Props = {
    data: ListEntry[]
    onToggleDone?: (item: ListEntry) => void
    onDelete?: (index: number) => void
    onEdit?: (index: number, text: string) => void
    onRequestAdd?: () => void
    onFlagToday?: (index: number) => void
    onPlanFor?: (item: ListEntry) => void
    onTripleTap?: (item: ListEntry) => void
    isPlanned?: (item: ListEntry) => boolean
    categoriesEnabled?: boolean
    categoryHeadersVisible?: boolean
    listTextSize?: SizeOption
    listAlignment?: ListAlignment
    listItemSpacing?: ListSpacing
    reduceMotion?: boolean
}

function getListTextScale(size: SizeOption) {
    if (size === 'small') return 0.7
    if (size === 'medium') return 0.85
    if (size === 'large') return 1.25
    return 1
}

function getListSpacing(spacing: ListSpacing) {
    if (spacing === 'compact') return 6
    if (spacing === 'cozy') return 10
    if (spacing === 'relaxed') return 28
    return SPACING
}

export default function InertialElasticList({
    data,
    onToggleDone,
    onDelete,
    onEdit,
    onRequestAdd,
    onFlagToday,
    onPlanFor,
    onTripleTap,
    isPlanned,
    categoriesEnabled = true,
    categoryHeadersVisible = true,
    listTextSize = 'normal',
    listAlignment = 'left',
    listItemSpacing = 'normal',
    reduceMotion = false,
}: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const insets = useSafeAreaInsets()
    const drag = useCategoryDrag()
    const styles = useMemo(() => makeStyles(t), [t])
    const scrollY = useRef(new Animated.Value(0)).current
    const textScaleFactor = getListTextScale(listTextSize)
    const isCentered = listAlignment === 'center'
    const spacing = getListSpacing(listItemSpacing)
    const totalItemHeight = ITEM_HEIGHT + spacing

    const flatData = useMemo((): FlatListItem[] => {
        if (!categoriesEnabled) {
            return data.map((entry, i) => ({
                type: 'item' as const,
                entry,
                originalIndex: i,
                visualIndex: i,
                canonicalKey: '',
                key: `item-${identityKey(entry)}`,
            }))
        }

        const sections = groupByCategory(data, i18n.groceryLocale)
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
                    canonicalKey: section.canonicalKey,
                    key: `item-${identityKey(indexed.entry)}`,
                })
                visualIndex++
            }
        }

        return items
    }, [data, categoriesEnabled, categoryHeadersVisible, i18n.groceryLocale])

    const renderItem = useCallback(({ item }: { item: FlatListItem }) => {
        if (item.type === 'header') {
            const iconName = CATEGORY_ICONS[item.canonicalKey] || 'basket'
            return (
                <View style={[styles.headerContainer, { height: totalItemHeight }, isCentered && styles.headerContainerCentered]}>
                    <MaterialCommunityIcons name={iconName as any} size={16} color={t.colors.textSecondary} />
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
                totalItemHeight={totalItemHeight}
                onToggleDone={onToggleDone}
                onDelete={onDelete}
                onEdit={onEdit}
                onRequestAdd={onRequestAdd}
                onFlagToday={onFlagToday}
                onPlanFor={onPlanFor}
                onTripleTap={onTripleTap}
                planned={isPlanned?.(item.entry) ?? false}
                textScaleFactor={textScaleFactor}
                listAlignment={listAlignment}
                spacing={spacing}
                categoryKey={item.canonicalKey}
                reduceMotion={reduceMotion}
            />
        )
    }, [scrollY, totalItemHeight, spacing, onToggleDone, onDelete, onEdit, onRequestAdd, onFlagToday, onPlanFor, onTripleTap, isPlanned, textScaleFactor, listAlignment, isCentered, reduceMotion, styles, t])

    const keyExtractor = useCallback((item: FlatListItem) => item.key, [])

    const getItemLayout = useCallback((_: any, index: number) => ({
        length: totalItemHeight,
        offset: totalItemHeight * index,
        index,
    }), [totalItemHeight])

    return (
        <View style={styles.container}>
            <Animated.FlatList
                data={flatData}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                getItemLayout={getItemLayout}
                scrollEnabled={drag.draggingId === null}
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
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 20,
        },
        headerContainerCentered: {
            justifyContent: 'center',
            paddingLeft: 0,
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
