import { useColorScheme, Easing } from 'react-native'
import { useAppSelector } from './store/hooks'

/**
 * Design tokens — the single source of truth for color, spacing, radius,
 * type and motion. Everything in the app should consume these rather than
 * hardcoding literals, so the look stays consistent and dark mode works.
 */

export type Colors = {
    bg: string
    surface: string
    surfaceAlt: string
    surfaceSunken: string
    border: string
    borderStrong: string
    text: string
    textSecondary: string
    textTertiary: string
    textDisabled: string
    primary: string
    onPrimary: string
    accent: string
    onAccent: string
    danger: string
    onDanger: string
    dangerSurface: string
    warning: string
    overlay: string
    scrim: string
    placeholder: string
}

const light: Colors = {
    bg: '#ffffff',
    surface: '#ffffff',
    surfaceAlt: '#f4f3f3',
    surfaceSunken: '#ececeb',
    border: '#e2e1e0',
    borderStrong: '#cfc9c9',
    text: '#1b1c1c',
    textSecondary: '#56504f',
    textTertiary: '#6f6968',
    textDisabled: '#9a9596',
    primary: '#1b1b1b',
    onPrimary: '#ffffff',
    accent: '#2f9e44',
    onAccent: '#ffffff',
    danger: '#c0271f',
    onDanger: '#ffffff',
    dangerSurface: '#fdeceb',
    warning: '#b06a00',
    overlay: 'rgba(0,0,0,0.45)',
    scrim: 'rgba(255,255,255,0.96)',
    placeholder: '#9a9596',
}

const dark: Colors = {
    bg: '#121212',
    surface: '#1b1b1d',
    surfaceAlt: '#242427',
    surfaceSunken: '#2b2b2e',
    border: '#333336',
    borderStrong: '#4a4a4d',
    text: '#f1efef',
    textSecondary: '#b6b1b2',
    textTertiary: '#928d8e',
    textDisabled: '#6c6869',
    primary: '#f1efef',
    onPrimary: '#1b1b1b',
    accent: '#54c26b',
    onAccent: '#0c2410',
    danger: '#ff6b62',
    onDanger: '#1b1b1b',
    dangerSurface: '#3a1c1a',
    warning: '#e0a04d',
    overlay: 'rgba(0,0,0,0.6)',
    scrim: 'rgba(0,0,0,0.92)',
    placeholder: '#7d7879',
}

/** Deterministic, muted palette for loyalty-card chips (replaces the loud flat-UI rainbow). */
export const CARD_COLORS = [
    '#5b7c99', '#6b8e6b', '#9c6b8e', '#8e7a5b',
    '#5f8a8a', '#9c6b6b', '#7a6f9c', '#5f6f8e',
] as const

export function cardColor(name: string): string {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return CARD_COLORS[Math.abs(hash) % CARD_COLORS.length]
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const

export const type = {
    display: { fontSize: 28, fontWeight: '700' as const },
    title: { fontSize: 20, fontWeight: '600' as const },
    bodyLg: { fontSize: 18, fontWeight: '400' as const },
    body: { fontSize: 16, fontWeight: '400' as const },
    bodyStrong: { fontSize: 16, fontWeight: '600' as const },
    label: { fontSize: 13, fontWeight: '600' as const },
    caption: { fontSize: 12, fontWeight: '500' as const },
} as const

export const motion = {
    duration: { fast: 120, base: 220, slow: 320 },
    easing: Easing.bezier(0.2, 0, 0, 1),
    easingOut: Easing.out(Easing.cubic),
} as const

export type Theme = {
    colors: Colors
    spacing: typeof spacing
    radius: typeof radius
    type: typeof type
    motion: typeof motion
    dark: boolean
}

export const lightTheme: Theme = { colors: light, spacing, radius, type, motion, dark: false }
export const darkTheme: Theme = { colors: dark, spacing, radius, type, motion, dark: true }

export function useTheme(): Theme {
    const scheme = useColorScheme()
    const choice = useAppSelector((s) => s.preferences.themeChoice)
    const resolved = choice === 'system' ? scheme : choice
    return resolved === 'dark' ? darkTheme : lightTheme
}
