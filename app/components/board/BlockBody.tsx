import React, { useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, Linking } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
    BLOCK_TYPES, normalizeBlocks, createBlock, blockToText, blockFromText,
    type TicketBlock,
} from '@listam/domain/board'
import { useTheme, type Theme } from '../../theme'
import { useI18n } from '../../i18n'
import { TicketInlineMarkdown } from './TicketBits'
import { RichMarkdownEditor } from './RichMarkdownEditor'

// Markdown + callout blocks edit as live WYSIWYG (TipTap-in-webview); the rest
// keep the lightweight raw-text editor.
const RICH_TYPES = new Set(['markdown', 'callout'])

type Props = {
    blocks: TicketBlock[] | undefined
    onChange: (blocks: TicketBlock[]) => void
}

let _seq = 0
function nextBlockId(): string {
    _seq += 1
    return `blk-${Date.now().toString(36)}-${_seq}`
}

const BLOCK_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
    markdown: 'text-outline',
    checklist: 'checkbox-outline',
    numberedList: 'list-outline',
    links: 'link-outline',
    image: 'image-outline',
    table: 'grid-outline',
    callout: 'chatbox-ellipses-outline',
    code: 'code-slash-outline',
}

// The block-based ticket body editor. Each block renders a formatted view and,
// on tap, an inline raw-text editor (seeded by blockToText, committed via
// blockFromText) — the same model as desktop, plus mobile checkbox toggles.
export function BlockBody({ blocks, onChange }: Props) {
    const t = useTheme()
    const i18n = useI18n()
    const styles = useMemo(() => makeStyles(t), [t])
    const list = useMemo(() => normalizeBlocks(blocks), [blocks])
    const [editingId, setEditingId] = useState<string | null>(null)
    const [draft, setDraft] = useState('')
    const [adding, setAdding] = useState(false)
    const inputRef = useRef<TextInput>(null)

    const replaceBlocks = (next: TicketBlock[]) => onChange(next)

    const patchBlock = (id: string, patch: Record<string, unknown>) => {
        replaceBlocks(list.map((b) => (b.id === id ? { ...b, ...patch } : b)))
    }

    const startEdit = (b: TicketBlock) => {
        setEditingId(b.id)
        setDraft(blockToText(b))
    }
    // Plain-text (non-rich) commit on blur. Rich blocks commit themselves when
    // the editor unmounts (see the RichMarkdownEditor onCommit below).
    const commitEdit = (b: TicketBlock) => {
        patchBlock(b.id, blockFromText(b.type, draft))
        setEditingId(null)
        setDraft('')
    }

    const deleteBlock = (id: string) => {
        if (editingId === id) setEditingId(null)
        replaceBlocks(list.filter((b) => b.id !== id))
    }
    const moveBlock = (index: number, dir: -1 | 1) => {
        const to = index + dir
        if (to < 0 || to >= list.length) return
        const next = list.slice()
        const [m] = next.splice(index, 1)
        next.splice(to, 0, m)
        replaceBlocks(next)
    }
    const addBlock = (type: string) => {
        const block = createBlock(type, nextBlockId()) as TicketBlock
        setAdding(false)
        replaceBlocks([...list, block])
        startEdit(block)
    }
    const toggleChecklistItem = (b: TicketBlock, i: number) => {
        const items = Array.isArray((b as any).items) ? [...(b as any).items] : []
        if (!items[i]) return
        items[i] = { ...items[i], done: !items[i].done }
        patchBlock(b.id, { items })
    }

    return (
        <View style={styles.wrap}>
            {list.map((b, index) => (
                <View key={b.id} style={styles.block}>
                    <View style={styles.blockHead}>
                        <Ionicons name={BLOCK_ICON[b.type] || 'ellipse-outline'} size={14} color={t.colors.textTertiary} />
                        <Text style={styles.blockLabel}>{i18n.t(`ticket.block.type.${b.type}` as never)}</Text>
                        <View style={styles.blockActions}>
                            <TouchableOpacity onPress={() => moveBlock(index, -1)} hitSlop={8} disabled={index === 0}>
                                <Ionicons name="chevron-up" size={16} color={index === 0 ? t.colors.textDisabled : t.colors.textTertiary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => moveBlock(index, 1)} hitSlop={8} disabled={index === list.length - 1}>
                                <Ionicons name="chevron-down" size={16} color={index === list.length - 1 ? t.colors.textDisabled : t.colors.textTertiary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => deleteBlock(b.id)} hitSlop={8} accessibilityLabel={i18n.t('ticket.block.delete')}>
                                <Ionicons name="trash-outline" size={16} color={t.colors.textTertiary} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {editingId === b.id ? (
                        RICH_TYPES.has(b.type) ? (
                            <View style={styles.editWrap}>
                                <RichMarkdownEditor
                                    initialMarkdown={blockToText(b)}
                                    mode={b.type === 'markdown' ? 'block' : 'inline'}
                                    onCommit={(md) => patchBlock(b.id, blockFromText(b.type, md))}
                                />
                                <TouchableOpacity style={styles.richDone} onPress={() => setEditingId(null)} accessibilityRole="button">
                                    <Ionicons name="checkmark" size={16} color={t.colors.accent} />
                                    <Text style={styles.richDoneText}>{i18n.t('common.save')}</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.editWrap}>
                                <TextInput
                                    ref={inputRef}
                                    style={styles.editor}
                                    value={draft}
                                    onChangeText={setDraft}
                                    multiline
                                    autoFocus
                                    placeholder={i18n.t(`ticket.block.placeholder.${b.type}` as never)}
                                    placeholderTextColor={t.colors.placeholder}
                                    onBlur={() => commitEdit(b)}
                                />
                            </View>
                        )
                    ) : (
                        <TouchableOpacity activeOpacity={0.7} onPress={() => startEdit(b)}>
                            <BlockView block={b} onToggleItem={(i) => toggleChecklistItem(b, i)} />
                        </TouchableOpacity>
                    )}
                </View>
            ))}

            {adding ? (
                <View style={styles.typeMenu}>
                    {BLOCK_TYPES.map((spec) => (
                        <TouchableOpacity key={spec.type} style={styles.typeItem} onPress={() => addBlock(spec.type)}>
                            <Ionicons name={BLOCK_ICON[spec.type] || 'ellipse-outline'} size={16} color={t.colors.text} />
                            <Text style={styles.typeLabel}>{i18n.t(spec.labelKey as never)}</Text>
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.typeItem} onPress={() => setAdding(false)}>
                        <Ionicons name="close" size={16} color={t.colors.textTertiary} />
                        <Text style={[styles.typeLabel, { color: t.colors.textTertiary }]}>{i18n.t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <TouchableOpacity style={styles.addBtn} onPress={() => setAdding(true)} accessibilityRole="button">
                    <Ionicons name="add" size={16} color={t.colors.accent} />
                    <Text style={styles.addLabel}>{i18n.t('ticket.block.add')}</Text>
                </TouchableOpacity>
            )}
        </View>
    )
}

function BlockView({ block, onToggleItem }: { block: TicketBlock; onToggleItem: (i: number) => void }) {
    const t = useTheme()
    const styles = useMemo(() => makeStyles(t), [t])
    const i18n = useI18n()
    const b = block as any

    switch (block.type) {
        case 'checklist':
            return (
                <View style={styles.itemList}>
                    {(b.items || []).map((it: any, i: number) => (
                        <TouchableOpacity key={i} style={styles.checkRow} activeOpacity={0.7} onPress={() => onToggleItem(i)}>
                            <Ionicons
                                name={it.done ? 'checkbox' : 'square-outline'}
                                size={20}
                                color={it.done ? t.colors.success : t.colors.textTertiary}
                            />
                            <Text style={[styles.itemText, it.done && styles.itemDone]}>{it.text}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )
        case 'numberedList':
            return (
                <View style={styles.itemList}>
                    {(b.items || []).map((it: any, i: number) => (
                        <Text key={i} style={styles.itemText}>{i + 1}. {it.text}</Text>
                    ))}
                </View>
            )
        case 'links':
            return (
                <View style={styles.itemList}>
                    {(b.links || []).map((l: any, i: number) => (
                        <TouchableOpacity key={i} onPress={() => l.url && Linking.openURL(l.url).catch(() => {})}>
                            <Text style={styles.linkLabel}>{l.label || l.url}</Text>
                            {l.url ? <Text style={styles.linkUrl}>{l.url.replace(/^https?:\/\//, '')}</Text> : null}
                        </TouchableOpacity>
                    ))}
                </View>
            )
        case 'image':
            return b.url
                ? <Image source={{ uri: b.url }} style={styles.image} resizeMode="cover" />
                : <Text style={styles.placeholder}>{i18n.t('ticket.block.imageEmpty')}</Text>
        case 'table':
            return (
                <View style={styles.table}>
                    {(b.rows || []).map((row: any[], r: number) => (
                        <View key={r} style={styles.tableRow}>
                            {(row || []).map((cell, c) => (
                                <Text key={c} style={[styles.tableCell, r === 0 && styles.tableHead]}>{cell}</Text>
                            ))}
                        </View>
                    ))}
                </View>
            )
        case 'callout':
            return (
                <View style={styles.callout}>
                    <TicketInlineMarkdown text={b.text} />
                </View>
            )
        case 'code':
            return <Text style={styles.code}>{b.text}</Text>
        default: {
            if (!b.text) return <Text style={styles.placeholder}>{i18n.t('ticket.block.placeholder.markdown')}</Text>
            // Render line-by-line so `#`/`##`/`###` prefixes become headings;
            // every other line keeps inline markdown (bold/italic/code/links).
            const lines = String(b.text).split('\n')
            return (
                <View style={styles.mdBody}>
                    {lines.map((line, i) => {
                        // Lenient like the shared markdownToHtml bridge: accept 1-6
                        // hashes, collapse 4-6 onto h3 (so desktop-authored deep headings
                        // don't show literal '#' on mobile).
                        const h = line.match(/^(#{1,6})\s+(.*)$/)
                        if (h) {
                            const lvl = Math.min(h[1].length, 3)
                            const hStyle = lvl === 1 ? styles.h1 : lvl === 2 ? styles.h2 : styles.h3
                            return <TicketInlineMarkdown key={i} text={h[2]} style={hStyle} />
                        }
                        if (line.trim() === '') return <View key={i} style={styles.mdGap} />
                        return <TicketInlineMarkdown key={i} text={line} />
                    })}
                </View>
            )
        }
    }
}

function makeStyles(t: Theme) {
    return StyleSheet.create({
        wrap: { gap: t.spacing.md },
        block: {
            borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border,
            borderRadius: t.radius.md, padding: t.spacing.md, gap: t.spacing.sm,
            backgroundColor: t.colors.surface,
        },
        blockHead: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
        blockLabel: {
            flex: 1, fontSize: t.type.caption.fontSize, fontWeight: '700',
            color: t.colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5,
        },
        blockActions: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
        editWrap: { gap: t.spacing.sm },
        richDone: {
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: t.spacing.xs,
            paddingVertical: t.spacing.sm, borderRadius: t.radius.sm,
            backgroundColor: t.colors.surfaceAlt, alignSelf: 'stretch',
        },
        richDoneText: { fontSize: t.type.label.fontSize, fontWeight: '700', color: t.colors.accent },
        editor: {
            fontSize: t.type.body.fontSize, color: t.colors.text,
            backgroundColor: t.colors.surfaceAlt, borderRadius: t.radius.sm,
            padding: t.spacing.sm, minHeight: 72, textAlignVertical: 'top',
        },
        mdBody: { gap: t.spacing.xs },
        mdGap: { height: t.spacing.sm },
        h1: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
        h2: { fontSize: 19, lineHeight: 25, fontWeight: '800' },
        h3: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
        itemList: { gap: t.spacing.sm },
        checkRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
        itemText: { flex: 1, fontSize: t.type.body.fontSize, color: t.colors.text },
        itemDone: { textDecorationLine: 'line-through', color: t.colors.textTertiary },
        linkLabel: { fontSize: t.type.body.fontSize, color: t.colors.text, fontWeight: '600' },
        linkUrl: { fontSize: t.type.caption.fontSize, color: t.colors.textTertiary },
        image: { width: '100%', height: 160, borderRadius: t.radius.sm, backgroundColor: t.colors.surfaceAlt },
        placeholder: { fontSize: t.type.body.fontSize, color: t.colors.placeholder, fontStyle: 'italic' },
        table: { borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border, borderRadius: t.radius.sm, overflow: 'hidden' },
        tableRow: { flexDirection: 'row' },
        tableCell: { flex: 1, padding: t.spacing.sm, fontSize: t.type.caption.fontSize, color: t.colors.text, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
        tableHead: { fontWeight: '700', backgroundColor: t.colors.surfaceAlt },
        callout: { backgroundColor: t.colors.surfaceAlt, borderRadius: t.radius.sm, padding: t.spacing.md, borderLeftWidth: 3, borderLeftColor: t.colors.accent },
        code: { fontFamily: 'CasinoGrotesk-Regular', fontSize: t.type.label.fontSize, color: t.colors.text, backgroundColor: t.colors.surfaceAlt, borderRadius: t.radius.sm, padding: t.spacing.md },
        addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: t.spacing.xs, paddingVertical: t.spacing.md, borderRadius: t.radius.md, borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', borderColor: t.colors.border },
        addLabel: { fontSize: t.type.label.fontSize, fontWeight: '600', color: t.colors.textSecondary },
        typeMenu: { borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border, borderRadius: t.radius.md, overflow: 'hidden' },
        typeItem: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.md, paddingVertical: t.spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.colors.border },
        typeLabel: { fontSize: t.type.body.fontSize, color: t.colors.text },
    })
}
