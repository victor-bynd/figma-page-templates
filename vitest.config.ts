import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 10000
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@plugin': path.resolve(__dirname, 'src/plugin'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@backend': path.resolve(__dirname, 'src/firebase')
    }
  }
})
