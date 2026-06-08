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
}

/** Shared size scale for grid icons / list text. `large` is the accessibility step. */
export type SizeOption = 'small' | 'medium' | 'normal' | 'large'

export type RpcRef = {
    current: any
}
