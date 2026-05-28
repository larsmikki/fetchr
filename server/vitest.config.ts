import { defineConfig } from 'vitest/config'
import os from 'os'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      DATA_DIR: path.join(os.tmpdir(), 'test-data'),
      NODE_ENV: 'test',
    },
  },
})
