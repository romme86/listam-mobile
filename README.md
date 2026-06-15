# Listam Mobile

**Listam Mobile** is the mobile app repository for Listam, an experimental, local-first, peer-to-peer collaborative list application built with **React Native**, **Bare**, and **Autobase**.

The project explores how far you can push a *real embedded backend* running inside a mobile app, with:
- no central server
- offline-first behavior
- peer-to-peer synchronization
- deterministic state reconstruction

This `listam-mobile` repository is intended as both:
- a **working application**, and
- a **reference architecture** for local-first P2P apps on mobile.

---

## Why This Project Exists

Most mobile apps treat “offline” and “sync” as edge cases.

Listam does the opposite:
- the local database is the source of truth
- networking is opportunistic
- collaboration emerges from replicated logs, not APIs

The backend is not mocked or simulated — it actually runs *inside* the app via Bare.

---

## Architecture Overview

Listam is split into two clearly separated layers:

### 1. Frontend (React Native)
- UI only
- No direct database access
- Talks to the backend exclusively via RPC
- Starts the backend using a guarded singleton worklet

### 2. Backend (Bare Worklet)
- Runs inside the app process
- Owns **all mutable state**
- Uses **Corestore + Autobase**
- Handles persistence, replication, and rebuilds

---

## Invite Safety

Listam invite links and pasted invite codes require explicit user confirmation before the app sends a join RPC. A cancelled confirmation does not change the current list base or visible list.

Host-created BlindPairing invites are single-use and expire after 10 minutes. The backend reserves the one allowed use before accepting a join candidate, rotates the invite after use or expiry, and removes stale legacy `lista-invite.json` files instead of persisting plaintext invite material.

---

## Building & Running (iOS)

This app is part of the Listam monorepo. The `@listam/*` packages it depends on
live in the sibling `../listam-packages` npm workspace and are linked in via
`file:` dependencies, so a clean build looks like:

```bash
npm install
(cd ios && LANG=en_US.UTF-8 pod install)
LANG=en_US.UTF-8 npx expo run:ios
```

Notes:

- **CocoaPods needs a UTF-8 locale.** Without it, `pod install` aborts with
  `Encoding::CompatibilityError`. Export `LANG=en_US.UTF-8` (and/or
  `LC_ALL=en_US.UTF-8`) for the `pod install` step — the snippet above does this
  inline.
- **Metro must watch the workspace.** `metro.config.js` adds `../listam-packages`
  to `watchFolders` so Metro can resolve the symlinked `@listam/*` packages and
  their hoisted dependencies. Don't remove it, or the bundler will fail to
  resolve those packages from a clean checkout.

## Building a Free Version (Disabling the Paywall)

Listam includes a subscription paywall that appears after a 30-day trial. If you're building your own version of the app according to the open source philosophy, you can disable it entirely.

Edit `app/hooks/useSubscription.ts` and modify the return statement at the end of the `useSubscription` function:

```typescript
return {
    ...state,
    shouldShowPaywall: false,  // Always false = no paywall
    isSubscribed: true,        // Treat as always subscribed
    purchase,
    restore,
    refresh: checkStatus,
}
```

This works for both Android and iOS builds.

---

