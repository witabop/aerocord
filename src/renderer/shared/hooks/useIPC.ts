import { useEffect, useRef } from 'react';

export function useIPCEvent(channel: string, handler: (...args: unknown[]) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const cleanup = window.aerocord.on(channel, (...args) => {
      handlerRef.current(...args);
    });
    return cleanup;
  }, [channel]);
}
