const crypto = require('crypto');

function generateToken(length = 16) {
    return crypto.randomBytes(length).toString('hex');
}

const isEmpty = (inputObj) => {
  for (const [key, value] of Object.entries(inputObj)) {
    if (
      value === undefined || 
      value === null || 
      (typeof value === 'string' && value.trim() === '')
    ) {
      return key;
    }
  }
  return null;
};

const handleAuthFailure = (req, res, isApi, message) => {
    if (isApi) {
        return res.status(401).json({ success: false, message });
    }
    
    const currentUrl = req.originalUrl;
    const safeContinue = (currentUrl && currentUrl.startsWith('/') && !currentUrl.startsWith('//'))
        ? encodeURIComponent(currentUrl)
        : '';
        
    const loginUrl = safeContinue
        ? `${process.env.SERVER_BASE_URL}/auth/signin?continue=${safeContinue}`
        : `${process.env.SERVER_BASE_URL}/auth/signin`;

    return res.redirect(loginUrl);
};

const getAuthCookieOptions = (overrides = {}) => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/',
    ...overrides
});

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") 
    .replace(/\s+/g, "-") 
    .replace(/-+/g, "-");
}

function stripMongoId(value) {
  if (Array.isArray(value)) return value.map(stripMongoId);
  if (value && typeof value === 'object') {
    const { _id, ...rest } = value;
    return rest;
  }
  return value;
}


function serverError(res, err, message = 'An unexpected error occurred. Please try again later.') {
    const body = { success: false, message };

    if (process.env.NODE_ENV !== 'production') {
        body.error = {
            name:    err?.name    ?? 'Error',
            message: err?.message ?? String(err),
            stack:   err?.stack   ?? null,
        };
    }

    return res.status(500).json(body);
}

function clientError(res, status, message, details = null) {
    const body = { success: false, message };

    if (process.env.NODE_ENV !== 'production' && details !== null) {
        body.details = details;
    }

    return res.status(status).json(body);
}

module.exports = { generateToken, isEmpty, handleAuthFailure, getAuthCookieOptions, slugify, stripMongoId, serverError, clientError }
