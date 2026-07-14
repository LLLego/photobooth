// Photo filter presets — CSS filter strings for live preview + canvas capture
// Based on Instagram.css patterns and webcam effects research

export const FILTER_PRESETS = [
  {
    id: 'original',
    name: 'Original',
    css: 'none',
    description: 'No filter',
  },
  {
    id: 'warm',
    name: 'Warm',
    css: 'sepia(30%) saturate(130%) brightness(105%)',
    description: 'Warm golden tones',
  },
  {
    id: 'cool',
    name: 'Cool',
    css: 'hue-rotate(-15deg) saturate(120%) brightness(105%)',
    description: 'Cool blue tones',
  },
  {
    id: 'bw',
    name: 'B&W',
    css: 'grayscale(100%) contrast(120%)',
    description: 'Classic black & white',
  },
  {
    id: 'vintage',
    name: 'Vintage',
    css: 'sepia(50%) contrast(90%) brightness(90%) saturate(80%)',
    description: 'Faded film look',
  },
  {
    id: 'vivid',
    name: 'Vivid',
    css: 'saturate(180%) contrast(110%) brightness(110%)',
    description: 'Bold vibrant colors',
  },
];

export const DEFAULT_FILTER = 'original';

export function getFilterById(id) {
  return FILTER_PRESETS.find((f) => f.id === id) || FILTER_PRESETS[0];
}

export function getFilterCSS(id) {
  const filter = getFilterById(id);
  return filter ? filter.css : 'none';
}

export function isFilterActive(id) {
  return id && id !== 'original' && id !== 'none';
}
