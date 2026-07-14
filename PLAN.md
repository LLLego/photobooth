# 📸 Photobooth — Complete Architecture & Implementation Plan

> Private photobooth web app for a couple. Built in one shot.
> Supabase backend. Vanilla JS + Vite + TailwindCSS. Canvas compositing. WebRTC dual-camera.
> Council-approved: GLM-5.2 (Design), Kimi k2.6 (Pragmatics), Qwen 3.7 Plus (UX), Qwen 3.7 Max (Data).

---

## 1. HOSTING & SERVICES (Final Decision)

| Service | Provider | Free Tier |
|---------|----------|-----------|
| **Auth** | Supabase Auth | Unlimited users |
| **Database** | Supabase PostgreSQL | 500MB |
| **File Storage** | Supabase Storage | 1GB |
| **Hosting** | Supabase Hosting | 2GB bandwidth/mo |
| **Repo** | GitHub | Public or private |
| **CI/CD** | GitHub Actions → Supabase | Free |

Supabase is the FINAL choice. One platform, no servers, instant cross-device sync.

---

## 2. ACCOUNT SYSTEM

### Roles

| Role | Access | How They Get It |
|------|--------|-----------------|
| **couple** | Everything — all photos, all sessions, all themes, invite friends, delete anything | Set manually in Supabase dashboard (only 2 users) |
| **friend** | Own photos only. Cannot see couple's private photos. Can take photos in dual mode if invited. | Sign up normally → auto-assigned `friend` role |

### Auth Flow
1. User visits site → sees login/signup page
2. Email + password (Supabase Auth)
3. On signup → auto-created in `profiles` table with `role='friend'`
4. Admin (you) promotes user + Ri to `role='couple'` in Supabase dashboard (one-time)
5. Session persisted via Supabase local storage

### Friend Experience
- Friend signs up → sees empty gallery (their own photos only)
- Can be invited to dual-camera sessions
- Photos they take in dual mode appear in their gallery
- Cannot browse, search, or view the couple's private gallery
- RLS enforces this at database level — zero code bypass

---

## 3. FRONTEND STACK

| Layer | Choice | Why |
|-------|--------|-----|
| **Framework** | None | Camera + Canvas + WebRTC are native DOM. Frameworks add latency. |
| **Build** | Vite | Module imports, Tailwind CSS processing, optimized production bundle |
| **CSS** | Tailwind CSS | Design velocity, consistent spacing, theme tokens |
| **JS** | Vanilla ES2022+ | `<script type="module">`, top-level `await`, native fetch |
| **Deps** | `@supabase/supabase-js` (CDN or npm) | Only runtime dependency |

**Bundle target**: <60KB gzipped. No node_modules bloat in production.

---

## 4. PHOTO STRIP ENGINE

### Pipeline

```
Camera Stream         Live Preview              Capture
     │                    │                        │
  getUserMedia      <video> + <img overlay>   OffscreenCanvas
     │               (CSS, 60fps, no CPU)     drawImage(video)
     │                    │                        │
     │                    │                   Apply frame overlay
     │                    │                        │
     │                    │                   Cache as ImageBitmap
     │                    │                        │
     │                    └────────────────────────┤
     │                                             │
     │                              ┌──────────────┘
     │                              │  × 4 captures
     │                              ▼
     │                       Strip Composer
     │                  Stack 4 bitmaps vertically
     │                   in 1200×4800px canvas
     │                              │
     │                         Add gutters (8px)
     │                         Add strip branding
     │                              │
     ▼                              ▼
  canvas.toBlob('image/webp')    canvas.toBlob('image/png')
     │                              │
  Upload to Storage              Download locally
```

### Capture Specs
- **Photo resolution**: 1200×1600px per slot (3:4 ratio)
- **Strip resolution**: 1200×4800px (4 photos stacked)
- **Format**: WebP (quality 0.85) for storage, PNG for download
- **Frame overlay**: Drawn via `ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height)` — frame PNG must be same dimensions as photo area
- **Gutters**: 8px between photos, 40px top/bottom padding for branding area

### Live Preview
- `<video>` element streaming camera
- Frame PNG positioned absolutely over `<video>` via CSS (`pointer-events: none`)
- ZERO canvas work during live preview — pure CSS
- Preview updates at native camera framerate (30-60fps)

### Layouts (all in v1.0)
1. **Strip 4** (default): 4 photos stacked vertically — 1200×4800px
2. **Grid 2×2**: 4 photos in a square grid — 2400×2400px
3. **Polaroid**: Single photo with wide border + caption — 1200×1600px
4. **Single**: One photo, no strip, just frame — 1200×1600px

---

## 5. THEME SYSTEM

### Directory Structure
```
public/themes/
├── hundred-acre-gang/
│   ├── manifest.json
│   ├── frame.webp          # Full frame overlay (transparent background)
│   ├── frame_grid.webp     # Grid layout frame (optional, falls back to frame.webp)
│   └── preview.png         # Theme selector thumbnail
├── pucca/
│   ├── manifest.json
│   ├── frame.webp
│   └── preview.png
├── hello-kitty/
│   ├── manifest.json
│   ├── frame.webp
│   └── preview.png
└── minimal/
    ├── manifest.json
    └── frame.webp
```

### Manifest Schema
```json
{
  "id": "hundred-acre-gang",
  "name": "Hundred Acre Gang",
  "version": "1.0",
  "palette": {
    "accent": "#FFB400",
    "background": "#FFF8E7",
    "text": "#4A3728",
    "stripBg": "#F5EDD6"
  },
  "fonts": {
    "branding": "'Georgia', serif"
  },
  "frame": {
    "url": "./frame.webp",
    "width": 1200,
    "height": 1600
  },
  "photoSlots": {
    "strip_4": [
      { "x": 0.08, "y": 0.03, "w": 0.84, "h": 0.20 },
      { "x": 0.08, "y": 0.26, "w": 0.84, "h": 0.20 },
      { "x": 0.08, "y": 0.49, "w": 0.84, "h": 0.20 },
      { "x": 0.08, "y": 0.72, "w": 0.84, "h": 0.20 }
    ],
    "grid_2x2": [
      { "x": 0.04, "y": 0.04, "w": 0.44, "h": 0.44 },
      { "x": 0.52, "y": 0.04, "w": 0.44, "h": 0.44 },
      { "x": 0.04, "y": 0.52, "w": 0.44, "h": 0.44 },
      { "x": 0.52, "y": 0.52, "w": 0.44, "h": 0.44 }
    ],
    "polaroid": [
      { "x": 0.10, "y": 0.10, "w": 0.80, "h": 0.65 }
    ],
    "single": [
      { "x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0 }
    ]
  },
  "branding": {
    "showOnStrip": true,
    "text": "our photobooth",
    "position": "bottom",
    "fontSize": 32,
    "color": "#4A3728"
  },
  "previewColor": "#F9F3E9"
}
```

### Coordinate System
- All `x`, `y`, `w`, `h` are **normalized floats 0.0–1.0**
- Engine multiplies by canvas pixel dimensions at render time
- Resolution-independent — same manifest works for any output size

### Theme Loading
- `fetch('/themes/{id}/manifest.json')` → cached in memory
- Frame PNG loaded via `new Image()` → cached in `Map<string, HTMLImageElement>`
- Service Worker caches all theme assets for offline use
- Theme switcher shows preview colors + names in a horizontal scroll

---

## 6. DUAL CAMERA (WebRTC)

### Flow
```
User (Host)                              Ri (Guest)
    │                                         │
    ├─ Tap "Dual Camera"                      │
    ├─ Create Supabase Realtime channel       │
    ├─ Generate room code (6-char)            │
    ├─ Show code + "Share with Ri"            │
    │                                         │
    │              Ri taps "Join"             │
    │              Enters room code ──────────┤
    │                                         │
    │         ←───[Realtime: join]────────    │
    │                                         │
    ├─ Create RTCPeerConnection               │
    ├─ createOffer → setLocalDescription      │
    ├─ [Realtime] offer SDP ────────────→     │
    │                                         ├─ setRemoteDescription
    │                                         ├─ createAnswer → setLocalDescription
    │         ←───[Realtime] answer SDP ──    │
    ├─ setRemoteDescription                   │
    │                                         │
    │         ←──→ ICE candidates [Realtime]  │
    │                                         │
    ├─ Connection established!                │
    │                                         │
    ├─ Dual preview: both feeds visible       │
    │  (Host sees Ri's stream via WebRTC)     │
    │                                         │
    ├─ Countdown sync [Realtime broadcast]    │
    │  3... 2... 1... CAPTURE                 │
    │                                         │
    ├─ Both capture simultaneously            ├─ Capture
    │                                         ├─ Upload photo to Storage
    │                                         │
    │  ←──[Realtime: "photo ready"]────       │
    │                                         │
    ├─ Download Ri's photo from Storage       │
    ├─ Composite both into strip              │
    ├─ Upload final strip to Storage          │
    │                                         │
    ├─ Show result ──[Realtime]─────────→     ├─ Show result
    │                                         │
    └─ Both save to gallery                   └─ Save to gallery
```

### Signaling
- **Channel**: Supabase Realtime Broadcast → `session:{session_id}`
- **Messages**: `{ type: 'offer'|'answer'|'ice-candidate'|'join'|'countdown'|'capture'|'photo-ready'|'result', payload: {...} }`
- **Room code**: 6-character alphanumeric, expires after 1 hour

### Compositing
- Host composites: downloads Guest's photo from Storage, draws both into strip
- Guest's photo goes in slots determined by session config (alternating or assigned)
- Frame overlay applied ONCE over the full strip

### Fallback: Async Mode
```
If WebRTC fails (NAT, firewall, browser incompatibility):
1. Both users see "Async Mode — taking photos separately"
2. Countdown still synced via Realtime
3. Both upload their 2 photos to Storage
4. Host polls until both sets arrive
5. Host composites → uploads final strip
6. Both notified via Realtime
```

### STUN/TURN
- **STUN**: Google's free STUN server (`stun:stun.l.google.com:19302`)
- **TURN**: None needed for most cases (P2P). If required, Supabase doesn't provide TURN — fall back to Async Mode.

---

## 7. DATABASE SCHEMA

### Full DDL

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE app_role AS ENUM ('couple', 'friend');
CREATE TYPE session_mode AS ENUM ('single', 'dual');
CREATE TYPE strip_layout AS ENUM ('strip_4', 'grid_2x2', 'polaroid', 'single');

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  role app_role NOT NULL DEFAULT 'friend',
  invited_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Themes (seeded by admin, read by all)
CREATE TABLE themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  manifest_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Photo sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES profiles(id),
  mode session_mode NOT NULL DEFAULT 'single',
  partner_id UUID REFERENCES profiles(id),
  theme_id UUID REFERENCES themes(id),
  layout strip_layout NOT NULL DEFAULT 'strip_4',
  room_code TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Individual photos (raw captures before compositing)
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 4),
  taken_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composited photo strips
CREATE TABLE photo_strips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  layout strip_layout NOT NULL DEFAULT 'strip_4',
  theme_id UUID REFERENCES themes(id),
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Favorites
CREATE TABLE favorites (
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  strip_id UUID NOT NULL REFERENCES photo_strips(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, strip_id)
);

-- Friend invitations (track who invited whom)
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invited_by UUID NOT NULL REFERENCES profiles(id),
  invited_email TEXT,
  room_code TEXT UNIQUE,
  accepted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_sessions_created_by ON sessions(created_by);
CREATE INDEX idx_sessions_partner ON sessions(partner_id);
CREATE INDEX idx_sessions_room_code ON sessions(room_code) WHERE room_code IS NOT NULL;
CREATE INDEX idx_photos_session ON photos(session_id);
CREATE INDEX idx_photo_strips_session ON photo_strips(session_id);
CREATE INDEX idx_photo_strips_created ON photo_strips(created_at DESC);
CREATE INDEX idx_favorites_profile ON favorites(profile_id);
```

### Row-Level Security Policies

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_strips ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;

-- THEMES: readable by all authenticated users
CREATE POLICY themes_read_all ON themes FOR SELECT TO authenticated USING (true);

-- PROFILES: users can read all profiles (needed to show names), update own
CREATE POLICY profiles_read_all ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update_own ON profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- SESSIONS: couple sees all, friends see own + sessions they're partner in
CREATE POLICY sessions_couple_all ON sessions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'couple'));

CREATE POLICY sessions_friend_own ON sessions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'friend')
    AND (created_by = auth.uid() OR partner_id = auth.uid())
  );

-- PHOTOS: couple sees all, friends see photos from their sessions only
CREATE POLICY photos_couple_all ON photos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'couple'));

CREATE POLICY photos_friend_own ON photos FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'friend')
    AND session_id IN (SELECT id FROM sessions WHERE created_by = auth.uid() OR partner_id = auth.uid())
  );

-- PHOTO_STRIPS: couple sees all (including private), friends see non-private strips from their sessions
CREATE POLICY strips_couple_all ON photo_strips FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'couple'));

CREATE POLICY strips_friend_own ON photo_strips FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'friend')
    AND is_private = false
    AND session_id IN (SELECT id FROM sessions WHERE created_by = auth.uid() OR partner_id = auth.uid())
  );

-- FAVORITES: users manage their own favorites
CREATE POLICY favorites_own ON favorites FOR ALL TO authenticated
  USING (profile_id = auth.uid());
```

### Storage Buckets

```
Bucket: photos       → Raw captured photos (private)
Bucket: strips       → Composited photo strips (private)
Bucket: themes       → Theme frame assets (public, cached)
```

**Storage RLS**: Photos and strips buckets are private. Access via Supabase signed URLs with 1-hour expiry. Theme bucket is public with `Cache-Control: public, max-age=31536000`.

---

## 8. APP SCREENS & FLOWS

### Screen Map

```
┌─────────────┐
│   Landing    │ → Login / Sign Up
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    Home      │
│ ┌─────────┐ │
│ │ Single   │ │ → Single Camera Flow
│ │ Camera   │ │
│ ├─────────┤ │
│ │ Dual     │ │ → Dual Camera Flow
│ │ Camera   │ │
│ ├─────────┤ │
│ │ Gallery  │ │ → Browse, filter, view, delete, download
│ └─────────┘ │
│  Settings    │ → Profile, theme prefs
└─────────────┘
```

### Single Camera Flow
```
Home → Tap "Single Camera"
  → Theme Picker (horizontal scroll, tap to select, live preview updates CSS)
  → Layout Picker (strip_4, grid_2x2, polaroid, single)
  → Camera View (video + frame overlay, flash button, capture button)
  → Countdown: 3... 2... 1... FLASH (screen goes white 200ms)
  → Captured! Photo appears in thumbnail strip
  → Repeat × 4 (or fewer if layout = polaroid/single)
  → Review Screen (tap to retake individual, swipe to reorder)
  → "Done" → Strip Preview (full composited strip, frame applied)
  → "Save" → Upload to Supabase → Gallery
  → "Download" → Save as PNG to device
  → "Share" → Web Share API (mobile) or copy link
```

### Dual Camera Flow
```
Home → Tap "Dual Camera"
  → "Start a Room" or "Join a Room"
  
  START:
  → Room code displayed (e.g., "AX7K2M")
  → "Share with Ri" button → copy link/WhatsApp
  → Waiting screen (animated dots, "Waiting for Ri...")
  
  JOIN:
  → Enter room code input (6 chars, auto-uppercase)
  → Connecting screen
  → Dual Preview (both camera feeds + frame overlay)
  
  BOTH:
  → Countdown synced via Realtime: 3... 2... 1...
  → Both capture simultaneously
  → Host composites → "Here's your photo together!"
  → Both see result → Save to gallery
```

### Gallery
```
Grid view (3 columns)
├── Sort: Newest first
├── Filter: All / By Theme / By Mode (Single/Dual) / Favorites
├── Each strip: thumbnail preview, date, theme name
│   └── Tap → Full viewer
│       ├── Zoom (pinch)
│       ├── Download (PNG)
│       ├── Delete (with confirmation)
│       ├── Favorite (❤️ toggle)
│       └── Share
└── Empty state: "No photos yet. Take your first one!"
```

### Settings
```
Settings
├── Display name
├── Account type: "Couple" or "Friend" (read-only)
├── Auto-download after capture: toggle
├── Countdown duration: 3s / 5s / Off
└── Sign Out
```

---

## 9. DESIGN LANGUAGE

### "Digital Intimacy" — GLM-5.2

| Token | Value | Usage |
|-------|-------|-------|
| **Background** | `#FFFAF0` (floral white) | Page background |
| **Primary** | `#2D1B11` (deep warm brown) | Text, icons |
| **Accent** | `#D4956A` (warm terracotta) | Buttons, active states |
| **Honey** | `#FFB400` | Capture button, highlights |
| **Success** | `#6B8F71` (sage green) | Captured indicator |
| **Error** | `#C44D4D` | Delete confirmations |
| **Surface** | `#FFFFFF` with slight warmth | Cards, gallery items |
| **Muted** | `#A3968A` | Secondary text, timestamps |

### Typography
| Token | Font | Usage |
|-------|------|-------|
| **Display** | `'Georgia', serif` | Headings, branding, strip labels |
| **Body** | `system-ui, -apple-system, sans-serif` | UI text, buttons, gallery info |
| **Mono** | `'Courier New', monospace` | Room codes, technical info |

### Spacing
- Base unit: 8px
- Page padding: 24px
- Card gaps: 16px (gallery grid)
- Section spacing: 48px

### Motion
- **Transitions**: 300ms ease-out
- **Buttons**: scale(0.97) on press, 150ms
- **Page transitions**: fade 200ms
- **Countdown**: scale pulse 1.0 → 0.9 → 1.0, 300ms per number
- **Flash effect**: white overlay, 200ms fade to 0
- **Strip assembly**: sequential slide-in, 100ms stagger
- **Gallery load**: staggered fade-up, 80ms per item

### Dark Mode
- Auto-detected via `prefers-color-scheme`
- Manual toggle in settings
- Dark palette: `#1A1512` background, `#F5EDD6` text, warm tones preserved

### Anti-Patterns
- ❌ NO Inter/Roboto fonts
- ❌ NO blue/purple color schemes
- ❌ NO shadcn-style cards
- ❌ NO generic gradients
- ❌ NO bounce animations
- ❌ NO cold/minimal SaaS aesthetic

---

## 10. SECURITY

### Authentication
- Supabase Auth with email + password
- Session stored in localStorage by Supabase SDK
- Auto-refresh tokens handled by SDK
- Max session: 7 days

### Data Access
- All tables have RLS enabled
- Couple role = full access to everything
- Friend role = own data only
- RLS is enforced at PostgreSQL level — cannot be bypassed in client code

### Storage Security
- `photos` bucket: Private. Access via Supabase signed URLs only.
- `strips` bucket: Private. Signed URLs.
- `themes` bucket: Public read. Immutable assets.
- Signed URL expiry: 1 hour for gallery, 5 minutes for dual-camera exchange

### Client-Side
- **CSP**: `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; media-src 'self' blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' blob: data: https://*.supabase.co; style-src 'self' 'unsafe-inline'`
- **EXIF stripping**: On capture, canvas redraw strips all metadata. No GPS/device info in uploaded photos.
- **No sensitive data in localStorage**: Only Supabase session token (managed by SDK).
- **Room codes**: 6-char alphanumeric, single-use, expire after 1 hour.

### Privacy
- Delete is real delete: `ON DELETE CASCADE` removes photos + strips from DB and Storage
- Export: Download any strip as PNG anytime
- All EXIF data stripped by canvas pipeline

---

## 11. FILE STRUCTURE

```
photobooth/
├── index.html                    # Entry point, app shell
├── vite.config.js                # Vite config
├── tailwind.config.js            # Tailwind with custom theme tokens
├── postcss.config.js             # PostCSS for Tailwind
├── package.json                  # Dependencies: @supabase/supabase-js, vite, tailwindcss
├── .env.example                  # SUPABASE_URL, SUPABASE_ANON_KEY
│
├── src/
│   ├── main.js                   # App entry: init Supabase, router, mount UI
│   ├── state.js                  # Global state management (singleton)
│   ├── router.js                 # Simple hash-based router
│   │
│   ├── auth/
│   │   ├── auth.js               # Supabase auth: signup, login, logout, session
│   │   └── auth-ui.js            # Login/signup form UI
│   │
│   ├── camera/
│   │   ├── camera.js             # getUserMedia, start/stop camera, switch cameras
│   │   ├── capture.js            # Canvas capture, frame overlay, photo caching
│   │   └── preview.js            # Live preview with CSS frame overlay
│   │
│   ├── strips/
│   │   ├── compositor.js         # Strip assembly: 4-up, grid, polaroid, single
│   │   ├── layouts.js            # Layout definitions (coordinates for each format)
│   │   └── export.js             # toBlob export, download trigger
│   │
│   ├── webrtc/
│   │   ├── webrtc.js             # WebRTC connection, offer/answer, ICE
│   │   ├── signaling.js          # Supabase Realtime signaling channel
│   │   └── dual-session.js       # Dual-camera session orchestration
│   │
│   ├── gallery/
│   │   ├── gallery.js            # Fetch strips from Supabase, paginate, filter
│   │   ├── gallery-ui.js         # Grid view, filter bar, empty state
│   │   └── viewer.js             # Full strip viewer, zoom, actions
│   │
│   ├── themes/
│   │   ├── theme-loader.js       # Fetch manifest + frame PNG, cache
│   │   ├── theme-picker.js       # Theme picker UI (horizontal scroll)
│   │   └── theme-defaults.js     # Built-in fallback theme
│   │
│   ├── db/
│   │   ├── supabase.js           # Supabase client init
│   │   ├── sessions.js           # Session CRUD
│   │   ├── photos.js             # Photo upload + query
│   │   ├── strips.js             # Strip upload + query
│   │   └── favorites.js          # Favorites toggle + query
│   │
│   ├── ui/
│   │   ├── components.js         # Reusable UI components (button, modal, toast)
│   │   ├── countdown.js          # Countdown overlay (3-2-1 + flash)
│   │   ├── navigation.js         # Bottom nav / tab bar
│   │   └── settings.js           # Settings panel
│   │
│   └── utils/
│       ├── exif.js               # EXIF stripping (no-op via canvas, but explicit)
│       ├── storage.js            # LocalStorage helpers (non-sensitive only)
│       └── sw.js                 # Service Worker registration
│
├── public/
│   ├── favicon.svg
│   ├── manifest.json             # PWA manifest
│   ├── sw.js                     # Service Worker for theme caching
│   ├── icons/                    # PWA icons
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   └── themes/
│       ├── hundred-acre-gang/
│       │   ├── manifest.json
│       │   ├── frame.webp
│       │   ├── frame_grid.webp
│       │   └── preview.png
│       ├── pucca/
│       │   ├── manifest.json
│       │   ├── frame.webp
│       │   └── preview.png
│       ├── hello-kitty/
│       │   ├── manifest.json
│       │   ├── frame.webp
│       │   └── preview.png
│       └── minimal/
│           ├── manifest.json
│           └── frame.webp
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  # Full DDL + RLS + seed data
│
├── .github/
│   └── workflows/
│       └── deploy.yml              # Build + deploy to Supabase
│
├── CLAUDE.md                       # For Claude Code context
└── PLAN.md                         # This document
```

---

## 12. DEPLOY FLOW

### GitHub Actions (`.github/workflows/deploy.yml`)
```yaml
name: Deploy to Supabase
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
      - run: supabase db push
      - run: supabase hosting deploy dist/
```

### Supabase Hosting
- Serves the `dist/` folder as static site
- Custom domain optional (subdomain.supabase.co by default)
- Auto-deploys on `git push main`

---

## 13. FREE TIER CAPACITY

| Resource | Limit | Estimated Usage | Headroom |
|----------|-------|-----------------|----------|
| Database | 500MB | ~2MB (schema + metadata) | ✅ Huge |
| Storage | 1GB | ~2,500 strips at 400KB WebP each | ✅ Years of photos |
| Bandwidth | 2GB/mo | ~5,000 strip views at 400KB each | ✅ Fine for 2 people + friends |
| Auth users | Unlimited | ~2 couple + ~20 friends | ✅ Unlimited |
| Realtime | 200 concurrent | ~2-4 during dual sessions | ✅ Massive headroom |

**First ceiling**: Storage at ~2,500 strips. Mitigation: WebP compression (400KB/strip), optional cleanup of old photos. Upgrade to Pro ($25/mo) at 10GB if needed — years away.

---

## 14. FRAME ASSETS (What You Need to Provide)

For each theme, you need:
- **frame.webp**: A 1200×1600px transparent WebP image. Characters positioned around the edges (corners, sides) so the CENTER area stays clear for the photo. Think of it like a picture frame with characters peeking in from the edges.

Example layout for Hundred Acre Gang:
```
┌──────────────────────────────┐
│ 🐻 Pooh (TL)    🐷 Piglet (TR) │
│                                │
│       PHOTO AREA               │
│       (center stays            │
│        transparent)            │
│                                │
│ 🐯 Tigger (BL)   🐴 Eeyore (BR)│
│     "Hundred Acre Gang"        │
└──────────────────────────────┘
```

- **preview.png**: Small thumbnail (200×200px) for the theme picker
- **frame_grid.webp**: Optional. Same but adjusted for grid layout (square aspect)

You can create these in any image editor (Photoshop, Figma, Canva). Save as WebP with transparency. Place the files in `public/themes/{theme-name}/`.

---

## 15. CLAUDE CODE BUILD INSTRUCTIONS

When building, Claude Code (M3) reads this PLAN.md and builds every file. The build order:

1. **Scaffold**: `package.json`, `vite.config.js`, `tailwind.config.js`
2. **Core**: `supabase.js`, `state.js`, `router.js`
3. **Auth**: `auth.js`, `auth-ui.js`
4. **Camera**: `camera.js`, `capture.js`, `preview.js`
5. **Strips**: `compositor.js`, `layouts.js`, `export.js`
6. **WebRTC**: `webrtc.js`, `signaling.js`, `dual-session.js`
7. **Gallery**: `gallery.js`, `gallery-ui.js`, `viewer.js`
8. **Themes**: `theme-loader.js`, `theme-picker.js`
9. **UI**: `components.js`, `countdown.js`, `navigation.js`, `settings.js`
10. **App Shell**: `index.html`, `main.js`
11. **Database**: migration SQL
12. **Deploy**: workflow YAML

**NO build step in development** — Vite dev server handles everything. `npm run build` produces `dist/` for deployment.

---

## 16. SUPABASE SETUP (You Do This Once)

1. Go to [supabase.com](https://supabase.com) → Create account
2. Create new project → name it `photobooth`
3. Go to Project Settings → API → copy:
   - `Project URL` → put in `.env` as `VITE_SUPABASE_URL`
   - `anon public key` → put in `.env` as `VITE_SUPABASE_ANON_KEY`
4. Go to SQL Editor → paste `supabase/migrations/001_initial_schema.sql` → Run
5. Go to Authentication → Settings → enable Email/Password provider
6. Go to Storage → create buckets: `photos`, `strips`, `themes`
7. For `themes` bucket: make it public
8. Upload theme frames to `themes/` bucket (or they live in the repo's `public/themes/` and deploy with hosting)
9. Go to Project Settings → Access Tokens → create `service_role` token → add to GitHub Secrets as `SUPABASE_SERVICE_ROLE_KEY`
