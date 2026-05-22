/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const { z } = require('zod');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { verifyAndConsumeTrackingToken } = require('../helpers/blog-tracking');
const { logger, generateToken, slugify, stripMongoId, serverError, clientError } = require('../helpers');
const db = require('../db');
const models = require('../models');

/** SETUP
 * Global variables referenced in this file are defined here
 */
const router = express.Router();
const { blog: blogLimiter } = middlewares.rateLimiters;

router.get('/', blogLimiter, middlewares.authMiddleware, async (req, res) => {
    try {
        const querySchema = models.common.paginationQuerySchema.extend({
            status: z.string().optional().default(""),
            category: z.string().optional().default(""),
            search: z.string().optional().default(""),
        });
        const parsed = querySchema.safeParse(req.query);

        if (!parsed.success) {
            return clientError(res, 400, 'Invalid query parameters.', parsed.error.issues.map(i => i.message));
        }

        const { page, limit, status, category, search } = parsed.data;
        const result = await db.getBlogPostsPaginated({ page, limit, status, category, search });

        return res.status(200).json({
            success: true,
            message: 'Fetch blog posts success',
            data: {
                posts: stripMongoId(result.posts),
                pagination: result.pagination,
            }
        });
    } catch (e) {
        logger('GET_BLOG_POSTS').error(e);
        return serverError(res, e, 'Failed to fetch blog posts.');
    }
});

router.get('/stats', blogLimiter, middlewares.authMiddleware, async (req, res) => {
    try {
        const stats = await db.getBlogStats();
        return res.status(200).json({
            success: true,
            message: 'Fetch blog stats success',
            data: stats,
        });
    } catch (e) {
        logger('GET_BLOG_STATS').error(e);
        return serverError(res, e, 'Failed to fetch blog stats.');
    }
});

router.get('/:postId', blogLimiter, middlewares.authMiddleware, async (req, res) => {
    try {
        const post = await db.getBlogPostById(req.params.postId);
        if (!post) {
            return clientError(res, 404, 'Blog post not found');
        }
        return res.status(200).json({
            success: true,
            message: 'Fetch blog post success',
            data: { post: stripMongoId(post) },
        });
    } catch (e) {
        logger('GET_BLOG_POST').error(e);
        return serverError(res, e, 'Failed to fetch blog post.');
    }
});

router.post('/', blogLimiter, middlewares.authMiddleware, middlewares.adminOnly, async (req, res) => {
    try {
        const now = Date.now();
        const rawSlug = req.body.slug || req.body.title || '';
        const generatedSlug = slugify(rawSlug);

        const validData = models.blogPost.createBlogPostSchema.safeParse({
            id: generateToken(),
            ...req.body,
            slug: generatedSlug,
            createdAt: now,
            updatedAt: now,
        });

        if (!validData.success) {
            return clientError(res, 400, 'Couldn\'t create blog post. Some fields are missing or invalid.', validData.error.issues.map(i => i.message));
        }
        
        const data = validData.data;

        if (data.status === 'published' && !data.publishedAt) {
            data.publishedAt = now;
        }
        
        const author = await db.getUserById(data.authorId);
        if (!author) {
            return clientError(res, 404, 'Author not found');
        }

        const slugConflict = await db.getBlogPostBySlug(data.slug);
        if (slugConflict) {
            return clientError(res, 409, 'A post with this slug already exists. Try a different title or provide a custom slug.');
        }

        const post = await db.addBlogPost({ ...data, views: 0 });
        return res.status(201).json({
            success: true,
            message: 'Blog post created',
            data: { post: stripMongoId(post) },
        });
    } catch (e) {
        logger('CREATE_BLOG_POST').error(e);
        return serverError(res, e, 'Failed to create blog post.');
    }
});

router.put('/:postId', blogLimiter, middlewares.authMiddleware, middlewares.adminOnly, async (req, res) => {
    try {
        const post = await db.getBlogPostById(req.params.postId);
        if (!post) {
            return clientError(res, 404, 'Blog post not found');
        }

        const validData = models.blogPost.updateBlogPostSchema.safeParse(req.body);
        if (!validData.success) {
            return clientError(res, 400, 'Invalid update data.', validData.error.issues.map(i => i.message));
        }

        const updates = { ...validData.data, updatedAt: Date.now() };

        if (updates.title && !req.body.slug) {
            const newSlug = slugify(updates.title);
            if (newSlug !== post.slug) {
                const slugConflict = await db.getBlogPostBySlug(newSlug);
                if (slugConflict) {
                    return clientError(res, 409, 'A post with this slug already exists.');
                }
            }
            updates.slug = newSlug;
        }

        if (updates.status === 'published' && !post.publishedAt) {
            updates.publishedAt = Date.now();
        }

        const updated = await db.updateBlogPost(req.params.postId, updates);
        return res.status(200).json({
            success: true,
            message: 'Blog post updated',
            data: { post: stripMongoId(updated) },
        });
    } catch (e) {
        logger('UPDATE_BLOG_POST').error(e);
        return serverError(res, e, 'Failed to update blog post.');
    }
});

router.delete('/:postId', blogLimiter, middlewares.authMiddleware, middlewares.adminOnly, async (req, res) => {
    try {
        const post = await db.getBlogPostById(req.params.postId);
        if (!post) {
            return clientError(res, 404, 'Blog post not found');
        }

        await db.deleteBlogPost(req.params.postId);
        return res.status(200).json({ success: true, message: 'Blog post deleted', data: null });
    } catch (e) {
        logger('DELETE_BLOG_POST').error(e);
        return serverError(res, e, 'Failed to delete blog post.');
    }
});

router.post(
    '/track/:slug',
    middlewares.rateLimiters.blogEmbedTrack,
    middlewares.rateLimiters.blogEmbedTrackHourly,
    async (req, res) => {
    const { slug } = req.params;
    if (!slug || typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
        return clientError(res, 400, 'Invalid slug');
    }

    const token = req.body?.token;
        const isValidToken = await verifyAndConsumeTrackingToken({
        token,
        slug,
        ip: req.ip,
        userAgent: req.get('user-agent') || '',
    });

    if (!isValidToken) {
        return res.status(200).json({ success: true });
    }

    try {
        const post = await db.getBlogPostBySlug(slug);
        if (post && post.status === 'published') {
            await db.incrementBlogPostViews(slug);
        }
        return res.status(200).json({ success: true });
    } catch (e) {
        return serverError(res, e, 'Failed to record page view.');
    }
});

module.exports = router;
