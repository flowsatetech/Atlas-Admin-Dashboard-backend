'use strict';

/**
 * In-memory Redis adapter for the staging environment.
 * Implements the exact subset of the node-redis v4 API that this codebase
 * uses, so no real Redis server is required when running.
 *
 * Operations covered:
 *   set / get / del / exists         — general key-value with optional TTL
 *   eval                             — re-implements VERIFY_AND_CONSUME_LUA
 *                                      from functions/helpers/blog-tracking.js
 *   sendCommand                      — subset used by rate-limit-redis
 *                                      (in staging the rate limiter uses the
 *                                       in-memory store, so this is a safety net)
 *   on / connect                     — no-ops for API compatibility
 */

class InMemoryRedis {
  constructor() {
    /** @type {Map<string, { value: string, expiresAt: number|null }>} */
    this._store = new Map();
  }

  /** Returns the live entry or null (deletes expired entries on access). */
  _getEntry(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return null;
    }
    return entry;
  }

  /** node-redis v4: set(key, value, { PX, EX, NX }) */
  async set(key, value, opts = {}) {
    if (opts.NX && this._getEntry(key) !== null) return null;
    const expiresAt =
      opts.PX != null ? Date.now() + Number(opts.PX) :
      opts.EX != null ? Date.now() + Number(opts.EX) * 1000 :
      null;
    this._store.set(key, { value: String(value), expiresAt });
    return 'OK';
  }

  async get(key) {
    const entry = this._getEntry(key);
    return entry ? entry.value : null;
  }

  async del(...keys) {
    let count = 0;
    for (const key of keys.flat()) {
      if (this._store.delete(key)) count++;
    }
    return count;
  }

  async exists(...keys) {
    let count = 0;
    for (const key of keys.flat()) {
      if (this._getEntry(key) !== null) count++;
    }
    return count;
  }

  /**
   * Implements the VERIFY_AND_CONSUME_LUA script from blog-tracking.js.
   * The script atomically:
   *   1. Returns 0 if the nonce key already exists (replay protection).
   *   2. Returns 0 if the active token key is missing or mismatched.
   *   3. DELs the active token key, SETs the nonce key with EX + NX, returns 1.
   *
   * keys[0]      = activeTokenKey
   * keys[1]      = nonceKey
   * arguments[0] = presentedToken
   * arguments[1] = nonceTtlSeconds
   */
  async eval(_script, { keys = [], arguments: args = [] } = {}) {
    const [activeKey, nonceKey] = keys;
    const [presentedToken, nonceTtlSeconds] = args;

    if (await this.exists(nonceKey)) return 0;
    const activeToken = await this.get(activeKey);
    if (!activeToken) return 0;
    if (activeToken !== presentedToken) return 0;

    await this.del(activeKey);
    await this.set(nonceKey, '1', { EX: Number(nonceTtlSeconds), NX: true });
    return 1;
  }

  /**
   * Generic command interface used by rate-limit-redis RedisStore.
   * In staging the rate limiter falls back to in-memory store so this
   * is never called in normal operation, but is here as a safety net.
   */
  async sendCommand(args) {
    const [cmd, ...rest] = (args || []).map(String);
    switch ((cmd || '').toUpperCase()) {
      case 'SET': {
        const [k, v, ...flags] = rest;
        const opts = {};
        for (let i = 0; i < flags.length; i++) {
          if (flags[i].toUpperCase() === 'PX') opts.PX = Number(flags[++i]);
          else if (flags[i].toUpperCase() === 'EX') opts.EX = Number(flags[++i]);
          else if (flags[i].toUpperCase() === 'NX') opts.NX = true;
        }
        return this.set(k, v, opts);
      }
      case 'GET':
        return this.get(rest[0]);
      case 'DEL':
        return this.del(rest);
      case 'INCR': {
        const cur = Number((await this.get(rest[0])) ?? 0) + 1;
        await this.set(rest[0], String(cur));
        return cur;
      }
      case 'PEXPIRE': {
        const entry = this._store.get(rest[0]);
        if (entry) { entry.expiresAt = Date.now() + Number(rest[1]); return 1; }
        return 0;
      }
      case 'PTTL': {
        const entry = this._getEntry(rest[0]);
        if (!entry) return -2;
        if (entry.expiresAt === null) return -1;
        return Math.max(0, entry.expiresAt - Date.now());
      }
      default:
        throw new Error(`StagingRedis: unsupported command "${cmd}"`);
    }
  }

  // eslint-disable-next-line no-unused-vars
  on(_event, _handler) { return this; }
  async connect() { return this; }
}

module.exports = new InMemoryRedis();
