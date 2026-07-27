// The Bare backend bundles are BUILD ARTIFACTS, not source. `npm run bundle:backend:ios`
// / `:android` produce them (bare-pack → base64 → wrapped as an ES module), and
// `npm run ios` / `npm run android` run that step for you.
//
// They are no longer committed: two ~3.2 MB base64 blobs regenerated on every
// backend change grew listam-mobile's .git to 167 MB. Declaring the module shape
// here lets `tsc --noEmit` and CI run on a clean checkout without first
// producing 6 MB of generated code — only a native build actually needs the
// bytes.
declare module '*.bundle.mjs' {
    /** The Bare backend bundle, base64-encoded, chunked and loaded by the worklet. */
    const base64: string
    export default base64
}
