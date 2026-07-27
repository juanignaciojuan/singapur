// In-memory cache for lightweight API response reuse.
// This exists to reduce repeated requests to shared upstream services.
class MemoryCache {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const cached = this.store.get(key);
    if (!cached) {
      return null;
    }

    if (Date.now() > cached.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return cached.value;
  }

  set(key, value, ttlMs) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });

    return value;
  }

  getOrSet(key, ttlMs, producer) {
    const existing = this.get(key);
    if (existing !== null) {
      return Promise.resolve(existing);
    }

    return Promise.resolve(producer()).then((value) => this.set(key, value, ttlMs));
  }

  clear() {
    this.store.clear();
  }
}

module.exports = new MemoryCache();

/*
Explanation:
- Responsibility: Provide a tiny TTL cache shared by backend services.
- Data flow: Route/service asks cache first, fetches source only on misses.
- Dependencies: Native Map only, no external package.

Beginner check-in questions:
- Why is caching important for real-time APIs?
- What happens to response time and rate limits if every client triggers a full upstream call?
*/
