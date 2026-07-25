import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      // 1. On lui dit que la vraie porte de sortie pour le Brain c'est src/index.ts
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MsStats',
      fileName: 'ms-stats',
      formats: ['es'], // Génère un module ESM propre avec des "export"
    },
    rollupOptions: {
      // Évite d'embarquer les styles globaux ou dépendances lourdes dans le JS si tu veux les séparer
      external: [],
    },
  },
});
