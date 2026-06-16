/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const UAParser = require('ua-parser-js');


// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, generateToken, getAuthCookieOptions, serverError, clientError } = require('../helpers');
const db = require('../db');
const { loginSchema } = require('../models/user');
const { NotificationService } = require('../services');


/** SETUP
 * Global variables referenced in this file are defined here
 */
const router = express.Router();
const { userAlreadyAuth, authMiddleware } = middlewares;

function parseUserAgent(userAgentString) {
    try {
        if (!userAgentString || userAgentString === 'Unknown') {
            return {
                formatted: 'Unknown Device',
                browser: 'Unknown',
                os: 'Unknown',
                device: 'Unknown',
                raw: userAgentString
            };
        }

        const parser = new UAParser(userAgentString);
        const result = parser.getResult();
        const browserName = result.browser.name || 'Unknown Browser';
        const browserVersion = result.browser.version ? ` ${result.browser.version.split('.')[0]}` : '';

        const osName = result.os.name || 'Unknown OS';
        const osVersion = result.os.version ? ` ${result.os.version}` : '';

        const deviceType = result.device.type || 'desktop';
        const deviceVendor = result.device.vendor || '';
        const deviceModel = result.device.model || '';
        
        let formatted = '';
        
        if (deviceType === 'mobile' || deviceType === 'tablet') {
            if (deviceVendor && deviceModel) {
                formatted = `${browserName}${browserVersion} on ${deviceVendor} ${deviceModel}`;
            } else if (osName) {
                formatted = `${browserName}${browserVersion} on ${deviceType} (${osName}${osVersion})`;
            } else {
                formatted = `${browserName}${browserVersion} on ${deviceType}`;
            }
        } else {
            formatted = `${browserName}${browserVersion} on ${osName}${osVersion}`;
        }

        return {
            formatted,
            browser: `${browserName}${browserVersion}`,
            os: `${osName}${osVersion}`,
            device: deviceType,
            raw: userAgentString
        };
    } catch (error) {
        logger('AUTH').error('Failed to parse user agent:', error);
        return {
            formatted: userAgentString.substring(0, 120),
            browser: 'Unknown',
            os: 'Unknown',
            device: 'Unknown',
            raw: userAgentString
        };
    }
}

/** MAIN AUTH ROUTES */

router.post('/login', userAlreadyAuth, async (req, res) => {
    try {
        const validData = loginSchema.safeParse(req.body);

        if(!validData.success) {
            return clientError(res, 400, 'Couldn\'t complete login request', validData.error.issues.map(i => i.message));
        }
        const { email, password, rememberMe } = validData.data;

        /** Check if user doesn't exists in the db / password not matching */
        const user = await db.getUserByEmail(email);
        if (!user) {
            return clientError(res, 401, 'Invalid email or password');
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return clientError(res, 401, 'Invalid email or password');
        }

        /** Prepare new auth cookie and reload stamp to invalidate all old cookies */
        const stamp = `${generateToken()}_stamp_${Date.now()}`;

        const ms = (days) => days * 24 * 60 * 60 * 1000;
        const duration = rememberMe ? ms(30) : 60 * 60 * 1000;
        const token = jwt.sign(
            { userId: user.userId, email: user.email, firstName: user.firstName, lastName: user.lastName, stamp },
            process.env.JWT_SECRET,
            { expiresIn: Math.floor(duration / 1000) }
        );

        /** LOGIN FINGERPRINTING - Detect new device logins */
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const previousFingerprint = user.lastLoginFingerprint;
        const isNewDevice = previousFingerprint && previousFingerprint !== userAgent;

        if (!previousFingerprint) {
          await db.updateUser(user.userId, { lastLoginFingerprint: userAgent });
        } else if (isNewDevice) {
          await db.updateUser(user.userId, { lastLoginFingerprint: userAgent });

          const deviceInfo = parseUserAgent(userAgent);
          const loginTime = new Date().toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
          });

          /** Dispatch NEW_LOGIN_DETECTED notification (in-app + email if enabled) */
          NotificationService.dispatch({
            recipientId: user.userId,
            type: 'NEW_LOGIN_DETECTED',
            title: 'New Login Detected',
            message: `Your account was accessed from a new device: ${deviceInfo.formatted}`,
            link: '/profile',
            _emailContext: {
              DEVICE_INFO: deviceInfo.formatted,
              LOGIN_TIME: loginTime,
              BROWSER: deviceInfo.browser,
              OS: deviceInfo.os,
              DEVICE_TYPE: deviceInfo.device
            }
          }, 'AUTH_LOGIN');
        }

        /** Update user's last login timestamp and new cookie stamp */
        await db.updateUser(user.userId, {
            lastLogin: Date.now(),
            stamp
        });

        res.cookie("auth_token", token, getAuthCookieOptions({ maxAge: duration }));

        res.status(200).json({
            success: true,
            message: 'Signed in successfully',
            data: {
                user: {
                    userId: user.userId,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    role: user.role || 'staff'
                }
            }
        });
    } catch (e) {
        logger('SIGNIN').error(e);
        return serverError(res, e, 'Login failed. Please try again.');
    }
});

router.post('/logout', authMiddleware, async (req, res) => {
    try {
        res.clearCookie("auth_token", getAuthCookieOptions());

        await db.updateUser(req.user.userId, { stamp: null })

        res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        logger('LOGOUT').error(error);
        return serverError(res, error, 'Logout failed. Please try again.');
    }
});

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;
