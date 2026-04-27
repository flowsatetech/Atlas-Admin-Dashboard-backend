/** INJECT ENV VARS
 * Load environment variables from .env file into process.env
 */
require('dotenv').config();

/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('./functions/middlewares');
const authRoutes = require('./functions/routes/auth');
const userRoutes = require('./functions/routes/user');
const dashboardRoutes = require('./functions/routes/dashboard');
const projectRoutes = require('./functions/routes/projects');
const clientsRoutes = require('./functions/routes/clients');
const membersRoutes = require('./functions/routes/members');
const mediaRoutes = require('./functions/routes/media');
const analyticsRoutes = require('./functions/routes/analytics');
const tasksRoutes = require('./functions/routes/tasks');
const healthApi = require('./functions/routes/health');
const fourZeroFourApi = require('./functions/routes/404');
const swaggerSpec = require('./functions/docs/swagger');

const db = require('./functions/db');
const { logger } = require('./functions/helpers');

/** SETUP
 * Global variables neccessary to build the server are defined here
 */
const app = express();
const PORT = process.env.PORT || 3000;
const allowedOrigins = JSON.parse(process.env.APP_BASE_URL || "[]");

const corsOpts = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
};

const apiResponseDefaults = {
    successMessage: 'Request successful',
    errorMessage: 'Request failed'
};

/** CONFIG
 * All settings for imports are here
 */
app.use(cors(corsOpts));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.disable('x-powered-by');
app.set('trust proxy', 1);

/*app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                "default-src": ["'self'"],
                "script-src": ["'self'", "'unsafe-inline'"],
                "connect-src": [
                    "'self'", "https:", "wss:"
                ],
                "img-src": ["'self'", "data:", "https:"],
                "style-src": ["'self'", "'unsafe-inline'"],
            },
        },
    })
);*/

/**
 * Unified API response envelope for JSON responses.
 * Enforces: status, code, data, message for both success and error.
 */
app.use('/api', (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.success = (data = null, message = apiResponseDefaults.successMessage, httpStatus = 200) => {
        return res.status(httpStatus).json({
            status: 'success',
            code: httpStatus,
            data,
            message,
            __normalized: true
        });
    };

    res.error = (message = apiResponseDefaults.errorMessage, httpStatus = 400, data = null) => {
        return res.status(httpStatus).json({
            status: 'error',
            code: httpStatus,
            data,
            message,
            __normalized: true
        });
    };

    res.json = (payload) => {
        if (req.path === '/docs.json' || req.path.startsWith('/docs')) {
            return originalJson(payload);
        }

        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return originalJson(payload);
        }

        if (
            Object.prototype.hasOwnProperty.call(payload, 'status') &&
            Object.prototype.hasOwnProperty.call(payload, 'code') &&
            Object.prototype.hasOwnProperty.call(payload, 'data') &&
            Object.prototype.hasOwnProperty.call(payload, 'message')
        ) {
            const { __normalized, ...safePayload } = payload;
            return originalJson(safePayload);
        }

        const isSuccess = res.statusCode < 400;
        const resolvedHttpCode = Number.isInteger(res.statusCode) && res.statusCode > 0
            ? res.statusCode
            : (isSuccess ? 200 : 400);
        const normalized = {
            status: isSuccess ? 'success' : 'error',
            code: resolvedHttpCode,
            data: payload.data ?? null,
            message: payload.message || (isSuccess ? apiResponseDefaults.successMessage : apiResponseDefaults.errorMessage)
        };

        return originalJson(normalized);
    };

    next();
});

/** ROUTERS
 * All routers are created here
 */
const [authApi, userApi, dashboardApi, projectsApi, clientsApi, membersApi, mediaApi, analyticsApi, tasksApi] = Array.from({ length: 9 }, () => express.Router());

/** ROUTERS -> HANDLER MAPPING
 * All routers are mapped to their handlers
 */
authApi.use(authRoutes);
userApi.use(userRoutes);
dashboardApi.use(dashboardRoutes);
projectsApi.use(projectRoutes);
clientsApi.use(clientsRoutes);
membersApi.use(membersRoutes);
mediaApi.use(mediaRoutes);
analyticsApi.use(analyticsRoutes);
tasksApi.use(tasksRoutes);

/** CONFIGURE & START THE SERVER
 * Mount all routers
 * Initialize the DB
 * configure the server, then start it
 */
app.use('/api/auth', authApi);
app.use('/api/user', middlewares.authMiddleware, userApi);
app.use('/api/dashboard', middlewares.authMiddleware, dashboardApi);
app.use('/api/projects', middlewares.authMiddleware, projectsApi);
app.use('/api/clients', middlewares.authMiddleware, clientsApi);
app.use('/api/members', middlewares.authMiddleware, membersApi);
app.use('/api/media', middlewares.authMiddleware, mediaApi);
app.use('/api/analytics', middlewares.authMiddleware, analyticsApi);
app.use('/api/tasks', middlewares.authMiddleware, tasksApi);
app.use('/api/health', healthApi);

/** SWAGGER DOCUMENTATION */
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    swaggerOptions: {
        persistAuthorization: true
    }
}));
// Ensure the JSON spec is always fresh
app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});

app.use('/app', (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    express.static('frontend')(req, res, next);
  } else {
    next();
  }
});

app.use(fourZeroFourApi);

async function startServer() {
    try {
        await db.initializeDB();
        app.listen(PORT, () => {
            console.log(`Server is running on Port ${PORT}`);
        });
    } catch (err) {
        console.error("Failed to start server — DB connection failed.");
        logger('SERVER').error("DB Error:", err);
        process.exit(1);
    }
}

startServer();
