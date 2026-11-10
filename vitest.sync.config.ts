import { defineConfig } from 'vitest/config'

// For `npm run test:sync`; see tests-emu/backend.test.ts.
export default defineConfig({ test: { include: ['tests-emu/**/*.test.ts'], testTimeout: 20000 } })
