const cache = new Map<string, HTMLAudioElement>();
const loopCache = new Map<string, HTMLAudioElement>();

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

export function playSoundLoop(name: string): void {
  stopSoundLoop(name);
  const url = `aerocord-asset:///sounds/${name}`;
  const audio = new Audio(url);
  audio.loop = true;
  loopCache.set(name, audio);
  audio.play().catch(() => {});
}

export function stopSoundLoop(name: string): void {
  const audio = loopCache.get(name);
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    loopCache.delete(name);
  }
}
