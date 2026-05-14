/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const fs = require('fs');
const MarkdownIt = require('markdown-it');
const path = require('path');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { createTrackingToken } = require('../helpers/blog-tracking');
const { logger } = require('../helpers');
const db = require('../db');

/** SETUP
 * Global variables referenced in this file are defined here
 */
const router = express.Router();
const defaultTemplatePath = path.join(__dirname, '../templates/blog-embed.html');
const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
});

// Whitelist only safe URL schemes — blocks javascript:, data:, vbscript:, etc.
const SAFE_LINK_RE = /^(https?:|mailto:|ftp:|\/|#)/i;
markdown.validateLink = (url) => SAFE_LINK_RE.test(String(url).trim());

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveTemplatePath() {
  const configuredPath = process.env.BLOG_EMBED_TEMPLATE_PATH;

  if (!configuredPath) {
    return defaultTemplatePath;
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
}

function loadTemplate() {
  return fs.readFileSync(resolveTemplatePath(), 'utf8');
}

function renderTemplate(template, replacements) {
  return Object.entries(replacements).reduce((compiled, [token, value]) => {
    return compiled.split(token).join(value);
  }, template);
}

function getAuthorDisplayName(author) {
    if (!author) return 'Unknown Author';

    if (author.fullName && String(author.fullName).trim()) {
        return String(author.fullName).trim();
    }

    const parts = [author.firstName, author.lastName].filter(Boolean).map((part) => String(part).trim());
    if (parts.length > 0) {
        return parts.join(' ');
    }

    return author.email || 'Unknown Author';
}

function getAuthorInitials(authorName = '') {
    const cleaned = String(authorName).trim();
    if (!cleaned) return 'AU';

    const initials = cleaned
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .filter(Boolean)
        .join('')
        .toUpperCase();

    return initials || 'AU';
}

router.get('/:slug', middlewares.rateLimiters.blogEmbedPage, async (req, res) => {
    const { slug } = req.params;

    if (!/^[a-z0-9-]+$/.test(slug)) {
        return res.status(404).send('<p>Post not found.</p>');
    }

    try {
        const post = await db.getBlogPostBySlug(slug);

        if (!post || post.status !== 'published') {
            return res.status(404).send('<p>Post not found.</p>');
        }

        const author = await db.getUserById(post.authorId);
        const authorName = getAuthorDisplayName(author);
        const authorInitials = getAuthorInitials(authorName);
        const authorRole = author?.role ? `${String(author.role).charAt(0).toUpperCase()}${String(author.role).slice(1)}` : 'Author';
        const authorAvatarUrl = author?.avatarUrl || '';
        const authorAvatarStyle = authorAvatarUrl
            ? `background-image: url('${escapeHtml(authorAvatarUrl)}'); background-size: cover; background-position: center; color: transparent;`
            : '';

        const serverBase = process.env.SERVER_BASE_URL || '';
        const pageUrl = `${serverBase}/embed/${encodeURIComponent(slug)}`;
        const trackUrl = `${serverBase}/api/blog/track/${encodeURIComponent(slug)}`;
        const trackToken = await createTrackingToken({
            slug,
            ip: req.ip,
            userAgent: req.get('user-agent') || '',
        });

        const publishedDate = post.publishedAt
            ? new Date(post.publishedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })
            : '';
        const metaHtml = [
            `<span>${escapeHtml(post.category)}</span>`,
            publishedDate ? `<span>${escapeHtml(publishedDate)}</span>` : ''
        ].filter(Boolean).join('');
        const excerptHtml = post.excerpt
            ? escapeHtml(post.excerpt)
            : '';
        const tagsHtml = post.tags && post.tags.length
            ? `<div class="tags">${post.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>`
            : '';
        const contentHtml = markdown.render(post.content || '');

        const html = renderTemplate(loadTemplate(), {
            '$_title_': escapeHtml(post.title),
            '$_meta_html_': metaHtml,
            '$_excerpt_html_': excerptHtml,
            '$_content_html_': contentHtml,
            '$_tags_html_': tagsHtml,
            '$_author_name_': escapeHtml(authorName),
            '$_author_role_': escapeHtml(authorRole),
            '$_author_initials_': escapeHtml(authorInitials),
            '$_author_avatar_style_': authorAvatarStyle,
            '$_page_url_': escapeHtml(pageUrl),
            '$_track_url_': escapeHtml(trackUrl),
            '$_track_token_': escapeHtml(trackToken),
        });

        res.setHeader('Content-Security-Policy', "frame-ancestors *");
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).send(html);
    } catch (e) {
        if (e.code === 'ENOENT') {
            logger('EMBED_TEMPLATE').error('Blog embed template file missing — check BLOG_EMBED_TEMPLATE_PATH or the default template path.');
            return res.status(503).send('<p>Service temporarily unavailable.</p>');
        }

        logger('GET_EMBED').error(e);
        return res.status(500).send('<p>An error occurred.</p>');
    }
});

module.exports = router;