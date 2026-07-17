import { defineConfig, loadEnv } from 'vite';

// Fail fast in CI if required env vars are missing — without this,
// the build silently ships a broken app and only fails at runtime
// when the user hits the first Supabase call.
function assertEnv(env, keys) {
  const missing = keys.filter((k) => !env[k] || env[k].trim() === '');
  if (missing.length) {
    const hints = [];
    if (missing.includes('VITE_SUPABASE_URL')) {
      hints.push('\n  → Set VITE_SUPABASE_URL in your .env file or CI secrets.');
      hints.push('  → Run `supabase status` locally or grab values from your project dashboard.');
    }
    if (missing.includes('VITE_SUPABASE_ANON_KEY')) {
      hints.push('\n  → Set VITE_SUPABASE_ANON_KEY (the publishable/anon key from your Supabase project API settings).');
    }
    throw new Error(
      `[vite.config] Missing required env var(s): ${missing.join(', ')}.${hints.join('')}`
    );
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Only enforce at build time — dev can boot with a placeholder so the
  // UI is still navigable while you wire up Supabase.
  if (mode === 'production' || process.env.CI) {
    assertEnv(env, ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);
  }
  return {
    base: '/photobooth/',
    root: '.',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      minify: 'esbuild',
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks: undefined
        }
      }
    },
    server: {
      port: 3000,
      open: true
    },
    define: {
      __VITE_SUPABASE_URL_PRESENT__: JSON.stringify(Boolean(env.VITE_SUPABASE_URL)),
      __VITE_SUPABASE_ANON_KEY_PRESENT__: JSON.stringify(Boolean(env.VITE_SUPABASE_ANON_KEY))
    }
  };
});
