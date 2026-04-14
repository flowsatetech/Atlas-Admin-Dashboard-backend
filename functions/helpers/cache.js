const cacheStore = new Map();

function buildCacheKey(prefix, payload = {}) {
    return `${prefix}:${JSON.stringify(payload)}`;
}

function getCached(key) {
    const hit = cacheStore.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
        cacheStore.delete(key);
        return null;
    }
    return hit.value;
}

function setCached(key, value, ttlMs = 30_000) {
    cacheStore.set(key, {
        value,
        expiresAt: Date.now() + ttlMs
    });
}

function clearByPrefix(prefix) {
    for (const key of cacheStore.keys()) {
        if (key.startsWith(prefix)) cacheStore.delete(key);
    }
}

module.exports = {
    buildCacheKey,
    getCached,
    setCached,
    clearByPrefix
};
