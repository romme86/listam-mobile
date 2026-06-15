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
}

/** Shared size scale for grid icons / list text. `large` is the accessibility step. */
export type SizeOption = 'small' | 'medium' | 'normal' | 'large'

/** Horizontal alignment of rows in the (non-grid) list view. */
export type ListAlignment = 'left' | 'center'

/** Vertical gap between rows in the (non-grid) list view. `normal` matches the default 16px. */
export type ListSpacing = 'compact' | 'cozy' | 'normal' | 'relaxed'

export type RpcRef = {
    current: any
}
