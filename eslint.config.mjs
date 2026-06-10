import tseslint from 'typescript-eslint'

// Security lint baseline. Raw console calls are banned in production app/backend
// code so key, invite, and loyalty-card material routes through @listam/logging.
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
            'backend/**/*.{ts,tsx,js,jsx,mjs,cjs}',
            'packages/**/*.{ts,tsx,js,jsx,mjs,cjs}'
        ],
        ignores: ['**/*.test.{ts,tsx,js,mjs,cjs}', '**/*.scenario.mjs', 'packages/logging/index.mjs'],
        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 'latest',
            sourceType: 'module'
        },
        rules: {
            'no-console': 'error'
        }
    },
    // The shared logger is the only production console boundary.
    {
        files: ['packages/logging/index.mjs'],
        rules: {
            'no-console': 'off'
        }
    },
    // Build/codegen scripts and tests (incl. child-process test scenarios)
    // may log freely.
    {
        files: ['scripts/**', '**/*.test.{ts,tsx,js,mjs,cjs}', '**/*.scenario.mjs'],
        rules: {
            'no-console': 'off'
        }
    }
]
