import React, { useMemo } from 'react'
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Dimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import type { ListEntry, SizeOption } from './_types'
import { groupByCategory, type IndexedEntry } from './categoryGrouping'
import { CATEGORY_ICONS } from './categoryConstants'
import { GridCard } from './GridCard'
import { EmptyState } from './EmptyState'
import type { ItemIconVariant } from './itemIconMap'
import { useTheme, type Theme } from '../theme'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const CARD_MARGIN = 6

function getNumColumns(size: SizeOption) {
    if (size === 'small') return 5
    if (size === 'medium') return 4
    if (size === 'large') return 2
    return 3
}

type Props = {
    data: ListEntry[]
    onToggleDone?: (index: number) => void
    onDelete?: (index: number) => void
    onRequestAdd?: () => void
    categoriesEnabled?: boolean
    categoryHeadersVisible?: boolean
    gridIconSize?: SizeOption
    itemIconVariant?: ItemIconVariant
    reduceMotion?: boolean
}

export function VisualGridList({
    data,
    onToggleDone,
    onDelete,
    onRequestAdd,
    categoriesEnabled = true,
    categoryHeadersVisible = true,
    gridIconSize = 'normal',
    itemIconVariant = 'illustrated',
    reduceMotion = false,
}: Props) {
    const t = useTheme()
    const insets = useSafeAreaInsets()
    const styles = useMemo(() => makeStyles(t), [t])
    const numColumns = getNumColumns(gridIconSize)
    const cardWidth = useMemo(
        () => (SCREEN_WIDTH - 20 - CARD_MARGIN * (numColumns + 1)) / numColumns,
        [numColumns]
    )

    const sections = useMemo(() => {
        if (categoriesEnabled) return groupByCategory(data)
        return [{
            canonicalKey: '',
            category: '',
            items: data.map((entry, i) => ({ entry, originalIndex: i })),
        }]
    }, [data, categoriesEnabled])

    const renderCard = (indexed: IndexedEntry, cardKey: number) => (
        <GridCard
            key={`${indexed.entry.text}-${indexed.entry.timeOfCompletion}-${cardKey}`}
            item={indexed.entry}
            originalIndex={indexed.originalIndex}
            cardKey={cardKey}
            cardWidth={cardWidth}
            onToggleDone={onToggleDone}
            onDelete={onDelete}
            itemIconVariant={itemIconVariant}
            reduceMotion={reduceMotion}
        />
    )

    const renderRows = (items: IndexedEntry[]) => {
        const rows: React.ReactElement[] = []
        for (let i = 0; i < items.length; i += numColumns) {
            const rowItems = items.slice(i, i + numColumns)
            rows.push(
                <View key={`row-${i}`} style={styles.row}>
                    {rowItems.map((indexed, idx) => renderCard(indexed, i + idx))}
                    {rowItems.length < numColumns &&
                        Array(numColumns - rowItems.length)
                            .fill(null)
                            .map((_, idx) => (
                                <View key={`empty-${idx}`} style={{ width: cardWidth, marginRight: CARD_MARGIN }} />
                            ))}
                </View>
            )
        }
        return rows
    }

    if (data.length === 0) {
        return (
            <View style={styles.container}>
                <EmptyState onRequestAdd={onRequestAdd} />
            </View>
        )
    }

    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 140 }]}
                showsVerticalScrollIndicator={false}
            >
                {sections.map((section) => (
                    <View key={section.category || '_flat'} style={styles.section}>
                        {categoryHeadersVisible && section.category !== '' && (
                            <View style={styles.categoryHeader}>
                                <Ionicons
                                    name={(CATEGORY_ICONS[section.canonicalKey] || 'basket-outline') as any}
                                    size={18}
                                    color={t.colors.textSecondary}
                                />
                                <Text style={styles.categoryTitle}>{section.category.toUpperCase()}</Text>
                            </View>
                        )}
                        {renderRows(section.items)}
                    </View>
                ))}
            </ScrollView>
        </View>
    )
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: t.colors.bg,
        },
        scrollContent: {
            padding: 8,
        },
        section: {
            marginBottom: t.spacing.xl,
        },
        categoryHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 10,
            marginLeft: 4,
        },
        categoryTitle: {
            fontSize: t.type.label.fontSize,
            fontWeight: '700',
            color: t.colors.textSecondary,
            marginLeft: 6,
            letterSpacing: 0.5,
        },
        row: {
            flexDirection: 'row',
            marginBottom: CARD_MARGIN,
        },
    })
}
