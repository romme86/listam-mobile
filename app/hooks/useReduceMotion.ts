import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Tracks the OS "Reduce Motion" accessibility setting so animations can be
 * toned down or skipped for users who are sensitive to motion.
 */
export function useReduceMotion(): boolean {
    const [reduced, setReduced] = useState(false)

    useEffect(() => {
        let mounted = true
        AccessibilityInfo.isReduceMotionEnabled().then((value) => {
            if (mounted) setReduced(!!value)
        })
        const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
            setReduced(!!value)
        })
        return () => {
            mounted = false
            sub?.remove?.()
        }
    }, [])

    return reduced
}
