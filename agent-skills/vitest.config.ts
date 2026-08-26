import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Keep pure TypeScript suites in Node. Component interaction tests use the
    // dedicated jsdom config in vitest.dom.config.ts.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
