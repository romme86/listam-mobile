# Google Stitch Prompt For Listam Desktop Design

Design a desktop application for Listam, a local-first peer-to-peer personal list app. The design should be for the future desktop version, not a marketing landing page.

## Product Context

Listam currently exists as an Expo/React Native mobile app with an embedded Bare/Holepunch backend. The durable replicated data lives in Autobase/Corestore, synchronization happens over Hyperswarm, and invite/join flows use BlindPairing. The UI should feel like a calm personal operations tool, not a cloud SaaS dashboard and not a decorative productivity landing page.

The future product will have:

- a mobile app
- a desktop app
- a headless always-on personal server that runs on owned devices such as a Raspberry Pi, mini PC, NAS, or home server
- future relay/storage dongles for Holepunch-stack apps
- shared packages for domain logic, protocol, backend, client adapters, logging, secrets, and grocery intelligence

The first desktop milestone should preserve current Listam behavior:

- simple shopping/list items
- add, update, complete/uncomplete, and delete items
- invite creation and joining
- peer count and sync status
- list and grid views
- grocery grouping and icon intelligence
- loyalty cards
- shared Redux/domain state model
- backend/client adapter boundary

The desktop app should be an enhanced large-screen version of the mobile app:

- denser list and grid layouts
- keyboard-first actions
- multi-pane navigation
- clearer sync and peer diagnostics
- visible invite and owned-device management
- diagnostics/log viewer
- secure settings for keys, storage, logs, and exports

## Design System Source Of Truth

Before designing or implementing desktop UI, inspect `listam-desktop/design-guide/`. Follow the design system docs and example screens in that folder, especially `kinetic_minimalist/DESIGN.md` and the screen examples for grocery lists, peers/devices, system activity, logs, and vault management.

If this prompt conflicts with the local design guide, the local design guide wins. Apply the same rule to any future app or project that includes a `design-guide/` directory: use that project's guide as the binding reference for layout, typography, color, spacing, interaction states, and component behavior.

## Desired Desktop Layout

Create a desktop app frame with these main regions:

1. Left sidebar
   - Listam brand/app name
   - Spaces or list groups
   - Current lists, such as Groceries, Household, Tasks, Travel
   - Owned devices entry for headless instances and future dongles
   - Diagnostics entry
   - Settings entry

2. Main workspace
   - Selected list title
   - Search/filter input
   - Add item input
   - Segmented control for list view and grid view
   - Category/group toggles
   - Dense item rows with checkbox, item icon, item name, category, sync state, and more-actions menu
   - Batch actions for selected items

3. Right inspector/status panel
   - Sync status
   - Peer count
   - Current base/list fingerprint as a short redacted fingerprint
   - Invite status with create, revoke, rotate, and copy/share actions
   - Headless helper status: bootstrap, replication, storage, async messages, diagnostics
   - Recent errors or warnings

Use a three-pane desktop layout by default, with the right inspector collapsible.

## Key Screens To Design

Design a coherent set of desktop screens or states:

1. Main List Workspace
   - Grocery list selected
   - Several items grouped by category
   - A few completed items
   - Peer/sync status visible
   - Keyboard-friendly add item flow

2. Invite And Join
   - Create invite
   - Join invite
   - Show invite lifetime, remaining uses, access mode, revoke, rotate, and copy actions
   - After joining a shared list, offer: "Also invite your headless instances?"
   - Allow selecting owned headless devices and choosing writer, storage helper, or relay-only access

3. Owned Devices
   - Known mobile, desktop, headless, and future dongle devices
   - Trust status, last seen, roles, storage usage, topic health, queue depth
   - Headless first-run pairing state
   - P2P owner-control is the default after pairing

4. Diagnostics And Logs
   - Local append-only JSONL logs visible in the app
   - Filters for app/instance, level, component, time window, topic/list fingerprint, request id
   - Development mode action to request redacted logs from trusted peers
   - Export as file/email bundle
   - Never show raw base keys, encryption keys, writer keys, invite codes, pairing secrets, owner-control tokens, or full item payloads by default

5. Settings And Security
   - Secure storage status for encryption keys, writer keys, owner-control tokens, invite secrets, and loyalty card data
   - Plaintext key migration status
   - Log retention and level controls
   - Export/import controls with clear warnings
   - Local-first explanation in settings, not as marketing copy

6. Loyalty Cards
   - Stored loyalty cards
   - Barcode/QR preview
   - Local-only privacy state
   - Delete/export actions
   - Indicate that barcode payloads are stored securely

## Visual Direction

Make it feel restrained, trustworthy, and useful for repeated daily use:

- light theme
- warm neutral background with clear contrast
- restrained green, blue, amber, and red accents for sync/health/status
- avoid a one-color purple/blue gradient look
- no decorative blobs or marketing hero treatment
- use compact panels, tables, rows, toolbars, and status chips
- use 8px border radius or less for cards/panels/buttons
- use icons for common actions: add, search, filter, sync, invite, copy, revoke, rotate, settings, logs, export, devices, warning
- no large empty hero sections
- no feature explanation cards on the first screen

The app should look like a real desktop productivity tool for managing personal lists and personal P2P devices.

## Interaction Details

Include these interaction affordances:

- command bar or quick action search
- keyboard shortcuts hinted subtly in menus/tooltips
- checkbox completion
- drag or move item affordances
- context menu for list items
- status chips for "Synced", "Syncing", "Offline", "Not writable", "Headless online"
- explicit destructive confirmations for revoke, delete, reset, and export secrets
- empty, loading, error, and offline states

## Important Architecture Concepts To Reflect

The design should make these concepts understandable without overwhelming the user:

- Listam is local-first and peer-to-peer
- Autobase/Corestore is the durable replicated source of truth
- Redux is only the UI projection and command state, not the database
- Headless is an always-on personal server on another owned device
- P2P owner-control is the default management path after pairing
- Invites should be visible, revocable, rotatable, scoped, and expiring
- Logs are local diagnostics and can be shared in development only after redaction
- Sensitive keys and loyalty card data belong in platform secure storage

## Output Request

Create a polished desktop app design with multiple screens/states, prioritizing the main list workspace first. Use realistic sample data, including grocery items, peers, a headless device, invite state, and diagnostic log rows. Keep copy concise and product-native. Do not create a landing page.
