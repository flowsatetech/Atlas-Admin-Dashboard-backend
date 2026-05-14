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

router.get('/:slug', middlewares.rateLimiters.blogEmbedTrack, async (req, res) => {
    const { slug } = req.params;

    if (!/^[a-z0-9-]+$/.test(slug)) {
        return res.status(404).send('<p>Post not found.</p>');
    }

    try {
        const post = await db.getBlogPostBySlug(slug);

        if (!post || post.status !== 'published') {
            return res.status(404).send('<p>Post not found.</p>');
        }

        const serverBase = process.env.SERVER_BASE_URL || '';
        const trackUrl = `${serverBase}/api/blog/track/${encodeURIComponent(slug)}`;

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
            ? `<div class="excerpt">${escapeHtml(post.excerpt)}</div>`
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
            '$_track_url_': escapeHtml(trackUrl),
        });

        res.setHeader('X-Frame-Options', 'ALLOWALL');
        res.setHeader('Content-Security-Policy', "frame-ancestors *");
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).send(html);
    } catch (e) {
        if (e.code === 'ENOENT') {
            return res.status(500).send('<p>Embed template not found.</p>');
        }

        return res.status(500).send('<p>An error occurred.</p>');
    }
});

module.exports = router;