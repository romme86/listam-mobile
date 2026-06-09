import { startBackend } from '@listam/backend/backend'
import { createBareKitPlatform } from '@listam/backend/platform/bare-kit'

await startBackend(createBareKitPlatform({ Bare, BareKit }))
