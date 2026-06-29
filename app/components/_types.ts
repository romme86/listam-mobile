import type { BoardFields } from '@listam/domain/board'

export type ListEntry = {
    id?: string
    itemId?: string
    listId?: string
    listType?: string
    text: string
    isDone: boolean
    timeOfCompletion: EpochTimeStamp
    updatedAt?: number
    timestamp?: number
    author?: string
    /**
     * Canonical English category key (one of `CATEGORY_ORDER`) the user pinned
     * this item to by dragging it. When set, it wins over text classification.
     */
    categoryOverride?: string
    /**
     * Manual sort key set when the user reorders items (shared
     * `@listam/domain/ordering`). Optional and last-write-wins like every other
     * field; items without one render in their natural (insertion) order.
     */
    order?: number
    /**
     * Board-ticket fields. They ride through the store untouched (the reducers
     * spread items), so an item on a board list carries its status/blocks/etc.
     * `dueAt` is the one board field not in the shared `BoardFields` interface.
     */
    dueAt?: number
    /**
     * Value-return rates (1-10): how much value the task gives back (`valueRate`)
     * and how soon — 1 = soon, 10 = far (`delayRate`). Present only on items added
     * on a value-return-enabled surface. Generic fields (todo + board), so they
     * sit here rather than in BoardFields.
     */
    valueRate?: number
    delayRate?: number
    /**
     * Hex key of the SHARED single-list base this item lives in (single-list
     * sharing). Absent = the personal base. Tagged by the backend on a shared
     * list's items; rides through the store (reducers spread items) so writes can
     * be routed back to that base and the nav can mark the list as shared.
     */
    baseKey?: string
} & Partial<BoardFields>

/** A board ticket — a ListEntry on a board list, with its fields non-optional-ish for the UI. */
export type Ticket = ListEntry

/** Shared size scale for grid icons / list text. `large` is the accessibility step. */
export type SizeOption = 'small' | 'medium' | 'normal' | 'large'

/** Horizontal alignment of rows in the (non-grid) list view. */
export type ListAlignment = 'left' | 'center'

/** Vertical gap between rows in the (non-grid) list view. `normal` matches the default 16px. */
export type ListSpacing = 'compact' | 'cozy' | 'normal' | 'relaxed'

export type RpcRef = {
    current: any
}
