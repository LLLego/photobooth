# Photobooth — Claude Code Build Context

## What This Is
A private photobooth web app for a couple (user + Ri). Build EVERYTHING in one pass.

## Architecture
- **Stack**: Vite + Vanilla JS + TailwindCSS. NO React/Vue/Svelte.
- **Backend**: Supabase (Auth + PostgreSQL + Storage + Hosting)
- **Camera**: getUserMedia → Canvas compositing
- **Dual Camera**: WebRTC + Supabase Realtime signaling
- **Photo Strips**: 4-photo vertical strip (primary) + grid_2x2, polaroid, single layouts
- **Themes**: Transparent PNG/WebP frame overlays (Hundred Acre Gang, Pucca, Hello Kitty, minimal)
- **Accounts**: couple (full access) + friend (own photos only) — RLS-enforced

## Design System
- Primary: #2D1B11 (warm brown), BG: #FFFAF0 (cream), Accent: #D4956A (terracotta), Honey: #FFB400
- Fonts: Georgia for display, system-ui for body
- Motion: 300ms ease-out, no bounce, spring physics for countdown
- Anti: NO Inter/Roboto, NO blue/purple, NO shadcn cards, NO generic gradients

## Key Files to Build
Read PLAN.md for the complete spec. Build ALL files in src/:
- src/main.js, state.js, router.js
- src/auth/auth.js, auth-ui.js
- src/camera/camera.js, capture.js, preview.js
- src/strips/compositor.js, layouts.js, export.js
- src/webrtc/webrtc.js, signaling.js, dual-session.js
- src/gallery/gallery.js, gallery-ui.js, viewer.js
- src/themes/theme-loader.js, theme-picker.js, theme-defaults.js
- src/db/supabase.js, sessions.js, photos.js, strips.js, favorites.js
- src/ui/components.js, countdown.js, navigation.js, settings.js
- src/utils/exif.js, storage.js, sw.js
- src/styles/main.css (Tailwind imports + custom styles)

## Build Rules
- Use ES2022+ modules (import/export)
- Supabase client from '@supabase/supabase-js'
- Vite handles env vars (import.meta.env.VITE_SUPABASE_URL)
- Canvas operations for all photo work
- All UI components are DOM-focused functions, not virtual DOM
- RLS policies are server-side; client code can attempt queries and handle errors gracefully
