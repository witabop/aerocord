export function computeTextColors(hex: string): { textColor: string; shadowColor: string } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const isLight = r * 0.299 + g * 0.587 + b * 0.114 > 140;
  return {
    textColor: isLight ? '#1a1a1a' : '#ffffff',
    shadowColor: isLight ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)',
  };
}
