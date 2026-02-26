export function assetUrl(...segments: string[]): string {
  return `aerocord-asset:///${segments.join('/')}`;
}
