const path = require('path')

const VITE_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
]

// Replace import.meta.env.VITE_* with the actual values from process.env
const envDefines = Object.fromEntries(
  VITE_ENV_KEYS.map(key => [
    `import.meta.env.${key}`,
    JSON.stringify(process.env[key] ?? '')
  ])
)

module.exports = function (buildOptions) {
  return {
    ...buildOptions,
    alias: {
      ...(buildOptions.alias || {}),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@plugin': path.resolve(__dirname, 'src/plugin'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@backend': path.resolve(__dirname, 'src/firebase')
    },
    define: {
      ...(buildOptions.define || {}),
      ...envDefines
    }
  }
}
