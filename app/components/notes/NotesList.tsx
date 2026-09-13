import React, { useCallback, useMemo, useRef } from 'react'
import {
    Animated,
    StyleSheet,
    View,
    Text,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ListAlignment, ListEntry, ListSpacing, SizeOption } from '../_types'
import { ITEM_HEIGHT } from '../ListItem'
import { getListSpacing, getListTextScale } from '../intertial_scroll'
import { useTheme, type Theme } from '../../theme'
import { useI18n } from '../../i18n'
import { NoteRow } from './NoteRow'
import { buildNoteRows, type NoteRow as NoteRowModel } from './noteRows'

// A note that has grown blocks needs room for its excerpt + block count; a plain
// note stays exactly a list row (see the shared ITEM_HEIGHT).
const DOCUMENT_ROW_HEIGHT = 76

type Props = {
    data: ListEntry[]
    onOpen: (item: ListEntry) => void
    onDelete?: (index: number) => void
    onFlagToday?: (index: number) => void
    isPlanned?: (item: ListEntry) => boolean
    listTextSize?: SizeOption
    listAlignment?: ListAlignment
    listItemSpacing?: ListSpacing
    reduceMotion?: boolean
}

// Notes use the app shell's double-tap-to-add gesture and transient add bar.
function NotesList({
    data,
    onOpen,
    onDelete,
    onFlagToday,
    isPlanned,
    listTextSize = 'normal',
    listAlignment = 'left',
    listItemSpacing = 'normal',
    reduceMotion = false,
}: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const insets = useSafeAreaInsets()
    const styles = useMemo(() => makeStyles(t), [t])
    const scrollY = useRef(new Animated.Value(0)).current
    const textScaleFactor = getListTextScale(listTextSize)
    const spacing = getListSpacing(listItemSpacing)

    const rows = useMemo(
        () => buildNoteRows(data, { plainHeight: ITEM_HEIGHT, documentHeight: DOCUMENT_ROW_HEIGHT, spacing }),
        [data, spacing],
    )

    const renderItem = useCallback(({ item }: { item: NoteRowModel }) => (
        <NoteRow
            row={item}
            scrollY={scrollY}
            onOpen={onOpen}
            onDelete={onDelete}
            onFlagToday={onFlagToday}
            planned={isPlanned?.(item.entry) ?? false}
            textScaleFactor={textScaleFactor}
            listAlignment={listAlignment}
            spacing={spacing}
            reduceMotion={reduceMotion}
        />
    ), [scrollY, onOpen, onDelete, onFlagToday, isPlanned, textScaleFactor, listAlignment, spacing, reduceMotion])

    const keyExtractor = useCallback((item: NoteRowModel) => item.key, [])

    const getItemLayout = useCallback((_: any, index: number) => ({
        length: (rows[index]?.height ?? ITEM_HEIGHT) + spacing,
        offset: rows[index]?.offset ?? 0,
        index,
    }), [rows, spacing])

    return (
        <View style={styles.container}>
            <Animated.FlatList
                data={rows}
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
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyTitle}>{i18n.t('mobile.notes.empty')}</Text>
                        <Text style={styles.emptyHint}>{i18n.t('main.empty.hintAdd')}</Text>
                    </View>
                }
                contentContainerStyle={{
                    flexGrow: 1,
                    paddingTop: t.spacing.lg,
                    paddingBottom: insets.bottom + 140,
                }}
            />
        </View>
    )
}

// Same reason as the list surface: app-shell state must not rebuild the notes
// index before a modal can be committed to the native view.
export default React.memo(NotesList)

function makeStyles(t: Theme) {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: t.colors.bg,
        },
        empty: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: t.spacing.md,
        },
        emptyTitle: {
            fontSize: t.type.bodyLg.fontSize,
            color: t.colors.textSecondary,
        },
        emptyHint: { fontSize: t.type.label.fontSize, color: t.colors.textTertiary },
    })
}
