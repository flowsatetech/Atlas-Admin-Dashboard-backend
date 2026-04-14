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

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('./functions/middlewares');
const authRoutes = require('./functions/routes/auth');
const userRoutes = require('./functions/routes/user');
const dashboardRoutes = require('./functions/routes/dashboard');
const projectRoutes = require('./functions/routes/projects');
const clientsRoutes = require('./functions/routes/clients');
const membersRoutes = require('./functions/routes/members');
const mediaRoutes = require('./functions/routes/media');
const tasksApi = require('./functions/routes/tasks');
const healthApi = require('./functions/routes/health');
const fourZeroFourApi = require('./functions/routes/404');

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

/** CONFIG
 * All settings for imports are here
 */
app.use(cors(corsOpts));
app.use(cookieParser());

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.disable('x-powered-by');
app.set('trust proxy', 1);

/** ROUTERS
 * All routers are created here
 */
const [
    authApi, 
    userApi, 
    dashboardApi, 
    projectsApi, 
    clientsApi, 
    membersApi, 
    mediaApi, 
    miscApi, 
    handler404
] = Array.from({ length: 9 }, () => express.Router());

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

// Developer 3 Task: Health Check Route 
miscApi.get('/health', (req, res) => {
    res.status(200).json({ status: 'Server health status' }); // 
});

handler404.use(require('./functions/routes/404'));

/** CONFIGURE & START THE SERVER
 * Mount all routers
 * Initialize the DB
 * configure the server, then start it
 */
app.use('/api/auth', authApi);
app.use('/api/user', middlewares.authMiddleware, userApi);
app.use('/api/dashboard', middlewares.authMiddleware, dashboardApi);
app.use('/api/projects', middlewares.authMiddleware, projectsApi);
app.use('/api/clients', clientsApi);
app.use('/api/members', middlewares.authMiddleware, membersApi);
app.use('/api/media', middlewares.authMiddleware, mediaApi);
app.use('/api/misc', miscApi);
app.use('/api/tasks', middlewares.authMiddleware, tasksApi);
app.use('/api/health', healthApi);


app.use('/app', (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    express.static('frontend')(req, res, next);
  } else {
    next();
  }
});

app.use(fourZeroFourApi);

app.listen(PORT, async () => {
    try {
        await db.initializeDB();
        console.log(`Server is running at http://localhost:${PORT}`);
    } catch (err) {
        console.error("DB Connection failed, but server is still trying to stay up...");
        logger('SERVER').error("DB Error:", err);
    }
});