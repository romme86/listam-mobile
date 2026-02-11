import React, { useState, useCallback, useMemo } from 'react'
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Dimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { ListEntry } from './_types'
import { groupByCategory, type IndexedEntry } from './categoryGrouping'
import { CATEGORY_ICONS } from './categoryConstants'
import { GridCard } from './GridCard'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const CARD_MARGIN = 6
const NUM_COLUMNS = 3
const CARD_WIDTH = (SCREEN_WIDTH - 20 - CARD_MARGIN * (NUM_COLUMNS + 1)) / NUM_COLUMNS

type Props = {
    data: ListEntry[]
    onToggleDone?: (index: number) => void
    onDelete?: (index: number) => void
    onInsert?: (index: number, text: string) => void
    categoriesEnabled?: boolean
}

export function VisualGridList({ data, onToggleDone, onDelete, onInsert, categoriesEnabled = true }: Props) {
    const [isAddingItem, setIsAddingItem] = useState(false)
    const [editText, setEditText] = useState('')

    const handleDoubleTap = useCallback(() => {
        setIsAddingItem(true)
        setEditText('')
    }, [])

    const lastTapRef = React.useRef<number>(0)
    const handlePress = useCallback(() => {
        const now = Date.now()
        if (now - lastTapRef.current < 300) {
            handleDoubleTap()
            lastTapRef.current = 0
        } else {
            lastTapRef.current = now
        }
    }, [handleDoubleTap])

    const handleSubmit = useCallback(() => {
        if (editText.trim() && onInsert) {
            onInsert(0, editText)
            setIsAddingItem(false)
            setEditText('')
        }
    }, [editText, onInsert])

    const handleCancel = useCallback(() => {
        setIsAddingItem(false)
        setEditText('')
    }, [])

    const sections = useMemo(() => {
        if (categoriesEnabled) return groupByCategory(data)
        return [{
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
            onToggleDone={onToggleDone}
            onDelete={onDelete}
        />
    )

    const renderRows = (items: IndexedEntry[]) => {
        const rows: React.ReactElement[] = []
        for (let i = 0; i < items.length; i += NUM_COLUMNS) {
            const rowItems = items.slice(i, i + NUM_COLUMNS)
            rows.push(
                <View key={`row-${i}`} style={styles.row}>
                    {rowItems.map((indexed, idx) => renderCard(indexed, i + idx))}
                    {rowItems.length < NUM_COLUMNS &&
                        Array(NUM_COLUMNS - rowItems.length)
                            .fill(null)
                            .map((_, idx) => (
                                <View key={`empty-${idx}`} style={styles.emptyCard} />
                            ))}
                </View>
            )
        }
        return rows
    }

    return (
        <View style={styles.container}>
            {isAddingItem && (
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        value={editText}
                        onChangeText={setEditText}
                        onSubmitEditing={handleSubmit}
                        onBlur={handleCancel}
                        placeholder="Enter new item..."
                        placeholderTextColor="#888"
                        autoFocus
                    />
                </View>
            )}
            <TouchableOpacity activeOpacity={1} onPress={handlePress} style={styles.scrollContainer}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {sections.map((section) => (
                        <View key={section.category || '_flat'} style={styles.section}>
                            {section.category !== '' && (
                                <View style={styles.categoryHeader}>
                                    <Ionicons
                                        name={(CATEGORY_ICONS[section.category] || 'basket-outline') as any}
                                        size={18}
                                        color="#555"
                                    />
                                    <Text style={styles.categoryTitle}>{section.category.toUpperCase()}</Text>
                                </View>
                            )}
                            {renderRows(section.items)}
                        </View>
                    ))}

                    {data.length === 0 && (
                        <View style={styles.emptyState}>
                            <Ionicons name="basket-outline" size={64} color="#999" />
                            <Text style={styles.emptyText}>Double tap to add items</Text>
                        </View>
                    )}
                </ScrollView>
            </TouchableOpacity>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    scrollContainer: {
        flex: 1,
    },
    scrollContent: {
        padding: 8,
        paddingBottom: 100,
    },
    inputContainer: {
        paddingHorizontal: 10,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    input: {
        fontSize: 16,
        color: '#333',
        fontWeight: '600',
    },
    section: {
        marginBottom: 24,
    },
    categoryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        marginLeft: 4,
    },
    categoryTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#333',
        marginLeft: 6,
        letterSpacing: 0.5,
    },
    row: {
        flexDirection: 'row',
        marginBottom: CARD_MARGIN,
    },
    emptyCard: {
        width: CARD_WIDTH,
        marginRight: CARD_MARGIN,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 100,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 16,
        color: '#888',
    },
})
