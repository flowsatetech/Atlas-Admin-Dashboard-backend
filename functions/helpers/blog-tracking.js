const crypto = require('crypto');
const redisClient = require('../middlewares/utils/redis_client');

const TOKEN_TTL_MS = Number(process.env.BLOG_TRACKING_TOKEN_TTL_MS || 2 * 60 * 1000);
const NONCE_TTL_MS = TOKEN_TTL_MS + 30 * 1000;
const KEY_PREFIX = 'blog:tracking';

const VERIFY_AND_CONSUME_LUA = `
local activeKey = KEYS[1]
local nonceKey = KEYS[2]
local presentedToken = ARGV[1]
local nonceTtlSeconds = tonumber(ARGV[2])

if redis.call('EXISTS', nonceKey) == 1 then
    return 0
end

local activeToken = redis.call('GET', activeKey)
if not activeToken then
    return 0
end

if activeToken ~= presentedToken then
    return 0
end

redis.call('DEL', activeKey)
redis.call('SET', nonceKey, '1', 'EX', nonceTtlSeconds, 'NX')
return 1
`;

function getTrackingSecret() {
    return (
        process.env.BLOG_TRACKING_SECRET
        || process.env.JWT_SECRET
        || process.env.SESSION_SECRET
    );
}

function normalizeIp(ip = '') {
    return String(ip).trim();
}

function userAgentHash(userAgent = '') {
    return crypto
        .createHash('sha256')
        .update(String(userAgent))
        .digest('hex')
        .slice(0, 16);
}

function signPayload(payload) {
    return crypto
        .createHmac('sha256', getTrackingSecret())
        .update(payload)
        .digest('hex');
}

function timingSafeEquals(a, b) {
    const aBuffer = Buffer.from(String(a));
    const bBuffer = Buffer.from(String(b));

    if (aBuffer.length !== bBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function cleanupUsedNonces(now = Date.now()) {
    return now;
}

function viewerKey({ slug, ip, userAgent }) {
    return `${slug}|${normalizeIp(ip)}|${userAgentHash(userAgent)}`;
}

function activeTokenKey({ slug, ip, userAgent }) {
    return `${KEY_PREFIX}:active:${viewerKey({ slug, ip, userAgent })}`;
}

function nonceKey(token) {
    return `${KEY_PREFIX}:nonce:${token.split('.')[1]}`;
}

async function createTrackingToken({ slug, ip, userAgent }) {
    const issuedAt = Date.now();
    const nonce = crypto.randomBytes(12).toString('hex');
    const payload = `${slug}|${issuedAt}|${nonce}|${normalizeIp(ip)}|${userAgentHash(userAgent)}`;
    const signature = signPayload(payload);

    await redisClient.set(
        activeTokenKey({ slug, ip, userAgent }),
        `${issuedAt}.${nonce}.${signature}`,
        { PX: TOKEN_TTL_MS }
    );

    return `${issuedAt}.${nonce}.${signature}`;
}

async function verifyAndConsumeTrackingToken({ token, slug, ip, userAgent }) {
    if (!token || typeof token !== 'string') {
        return false;
    }

    const [issuedAtRaw, nonce, signature] = token.split('.');
    const issuedAt = Number(issuedAtRaw);
    if (!issuedAtRaw || !nonce || !signature || !Number.isFinite(issuedAt)) {
        return false;
    }

    const now = Date.now();
    const ageMs = now - issuedAt;
    if (ageMs < 0 || ageMs > TOKEN_TTL_MS) {
        return false;
    }

    const payload = `${slug}|${issuedAt}|${nonce}|${normalizeIp(ip)}|${userAgentHash(userAgent)}`;
    const expectedSignature = signPayload(payload);
    if (!timingSafeEquals(signature, expectedSignature)) {
        return false;
    }

    const consumed = await redisClient.eval(VERIFY_AND_CONSUME_LUA, {
        keys: [
            activeTokenKey({ slug, ip, userAgent }),
            nonceKey(token),
        ],
        arguments: [
            token,
            String(Math.ceil(NONCE_TTL_MS / 1000)),
        ],
    });

    return consumed === 1 || consumed === '1';
}

module.exports = {
    createTrackingToken,
    verifyAndConsumeTrackingToken,
};
