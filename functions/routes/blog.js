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

const blogStatusFilterSchema = z.union([models.blogPost.blogPostStatusEnum, z.literal('')]).optional().default('');
const blogCategoryFilterSchema = z.union([models.blogPost.blogPostCategoryEnum, z.literal('')]).optional().default('');

function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
}

const serverManagedBlogFields = new Set(['id', 'slug', 'createdAt', 'updatedAt', 'views']);

function sanitizeClientBlogPayload(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return {};
    }

    return Object.entries(input).reduce((acc, [key, value]) => {
        if (!serverManagedBlogFields.has(key)) {
            acc[key] = value;
        }
        return acc;
    }, {});
}

function normalizeSlug(value = '') {
    return slugify(String(value || ''));
}

router.get('/', middlewares.authMiddleware, async (req, res) => {
    try {
        const querySchema = models.common.paginationQuerySchema.extend({
            status: blogStatusFilterSchema,
            category: blogCategoryFilterSchema,
            search: z.string().trim().optional().default(""),
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

router.get('/stats', middlewares.authMiddleware, async (req, res) => {
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

router.get('/:postId', middlewares.authMiddleware, async (req, res) => {
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

router.post('/', middlewares.authMiddleware, middlewares.adminOnly, async (req, res) => {
    try {
        const now = Date.now();
        const generatedSlug = normalizeSlug(req.body?.title || '');
        if (!generatedSlug) {
            return clientError(res, 400, 'A valid title is required to generate a blog post slug.');
        }

        const validData = models.blogPost.createBlogPostSchema.safeParse({
            id: generateToken(),
            ...sanitizeClientBlogPayload(req.body),
            slug: generatedSlug,
        });

        if (!validData.success) {
            return clientError(res, 400, 'Couldn\'t create blog post. Some fields are missing or invalid.', validData.error.issues.map(i => i.message));
        }
        
        const data = {
            ...validData.data,
            createdAt: now,
            updatedAt: now,
        };

        if (data.status === 'published' && !data.publishedAt) {
            data.publishedAt = now;
        }
        
        const author = await db.getUserById(data.authorId);
        if (!author) {
            return clientError(res, 404, 'Author not found');
        }

        const slugConflict = await db.getBlogPostBySlug(data.slug);
        if (slugConflict) {
            return clientError(res, 409, 'A post with this slug already exists. Try a different title.');
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

router.put('/:postId', middlewares.authMiddleware, middlewares.adminOnly, async (req, res) => {
    try {
        const post = await db.getBlogPostById(req.params.postId);
        if (!post) {
            return clientError(res, 404, 'Blog post not found');
        }

        const incoming = sanitizeClientBlogPayload(req.body);

        const validData = models.blogPost.updateBlogPostSchema.safeParse(incoming);
        if (!validData.success) {
            return clientError(res, 400, 'Invalid update data.', validData.error.issues.map(i => i.message));
        }

        const updates = Object.keys(incoming).reduce((acc, key) => {
            if (hasOwn(validData.data, key)) {
                acc[key] = validData.data[key];
            }
            return acc;
        }, {});

        if (updates.authorId) {
            const author = await db.getUserById(updates.authorId);
            if (!author) {
                return clientError(res, 404, 'Author not found');
            }
        }

        if (hasOwn(updates, 'title')) {
            const newSlug = normalizeSlug(updates.title);
            if (!newSlug) {
                return clientError(res, 400, 'Title must contain at least one letter or number to generate a slug.');
            }
            updates.slug = newSlug;
        }

        if (updates.slug && updates.slug !== post.slug) {
            const slugConflict = await db.getBlogPostBySlug(updates.slug);
            if (slugConflict && slugConflict.id !== post.id) {
                return clientError(res, 409, 'A post with this slug already exists.');
            }
        }

        if (updates.status === 'published' && !post.publishedAt) {
            updates.publishedAt = Date.now();
        }

        if (Object.keys(updates).length === 0) {
            return res.status(200).json({
                success: true,
                message: 'Blog post updated',
                data: { post: stripMongoId(post) },
            });
        }

        updates.updatedAt = Date.now();

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

router.delete('/:postId', middlewares.authMiddleware, middlewares.adminOnly, async (req, res) => {
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
    async (req, res) => {
    const { slug } = req.params;
    if (!slug || typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
        return clientError(res, 400, 'Invalid slug');
    }

    try {
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

        const post = await db.getBlogPostBySlug(slug);
        if (post && post.status === 'published') {
            await db.incrementBlogPostViews(slug);
        }
        return res.status(200).json({ success: true });
    } catch (e) {
        logger('BLOG_TRACK_VIEW').error(e);
        return serverError(res, e, 'Failed to record page view.');
    }
});

module.exports = router;
