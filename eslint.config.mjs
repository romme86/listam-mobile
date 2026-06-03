import tseslint from 'typescript-eslint'

// Phase 0 lint baseline. Intentionally narrow: the only enforced rule is
// `no-console` for production code (finding M5 — raw console calls have leaked
// key/invite material). Full lint coverage and routing through @listam/logging
// is Phase 9; this config establishes the gate without churning the prototype.
export default [
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'ios/**',
            'android/**',
            '.expo/**',
            'web-build/**',
            '**/*.bundle',
            '**/*.bundle.js',
            '**/*.bundle.mjs',
            // Committed generated Metro/Hermes bundles.
            'app.android.js',
            'app.android.mjs',
            'app.ios.js',
            'app.ios.mjs',
            'backend.bundle.*',
            'app/assets/**',
            'assets/**',
            'scripts/__pycache__/**'
        ]
    },
    // Production code: raw console is banned so secrets cannot be logged.
    {
        files: [
            'app/**/*.{ts,tsx,js,jsx,mjs,cjs}',
            'backend/**/*.{ts,tsx,js,jsx,mjs,cjs}'
        ],
        ignores: ['**/*.test.{ts,tsx,js,mjs,cjs}'],
        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 'latest',
            sourceType: 'module'
        },
        rules: {
            'no-console': 'error'
        }
    },
    // Legacy files that still use console. Downgraded to a warning as a ratchet:
    // existing calls do not fail CI, but no NEW file may introduce console, and
    // the warnings track the remaining Phase 9 (M5) logger-migration work.
    {
        files: [
            'app/index.tsx',
            'app/hooks/_useWorklet.ts',
            'app/hooks/useSubscription.ts',
            'backend/backend.mjs',
            'backend/lib/item.mjs',
            'backend/lib/network.mjs',
            'backend/lib/key.mjs'
        ],
        rules: {
            'no-console': 'warn'
        }
    },
    // Build/codegen scripts and tests may log freely.
    {
        files: ['scripts/**', '**/*.test.{ts,tsx,js,mjs,cjs}'],
        rules: {
            'no-console': 'off'
        }
    }
]
