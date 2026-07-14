export const LAYOUTS = {
  strip_4: {
    id: 'strip_4',
    label: 'Strip',
    width: 1200,
    height: 4800,
    slots: [
      { x: 0, y: 0, w: 1, h: 0.25 },
      { x: 0, y: 0.25, w: 1, h: 0.25 },
      { x: 0, y: 0.50, w: 1, h: 0.25 },
      { x: 0, y: 0.75, w: 1, h: 0.25 },
    ],
    requires: 4,
  },
  grid_2x2: {
    id: 'grid_2x2',
    label: 'Grid',
    width: 2400,
    height: 2400,
    slots: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
    requires: 4,
  },
  polaroid: {
    id: 'polaroid',
    label: 'Polaroid',
    width: 1200,
    height: 1600,
    slots: [{ x: 0.08, y: 0.08, w: 0.84, h: 0.7 }],
    requires: 1,
  },
  single: {
    id: 'single',
    label: 'Single',
    width: 1200,
    height: 1600,
    slots: [{ x: 0, y: 0, w: 1, h: 1 }],
    requires: 1,
  },
};

export function getLayout(id) {
  return LAYOUTS[id] || LAYOUTS.strip_4;
}

export function listLayouts() {
  return Object.values(LAYOUTS);
}

export function requiredPhotoCount(id) {
  return (getLayout(id)).requires;
}
