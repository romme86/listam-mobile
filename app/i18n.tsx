import React, { createContext, useContext, useMemo } from 'react'
import {
    LOCALE_CHOICES,
    LOCALE_LABEL_KEYS,
    createI18n,
    type I18n,
    type LocaleChoice,
    type MessageKey,
} from '@listam/i18n'
import { useAppSelector } from './store/hooks'
import { selectPreferences } from './store/preferencesSlice'

type I18nContextValue = I18n & {
    localeChoices: readonly LocaleChoice[]
    labelForLocaleChoice: (choice: LocaleChoice) => string
}

const fallbackI18n = createI18n({ localeChoice: 'system', systemLocale: 'en' })
const I18nContext = createContext<I18nContextValue>({
    ...fallbackI18n,
    localeChoices: LOCALE_CHOICES,
    labelForLocaleChoice: (choice) => fallbackI18n.t(LOCALE_LABEL_KEYS[choice]),
})

export function I18nProvider({ children }: { children: React.ReactNode }) {
    const { localeChoice } = useAppSelector(selectPreferences)
    const systemLocale = getSystemLocale()

    const value = useMemo<I18nContextValue>(() => {
        const i18n = createI18n({ localeChoice, systemLocale })
        return {
            ...i18n,
            localeChoices: LOCALE_CHOICES,
            labelForLocaleChoice: (choice) => i18n.t(LOCALE_LABEL_KEYS[choice]),
        }
    }, [localeChoice, systemLocale])

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
    return useContext(I18nContext)
}

function getSystemLocale(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().locale || 'en'
    } catch {
        return 'en'
    }
}

export type { LocaleChoice, MessageKey }
