const path = require('path')

module.exports = function (buildOptions) {
  return {
    ...buildOptions,
    alias: {
      ...(buildOptions.alias || {}),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@plugin': path.resolve(__dirname, 'src/plugin'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@backend': path.resolve(__dirname, 'src/firebase')
    }
  }
}
