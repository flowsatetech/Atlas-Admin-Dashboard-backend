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
    secure: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'none',
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

module.exports = { generateToken, isEmpty, handleAuthFailure, getAuthCookieOptions, slugify, stripMongoId }
