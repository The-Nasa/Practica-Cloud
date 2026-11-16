/**
 * Polyfill for crypto.randomUUID in non-secure contexts (e.g. plain HTTP on public IP).
 * Browsers only expose window.crypto.randomUUID in Secure Contexts (HTTPS / localhost).
 */
if (typeof window !== 'undefined') {
  const g = window as any;
  if (!g.crypto) {
    g.crypto = {};
  }
  if (!g.crypto.randomUUID) {
    g.crypto.randomUUID = function (): `${string}-${string}-${string}-${string}-${string}` {
      if (typeof g.crypto.getRandomValues === 'function') {
        return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: any) =>
          (+c ^ g.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4))).toString(16)
        ) as `${string}-${string}-${string}-${string}-${string}`;
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c: string) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }) as `${string}-${string}-${string}-${string}-${string}`;
    };
  }
}

export function safeRandomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fallback
    }
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: any) =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4))).toString(16)
    );
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c: string) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
