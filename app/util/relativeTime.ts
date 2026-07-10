// Language-neutral relative-time helpers, mirroring the desktop ones
// (listam-desktop/src/ui.mjs formatAgo/formatUptime): the numeric output carries
// no words, so only the surrounding i18n label needs translating.

export function formatAgo(ms: number): string {
    const secs = Math.max(0, Math.round(Number(ms) / 1000))
    if (secs < 60) return `${secs}s`
    const mins = Math.round(secs / 60)
    if (mins < 60) return `${mins}m`
    const hrs = Math.round(mins / 60)
    if (hrs < 24) return `${hrs}h`
    return `${Math.round(hrs / 24)}d`
}

export function formatUptime(ms: number): string {
    const secs = Math.max(0, Math.floor(Number(ms) / 1000))
    const days = Math.floor(secs / 86400)
    const hrs = Math.floor((secs % 86400) / 3600)
    const mins = Math.floor((secs % 3600) / 60)
    if (days > 0) return `${days}d ${hrs}h`
    if (hrs > 0) return `${hrs}h ${mins}m`
    return `${mins}m`
}
