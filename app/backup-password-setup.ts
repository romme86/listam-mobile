export type BackupPasswordSetupFailure = 'too-short' | 'mismatch' | 'request-failed'

export type BackupPasswordSetupResult =
    | { ok: true }
    | { ok: false; reason: BackupPasswordSetupFailure }

type SendSetupRequest = (payload: string) => Promise<string | null>

// Keep first-time password setup independent from React Native so validation and
// the exact RPC payload can be regression-tested without rendering a native
// Modal. Passwords are deliberately not trimmed or normalized: the backend uses
// the exact string as encryption material.
export async function submitInitialBackupPassword(
    password: string,
    confirmation: string,
    sendRequest: SendSetupRequest,
): Promise<BackupPasswordSetupResult> {
    if (password.length < 8) return { ok: false, reason: 'too-short' }
    if (password !== confirmation) return { ok: false, reason: 'mismatch' }

    try {
        const reply = await sendRequest(JSON.stringify({ next: password }))
        if (!reply) return { ok: false, reason: 'request-failed' }
        const parsed = JSON.parse(reply)
        return parsed?.ok === true
            ? { ok: true }
            : { ok: false, reason: 'request-failed' }
    } catch {
        return { ok: false, reason: 'request-failed' }
    }
}
