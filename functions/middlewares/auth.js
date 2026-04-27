/** AUTH MIDDLEWARE
 * This is the middleware that allows only users that are logged in to access a route
*/

/** IMPORTS
 * Import all third Party Libraries and variables here
 */
const jwt = require('jsonwebtoken');
const { handleAuthFailure, logger } = require('../helpers')
const db = require('../db');

/** MIDDLEWARE LOGIC */
const authMiddleware = async (req, res, next) => {
    const isApiRequest = true
    try {
        const token = req.cookies.auth_token;

        /** FOR NOW, TREAT ALL REQUESTS AS API REQUEST, I'LL REFACTOR THE CODE FOR BROWSER NAV CHECK 
        * const isApiRequest =
            req.xhr ||
            req.path.startsWith('/api/') ||
            req.headers['content-type'] === 'application/json' ||
            (req.headers.accept && req.headers.accept === 'application/json');
        */

        if (!token) {
            return handleAuthFailure(req, res, isApiRequest, 'Access denied. Please sign in.');
        }

        /** Verify JWT structure and expiry */
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        /** Database Check: User existence AND Stamp integrity */
        const user = await db.getUserById(decoded.userId);

        if (!user || !user.stamp || user.stamp !== decoded.stamp) {
            res.clearCookie("auth_token", { httpOnly: true, secure: true, sameSite: "strict", path: "/" });
            return handleAuthFailure(req, res, isApiRequest, 'Session expired or invalid. Please sign in again.');
        }

        /** Success, Attach user to request */
        req.user = decoded;
        req.db_user = user;
        next();

    } catch (error) {
        logger('AUTH_MIDDLEWARE').error(error);

        /** Handle expired or malformed tokens */
        res.clearCookie("auth_token", { httpOnly: true, secure: true, sameSite: "strict", path: "/" });
        return handleAuthFailure(req, res, isApiRequest, 'Invalid session.');
    }
};

const userAlreadyAuth = async (req, res, next) => {
    const token = req.cookies.auth_token;

    if (token) {
        try {
            // Verify if the token is actually valid
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await db.getUserById(decoded.userId);

            // If user is valid and session stamp matches, redirect them
            if (user && user.stamp === decoded.stamp) {
                return res.status(200).json({
                    success: false,
                    message: 'You\'re already signed in'
                })
            }
        } catch (err) {
            // Token is expired or invalid? Let them stay on the signin page
            res.clearCookie("auth_token", { httpOnly: true, secure: true, sameSite: "strict", path: "/" });
        }
    }
    next();
};

const adminOnly = async (req, res, next) => {
    if (!req.db_user || req.db_user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Admins only.'
        })
    }
    next();
}

module.exports = { authMiddleware, userAlreadyAuth, adminOnly }