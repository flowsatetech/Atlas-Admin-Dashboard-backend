/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const { z } = require('zod');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { verifyAndConsumeTrackingToken } = require('../helpers/blog-tracking');
const { logger, generateToken, slugify, stripMongoId } = require('../helpers');
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
            return res.status(400).json({ success: false, message: 'Invalid query parameters.' });
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
        return res.status(500).json({ success: false, message: 'An unknown error occurred' });
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
        return res.status(500).json({ success: false, message: 'An unknown error occurred' });
    }
});

router.get('/:postId', blogLimiter, middlewares.authMiddleware, async (req, res) => {
    try {
        const post = await db.getBlogPostById(req.params.postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Blog post not found' });
        }
        return res.status(200).json({
            success: true,
            message: 'Fetch blog post success',
            data: { post: stripMongoId(post) },
        });
    } catch (e) {
        logger('GET_BLOG_POST').error(e);
        return res.status(500).json({ success: false, message: 'An unknown error occurred' });
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
            return res.status(400).json({
                success: false,
                message: 'Couldn\'t create blog post. Some fields are missing or invalid.',
            });
        }
        
        const data = validData.data;

        if (data.status === 'published' && !data.publishedAt) {
            data.publishedAt = now;
        }
        
        const author = await db.getUserById(data.authorId);
        if (!author) {
            return res.status(404).json({ success: false, message: 'Author not found' });
        }

        const post = await db.addBlogPost({ ...data, views: 0 });
        return res.status(201).json({
            success: true,
            message: 'Blog post created',
            data: { post: stripMongoId(post) },
        });
    } catch (e) {
        logger('CREATE_BLOG_POST').error(e);
        return res.status(500).json({ success: false, message: 'An unknown error occurred' });
    }
});

router.put('/:postId', blogLimiter, middlewares.authMiddleware, middlewares.adminOnly, async (req, res) => {
    try {
        const post = await db.getBlogPostById(req.params.postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Blog post not found' });
        }

        const validData = models.blogPost.updateBlogPostSchema.safeParse(req.body);
        if (!validData.success) {
            return res.status(400).json({ success: false, message: 'Invalid update data.' });
        }

        const updates = { ...validData.data, updatedAt: Date.now() };

        if (updates.title && !req.body.slug) {
            updates.slug = slugify(updates.title);
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
        return res.status(500).json({ success: false, message: 'An unknown error occurred' });
    }
});

router.delete('/:postId', blogLimiter, middlewares.authMiddleware, middlewares.adminOnly, async (req, res) => {
    try {
        const post = await db.getBlogPostById(req.params.postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Blog post not found' });
        }

        await db.deleteBlogPost(req.params.postId);
        return res.status(200).json({ success: true, message: 'Blog post deleted', data: null });
    } catch (e) {
        logger('DELETE_BLOG_POST').error(e);
        return res.status(500).json({ success: false, message: 'An unknown error occurred' });
    }
});

router.post(
    '/track/:slug',
    middlewares.rateLimiters.blogEmbedTrack,
    middlewares.rateLimiters.blogEmbedTrackHourly,
    async (req, res) => {
    const { slug } = req.params;
    if (!slug || typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
        return res.status(400).json({ success: false, message: 'Invalid slug' });
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
        return res.status(500).json({ success: false, message: 'An unknown error occurred' });
    }
});

module.exports = router;
