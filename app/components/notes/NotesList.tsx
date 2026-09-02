import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
    Animated,
    StyleSheet,
    TextInput,
    View,
    Text,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
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
    /** Commit the composer row. Resolves false when the write was refused, so the
     *  typed text is kept rather than silently dropped. */
    onCreate: (text: string) => Promise<boolean>
    onDelete?: (index: number) => void
    onFlagToday?: (index: number) => void
    isPlanned?: (item: ListEntry) => boolean
    listTextSize?: SizeOption
    listAlignment?: ListAlignment
    listItemSpacing?: ListSpacing
    reduceMotion?: boolean
}

// The notes surface. Unlike the grocery/to-do list there is no FAB (showFab is
// off by default and mobile exposes no toggle for it), so writing a note starts
// from a composer row pinned above the index rather than from a floating button.
function NotesList({
    data,
    onOpen,
    onCreate,
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
    const [draft, setDraft] = useState('')
    const writePendingRef = useRef(false)
    const textScaleFactor = getListTextScale(listTextSize)
    const spacing = getListSpacing(listItemSpacing)

    const rows = useMemo(
        () => buildNoteRows(data, { plainHeight: ITEM_HEIGHT, documentHeight: DOCUMENT_ROW_HEIGHT, spacing }),
        [data, spacing],
    )

    // Return commits and clears; a refused write keeps the text on screen. One
    // in-flight write at a time, like the add bar, so a double return can't file
    // the same note twice.
    const submit = useCallback(async () => {
        const value = draft.trim()
        if (!value || writePendingRef.current) return
        writePendingRef.current = true
        try {
            if (await onCreate(value)) setDraft((current) => (current.trim() === value ? '' : current))
        } finally {
            writePendingRef.current = false
        }
    }, [draft, onCreate])

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
            <View style={styles.composer}>
                <Ionicons name="add" size={22} color={t.colors.textSecondary} />
                <TextInput
                    style={styles.composerInput}
                    value={draft}
                    onChangeText={setDraft}
                    onSubmitEditing={submit}
                    blurOnSubmit={false}
                    placeholder={i18n.t('mobile.notes.new')}
                    placeholderTextColor={t.colors.placeholder}
                    returnKeyType="done"
                />
            </View>
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
                        <Ionicons name="document-text-outline" size={44} color={t.colors.textTertiary} />
                        <Text style={styles.emptyTitle}>{i18n.t('mobile.notes.empty')}</Text>
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
        composer: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            paddingHorizontal: t.spacing.lg,
            paddingVertical: t.spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: t.colors.border,
            backgroundColor: t.colors.bg,
        },
        composerInput: {
            flex: 1,
            fontSize: t.type.bodyLg.fontSize,
            color: t.colors.text,
            fontWeight: '600',
            padding: 0,
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
    })
}
