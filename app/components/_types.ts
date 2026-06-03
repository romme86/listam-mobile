export type ListEntry = {
    text: string
    isDone: boolean
    timeOfCompletion: EpochTimeStamp
}

/** Shared size scale for grid icons / list text. `large` is the accessibility step. */
export type SizeOption = 'small' | 'medium' | 'normal' | 'large'

export type RpcRef = {
    current: any
}
