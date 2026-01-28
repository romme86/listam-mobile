# Listam

**Listam** is an experimental, local-first, peer-to-peer collaborative list application built with **React Native**, **Bare**, and **Autobase**.

The project explores how far you can push a *real embedded backend* running inside a mobile app, with:
- no central server
- offline-first behavior
- peer-to-peer synchronization
- deterministic state reconstruction

This repository is intended as both:
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

