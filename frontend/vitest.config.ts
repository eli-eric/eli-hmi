import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const coverageSourceGlobs = [
  'src/lib/websocket/**/*.{ts,tsx}',
  'src/lib/settings/**/*.{ts,tsx}',
  'src/middleware.ts',
  'src/components/module-page/**/*.{ts,tsx}',
  'src/app/(modules)/l4-opcpa/**/*.{ts,tsx}',
  'src/components/hmi/laser-panel/**/*.{ts,tsx}',
  'src/components/hmi/controls/**/*.{ts,tsx}',
]

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary', 'cobertura'],
      // Allow-list: only files under these paths count toward coverage. The
      // L4 OPCPA paths are explicitly added (not excluded) so the primitives
      // shipped in PR #26 (pv-names, usePvWrite, sections, etc.) participate
      // in the threshold check below.
      include: coverageSourceGlobs,
      exclude: ['src/test/**', '**/*.config.*', '**/types.ts', '**/index.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
