import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths, so the same build works on GitHub Pages (/walkthru/) and inside the phone apps.
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1200 },
  test: { environment: 'node' },
});
