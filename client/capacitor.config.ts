import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.fetchr.client',
  appName: 'Fetchr',
  webDir: 'dist',
  server: {
    // For dev against a tunneled/LAN server, set CAPACITOR_SERVER_URL in your
    // shell before running `npx cap sync`. Leave undefined in production so
    // the bundled `dist/` is loaded from the app sandbox.
    url: process.env.CAPACITOR_SERVER_URL,
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
