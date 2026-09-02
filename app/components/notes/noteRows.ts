// Row geometry + presentation for the notes surface, kept free of react-native
// so the row-shape decision can be driven under node:test.
//
// A note is an ordinary list item: collapsed it is exactly what the voice
// notetaker writes (id/listId/listType/text), and it gains `blocks` only once
// the user opens it and adds one. So the row shape is derived, never stored — a
// note with blocks is a DOCUMENT row (title + excerpt + block count), everything
// else is a PLAIN row at the shared list-row height.
import { normalizeBlocks, blockToText, type TicketBlock } from '@listam/domain/board'
import { identityKey } from '../../listProjection'
import type { ListEntry } from '../_types'

export type NoteRowKind = 'plain' | 'document'

export type NoteRow = {
    entry: ListEntry
    /** Index into the source array — mutations (delete, flag) key off it. */
    index: number
    kind: NoteRowKind
    /** One-line preview of the body; '' on a plain note. */
    excerpt: string
    /** Number of blocks; 0 on a plain note. */
    blockCount: number
    /** The row's own height, spacing excluded. */
    height: number
    /** Distance from the top of the list to this row's top (spacing included). */
    offset: number
    key: string
}

export type NoteRowMetrics = {
    plainHeight: number
    documentHeight: number
    spacing: number
}

export function noteBlocks(entry: ListEntry): TicketBlock[] {
    return normalizeBlocks(entry?.blocks as TicketBlock[] | undefined)
}

// A note that has grown a body. Blocks are normalized first, so a stray/unknown
// block written by a newer peer never promotes an otherwise plain note.
export function isDocumentNote(entry: ListEntry): boolean {
    return noteBlocks(entry).length > 0
}

// The first non-empty line of the body, in block order. blockToText is the same
// serialization the block editor seeds its field with, so the excerpt reads as
// the text the user typed (a divider serializes empty and is skipped).
export function noteExcerpt(entry: ListEntry): string {
    for (const block of noteBlocks(entry)) {
        for (const line of blockToText(block).split('\n')) {
            const trimmed = line.trim()
            if (trimmed) return trimmed
        }
    }
    return ''
}

// The rendered rows, with the running offset each row's focus lens interpolates
// against. Row heights are mixed here (plain vs document), so the lens can't
// derive its centre from `index * height` the way the uniform list does.
export function buildNoteRows(data: ListEntry[], metrics: NoteRowMetrics): NoteRow[] {
    const rows: NoteRow[] = []
    let offset = 0
    data.forEach((entry, index) => {
        const document = isDocumentNote(entry)
        const height = document ? metrics.documentHeight : metrics.plainHeight
        rows.push({
            entry,
            index,
            kind: document ? 'document' : 'plain',
            excerpt: document ? noteExcerpt(entry) : '',
            blockCount: document ? noteBlocks(entry).length : 0,
            height,
            offset,
            key: `note-${identityKey(entry)}`,
        })
        offset += height + metrics.spacing
    })
    return rows
}
