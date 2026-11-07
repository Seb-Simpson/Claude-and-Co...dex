import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    // Rapier is async-loaded; these chunks also keep initial UI loading small.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          rapier: ['@dimforge/rapier3d-compat'],
        },
      },
    },
  },
});
