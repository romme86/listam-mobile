import React, { useRef, useState, useCallback, useMemo } from 'react'
import {
    Animated,
    Dimensions,
    StyleSheet,
    TextInput,
    View,
    Text,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { ListEntry } from './_types'
import { ListItem, ITEM_HEIGHT, SPACING } from './ListItem'
import { groupByCategory } from './categoryGrouping'
import { CATEGORY_ICONS } from './categoryConstants'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')
const TOTAL_ITEM_HEIGHT = ITEM_HEIGHT + SPACING

type FlatListItem =
    | { type: 'header'; category: string; canonicalKey: string; key: string }
    | { type: 'item'; entry: ListEntry; originalIndex: number; visualIndex: number; key: string }

type Props = {
    data: ListEntry[]
    onToggleDone?: (index: number) => void
    onDelete?: (index: number) => void
    onUpdate?: (index: number, text: string) => void
    onInsert?: (index: number, text: string) => void
    categoriesEnabled?: boolean
}

export default function InertialElasticList({
    data,
    onToggleDone,
    onDelete,
    onInsert,
    categoriesEnabled = true,
}: Props) {
    const scrollY = useRef(new Animated.Value(0)).current
    const [isAddingItem, setIsAddingItem] = useState(false)
    const [editText, setEditText] = useState('')
    const listLastTap = useRef<number>(0)

    const handleListDoubleTap = useCallback(() => {
        setIsAddingItem(true)
        setEditText('')
    }, [])

    const handleListPress = useCallback(() => {
        const now = Date.now()
        const DOUBLE_TAP_DELAY = 300

        if (listLastTap.current && now - listLastTap.current < DOUBLE_TAP_DELAY) {
            handleListDoubleTap()
            listLastTap.current = 0
        } else {
            listLastTap.current = now
        }
    }, [handleListDoubleTap])

    const handleStartEdit = useCallback(() => {
        setIsAddingItem(true)
        setEditText('')
    }, [])

    const handleSubmitEdit = useCallback(() => {
        if (editText.trim()) {
            if (onInsert) onInsert(0, editText)
            setEditText('')
        }
    }, [editText, onInsert])

    const handleCancelEdit = useCallback(() => {
        setIsAddingItem(false)
        setEditText('')
    }, [])

    const flatData = useMemo((): FlatListItem[] => {
        if (!categoriesEnabled) {
            return data.map((entry, i) => ({
                type: 'item' as const,
                entry,
                originalIndex: i,
                visualIndex: i,
                key: `item-${i}-${entry.text}-${entry.timeOfCompletion}`,
            }))
        }

        const sections = groupByCategory(data)
        const items: FlatListItem[] = []
        let visualIndex = 0

        for (const section of sections) {
            items.push({
                type: 'header',
                category: section.category,
                canonicalKey: section.canonicalKey,
                key: `header-${section.canonicalKey}`,
            })
            visualIndex++

            for (const indexed of section.items) {
                items.push({
                    type: 'item',
                    entry: indexed.entry,
                    originalIndex: indexed.originalIndex,
                    visualIndex,
                    key: `item-${indexed.originalIndex}-${indexed.entry.text}-${indexed.entry.timeOfCompletion}`,
                })
                visualIndex++
            }
        }

        return items
    }, [data, categoriesEnabled])

    const renderItem = useCallback(({ item }: { item: FlatListItem }) => {
        if (item.type === 'header') {
            const iconName = CATEGORY_ICONS[item.canonicalKey] || 'basket-outline'
            return (
                <View style={headerStyles.container}>
                    <Ionicons name={iconName as any} size={16} color="#555" />
                    <Text style={headerStyles.title}>{item.category.toUpperCase()}</Text>
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
                onInsert={onInsert}
                isEditing={false}
                editText=""
                setEditText={() => {}}
                onStartEdit={handleStartEdit}
                onSubmitEdit={handleSubmitEdit}
                onCancelEdit={handleCancelEdit}
            />
        )
    }, [scrollY, onToggleDone, onDelete, onInsert, handleStartEdit, handleSubmitEdit, handleCancelEdit])

    const keyExtractor = useCallback((item: FlatListItem) => item.key, [])

    const getItemLayout = useCallback((_: any, index: number) => ({
        length: TOTAL_ITEM_HEIGHT,
        offset: TOTAL_ITEM_HEIGHT * index,
        index,
    }), [])

    return (
        <View style={styles.container}>
            {isAddingItem && (
                <View style={styles.topInputContainer}>
                    <TextInput
                        style={styles.topInput}
                        value={editText}
                        onChangeText={setEditText}
                        onSubmitEditing={handleSubmitEdit}
                        onBlur={handleCancelEdit}
                        blurOnSubmit={false}
                        placeholder="Enter new item..."
                        placeholderTextColor="#888"
                        autoFocus
                    />
                </View>
            )}
            <View style={styles.container} onTouchEnd={handleListPress}>
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
                    contentContainerStyle={{
                        paddingVertical: SCREEN_HEIGHT / 3,
                    }}
                />
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    topInputContainer: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#fff',
    },
    topInput: {
        fontSize: 16,
        color: '#222',
        fontWeight: '600',
    },
})

const headerStyles = StyleSheet.create({
    container: {
        height: ITEM_HEIGHT + SPACING,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 20,
    },
    title: {
        fontSize: 13,
        fontWeight: '700',
        color: '#555',
        marginLeft: 6,
        letterSpacing: 0.5,
    },
})
