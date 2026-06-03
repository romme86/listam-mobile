import * as Haptics from 'expo-haptics'

/**
 * A single, consistent haptic vocabulary for the whole app.
 * Fire-and-forget — failures on unsupported devices are swallowed.
 */
function safe(run: () => Promise<unknown>) {
    try {
        run().catch(() => {})
    } catch {
        // no-op
    }
}

export const haptics = {
    /** Marking an item complete. */
    toggleOn: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
    /** Un-completing / a light selection change. */
    toggleOff: () => safe(() => Haptics.selectionAsync()),
    /** Selecting an option, opening a surface. */
    select: () => safe(() => Haptics.selectionAsync()),
    /** A destructive action committed (delete). */
    delete: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
    /** A flow completed successfully (join, save). */
    success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
    /** Something failed or was rejected. */
    error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
}
