type Entry<T> = {
  expiresAt: number;
  value: T;
};

const memoryCache = new Map<string, Entry<unknown>>();

export async function withCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const value = await loader();
  memoryCache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}
