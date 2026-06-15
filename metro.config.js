// Metro configuration for the listam-mobile Expo app.
//
// The @listam/* packages are consumed from the sibling ../listam-packages
// workspace (symlinked into node_modules via the `file:` dependency). That
// directory lives outside this project root, and Metro only serves files inside
// watched folders — so the workspace packages dir must be added to watchFolders.
//
// Using Expo's getDefaultConfig also restores the resolver defaults this app
// relies on (e.g. `.mjs` source extension + package `exports` support), which
// the @listam/* packages use for their entry points.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const packagesRoot = path.resolve(projectRoot, '..', 'listam-packages')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [projectRoot, packagesRoot]

module.exports = config
