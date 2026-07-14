export const FALLBACK_THEME = {
  id: 'minimal',
  name: 'Minimal',
  version: '1.0',
  palette: {
    accent: '#2D1B11',
    background: '#FFFFFF',
    text: '#2D1B11',
    stripBg: '#FAFAFA',
  },
  fonts: { branding: "'Georgia', serif" },
  frame: { url: null, width: 1200, height: 1600 },
  photoSlots: {
    strip_4: [
      { x: 0.04, y: 0.02, w: 0.92, h: 0.22 },
      { x: 0.04, y: 0.26, w: 0.92, h: 0.22 },
      { x: 0.04, y: 0.50, w: 0.92, h: 0.22 },
      { x: 0.04, y: 0.74, w: 0.92, h: 0.22 },
    ],
    grid_2x2: [
      { x: 0.03, y: 0.03, w: 0.45, h: 0.45 },
      { x: 0.52, y: 0.03, w: 0.45, h: 0.45 },
      { x: 0.03, y: 0.52, w: 0.45, h: 0.45 },
      { x: 0.52, y: 0.52, w: 0.45, h: 0.45 },
    ],
    polaroid: [{ x: 0.08, y: 0.08, w: 0.84, h: 0.68 }],
    single: [{ x: 0.0, y: 0.0, w: 1.0, h: 1.0 }],
  },
  branding: { showOnStrip: false, text: '', position: 'bottom', fontSize: 24, color: '#2D1B11' },
  previewColor: '#F5F5F5',
};

export const DEFAULT_THEME_ID = 'minimal';

export const NO_FRAME_THEME = {
  id: 'none',
  name: 'No frame',
  version: '1.0',
  palette: { accent: '#2D1B11', background: '#FFFFFF', text: '#2D1B11', stripBg: '#FFFFFF' },
  fonts: { branding: "'Georgia', serif" },
  frame: { url: null, width: 1200, height: 1600 },
  photoSlots: {
    strip_4: [
      { x: 0.04, y: 0.04, w: 0.92, h: 0.20 },
      { x: 0.04, y: 0.28, w: 0.92, h: 0.20 },
      { x: 0.04, y: 0.52, w: 0.92, h: 0.20 },
      { x: 0.04, y: 0.76, w: 0.92, h: 0.20 },
    ],
    grid_2x2: [
      { x: 0.04, y: 0.04, w: 0.44, h: 0.44 },
      { x: 0.52, y: 0.04, w: 0.44, h: 0.44 },
      { x: 0.04, y: 0.52, w: 0.44, h: 0.44 },
      { x: 0.52, y: 0.52, w: 0.44, h: 0.44 },
    ],
    polaroid: [{ x: 0.10, y: 0.10, w: 0.80, h: 0.65 }],
    single: [{ x: 0.0, y: 0.0, w: 1.0, h: 1.0 }],
  },
  branding: { showOnStrip: false, text: '', position: 'bottom', fontSize: 0, color: '#000000' },
  previewColor: '#FFFFFF',
};
