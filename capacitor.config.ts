import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.neomaverick.walkthru',
  appName: 'Walkthru',
  webDir: 'dist',
  backgroundColor: '#f4f6f9',
  android: { backgroundColor: '#f4f6f9' },
  plugins: {
    SystemBars: { insetsHandling: 'css', style: 'LIGHT' },
  },
};

export default config;
