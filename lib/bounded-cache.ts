// TTLs alone leave expired keys resident. Bound caches whose keys come from public requests.
export class BoundedCache<K, V> extends Map<K, V> {
  constructor(private readonly limit: number) {
    super();
    if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid cache limit.");
  }

  override set(key: K, value: V): this {
    this.delete(key);
    if (this.size >= this.limit) this.delete(this.keys().next().value!);
    return super.set(key, value);
  }
}
