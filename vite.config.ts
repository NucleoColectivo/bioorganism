import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'copy-bitacora',
        closeBundle() {
          const source = path.resolve(__dirname, 'bitacora/index.html');
          const targetDir = path.resolve(__dirname, 'dist/bitacora');
          const target = path.join(targetDir, 'index.html');
          if (fs.existsSync(source)) {
            fs.mkdirSync(targetDir, {recursive: true});
            fs.copyFileSync(source, target);
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
