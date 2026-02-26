const cache = new Map<string, HTMLAudioElement>();

export function playSound(name: string): void {
  const url = `aerocord-asset:///sounds/${name}`;
  let audio = cache.get(name);
  if (audio) {
    audio.currentTime = 0;
  } else {
    audio = new Audio(url);
    cache.set(name, audio);
  }
  audio.play().catch(() => {});
}
