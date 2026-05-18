#!/usr/bin/env node

/**
 * Development Database Seeder
 * Populates MongoDB with realistic test data matching all models
 * Usage: node scripts/seed-dev-db.js
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

const MONGO_URI = process.env.NODE_ENV === 'production'
    ? process.env.MONGO_URI_PROD
    : process.env.MONGO_URI;

const DB_NAME = 'atlas-db';

/**
 * Helper to generate unique IDs
 */
const generateId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const now = Date.now();

/**
 * Test data factories
 */
const createUser = (overrides = {}) => ({
    userId: generateId('user'),
    firstName: 'Test',
    lastName: 'Staff',
    email: `staff_${Math.random().toString(36).substr(2, 5)}@atlas.local`,
    fullName: 'Test Staff',
    role: 'staff',
    password: bcrypt.hashSync('TestPassword123!', 10),
    authProvider: 'atlas',
    status: 'active',
    lastLogin: null,
    stamp: `${generateId('stamp')}_stamp_${now}`,
    createdAt: now,
    updatedAt: now,
    ...overrides
});

const createClient = (overrides = {}) => ({
    id: generateId('client'),
    fullName: 'Test Client Inc.',
    companyName: 'Test Client Corp',
    email: `contact_${Math.random().toString(36).substr(2, 5)}@testclient.com`,
    phone: '+1234567890',
    status: 'Lead',
    tags: ['prospect', 'enterprise'],
    assignedStaffId: null,
    leadSource: 'Website',
    notes: 'Initial contact',
    projectsCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides
});

const createProject = (clientId, teamIds = [], overrides = {}) => ({
    id: generateId('project'),
    name: 'Test Project',
    clientId,
    description: 'A test project for development',
    deadline: now + 30 * 24 * 60 * 60 * 1000, // 30 days from now
    budget: 50000,
    recognizedRevenue: null,
    recognizedAt: null,
    priority: 'High',
    status: 'InProgress',
    teamIds,
    progress: 45,
    files: [],
    createdAt: now,
    updatedAt: now,
    ...overrides
});

const createTask = (projectId, assigneeId, overrides = {}) => ({
    id: generateId('task'),
    title: 'Test Task',
    description: 'A sample task for development testing',
    projectId,
    assigneeId,
    dueDate: now + 7 * 24 * 60 * 60 * 1000, // 7 days from now
    status: 'Todo',
    createdAt: now,
    updatedAt: now,
    ...overrides
});

const createLead = (overrides = {}) => ({
    id: generateId('lead'),
    firstName: 'John',
    lastName: 'Lead',
    fullName: 'John Lead',
    email: `lead_${Math.random().toString(36).substr(2, 5)}@example.com`,
    phone: '+1111111111',
    company: 'Lead Company',
    status: 'new',
    stage: 'Qualification',
    contactPerson: 'John',
    value: 25000,
    source: 'Google Ads',
    notes: 'Warm lead from campaign',
    assignedTo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
});

const createBlogPost = (authorId, overrides = {}) => ({
    id: generateId('post'),
    title: 'Test Blog Post',
    slug: `test-post-${Date.now()}`,
    excerpt: 'This is a test blog post excerpt',
    content: '# Test Blog Post\n\nThis is test content for a blog post used in development.',
    category: 'Marketing',
    authorId,
    tags: ['test', 'development'],
    status: 'published',
    isFeatured: false,
    views: 0,
    publishedAt: now,
    scheduledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
});

const createComment = (projectId, authorId, overrides = {}) => ({
    id: generateId('comment'),
    projectId,
    authorId,
    content: 'This is a test comment on the project.',
    createdAt: now,
    updatedAt: now,
    ...overrides
});

const createMediaFile = (uploadedBy = null, overrides = {}) => ({
    id: generateId('media'),
    fileName: 'test-image.jpg',
    type: 'image',
    mimeType: 'image/jpeg',
    sizeBytes: 102400,
    storageProvider: 'cloudinary',
    publicId: generateId('cloudinary'),
    url: 'https://via.placeholder.com/1200x800',
    uploadedBy,
    createdAt: now,
    updatedAt: now,
    ...overrides
});

const createActivityLog = (actorId = null, overrides = {}) => ({
    id: generateId('activity'),
    type: 'project.created',
    actorId,
    entityId: null,
    entityType: 'project',
    message: 'A new project was created',
    meta: {},
    createdAt: now,
    updatedAt: now,
    ...overrides
});

const createAnalyticsSnapshot = (overrides = {}) => ({
    id: generateId('snapshot'),
    periodStart: now - 24 * 60 * 60 * 1000,
    periodEnd: now,
    visitors: 1250,
    pageViews: 3500,
    trafficSources: [
        { source: 'Organic', percentage: 45 },
        { source: 'Direct', percentage: 30 },
        { source: 'Referral', percentage: 25 }
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides
});

const createCampaignStat = (overrides = {}) => ({
    id: generateId('campaign'),
    campaignName: 'Spring 2026 Campaign',
    impressions: 50000,
    clicks: 2500,
    conversions: 125,
    conversionRate: 5,
    createdAt: now,
    updatedAt: now,
    ...overrides
});

const createCmsPage = (overrides = {}) => ({
    id: generateId('cms'),
    slug: `page-${Date.now()}`,
    title: 'Test CMS Page',
    content: '<h1>Test Page Content</h1><p>This is a test page.</p>',
    status: 'Published',
    lastEditedBy: null,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
});

/**
 * Main seeder function
 */
async function seedDatabase() {
    let client;

    try {
        console.log('🌱 Starting database seeding...');
        console.log(`📍 Connecting to: ${MONGO_URI}`);

        client = new MongoClient(MONGO_URI);
        await client.connect();
        const db = client.db(DB_NAME);

        // Clear existing collections
        console.log('🧹 Clearing existing collections...');
        const collections = [
            'users', 'clients', 'projects', 'tasks', 'leads', 'blogPosts',
            'comments', 'mediaStrings', 'images', 'activityLogs', 'analyticsSnapshots',
            'campaignStats', 'cms-pages'
        ];

        for (const collName of collections) {
            try {
                await db.collection(collName).deleteMany({});
                console.log(`  ✓ Cleared ${collName}`);
            } catch (e) {
                // Collection might not exist yet
            }
        }

        // 1. Create admin and staff users
        console.log('\n👥 Creating users...');
        const users = db.collection('users');
        const adminUser = createUser({
            userId: 'admin_user_001',
            firstName: 'Admin',
            lastName: 'User',
            fullName: 'Admin User',
            email: 'admin@atlas.local',
            role: 'admin'
        });
        const staffUser1 = createUser({
            userId: 'staff_user_001',
            firstName: 'Alice',
            lastName: 'Manager',
            fullName: 'Alice Manager',
            email: 'alice@atlas.local',
            role: 'staff'
        });
        const staffUser2 = createUser({
            userId: 'staff_user_002',
            firstName: 'Bob',
            lastName: 'Developer',
            fullName: 'Bob Developer',
            email: 'bob@atlas.local',
            role: 'staff'
        });

        await users.insertMany([adminUser, staffUser1, staffUser2]);
        console.log(`  ✓ Created 3 users`);

        // 2. Create clients
        console.log('\n🏢 Creating clients...');
        const clientsCol = db.collection('clients');
        const client1 = createClient({
            fullName: 'Acme Corporation',
            companyName: 'Acme Corp',
            email: 'contact@acme.com',
            status: 'Active',
            assignedStaffId: staffUser1.userId
        });
        const client2 = createClient({
            fullName: 'Beta Industries',
            companyName: 'Beta Ltd',
            email: 'info@beta.com',
            status: 'Lead'
        });
        const client3 = createClient({
            fullName: 'Gamma Solutions',
            companyName: 'Gamma Inc',
            email: 'hello@gamma.com',
            status: 'Inactive'
        });

        await clientsCol.insertMany([client1, client2, client3]);
        console.log(`  ✓ Created 3 clients`);

        // 3. Create projects
        console.log('\n📋 Creating projects...');
        const projectsCol = db.collection('projects');
        const project1 = createProject(client1.id, [staffUser1.userId, staffUser2.userId], {
            name: 'Website Redesign',
            status: 'InProgress',
            progress: 60
        });
        const project2 = createProject(client2.id, [staffUser2.userId], {
            name: 'Mobile App Development',
            status: 'Planned',
            progress: 10
        });
        const project3 = createProject(client1.id, [staffUser1.userId], {
            name: 'API Integration',
            status: 'Completed',
            progress: 100
        });

        await projectsCol.insertMany([project1, project2, project3]);
        console.log(`  ✓ Created 3 projects`);

        // 4. Create tasks
        console.log('\n✅ Creating tasks...');
        const tasksCol = db.collection('tasks');
        const task1 = createTask(project1.id, staffUser1.userId, {
            title: 'Design homepage mockup',
            status: 'InProgress'
        });
        const task2 = createTask(project1.id, staffUser2.userId, {
            title: 'Setup development environment',
            status: 'Done'
        });
        const task3 = createTask(project2.id, staffUser2.userId, {
            title: 'Define API specifications',
            status: 'Todo'
        });

        await tasksCol.insertMany([task1, task2, task3]);
        console.log(`  ✓ Created 3 tasks`);

        // 5. Create leads
        console.log('\n🎯 Creating leads...');
        const leadsCol = db.collection('leads');
        const lead1 = createLead({
            firstName: 'Jane',
            lastName: 'Smith',
            fullName: 'Jane Smith',
            email: 'jane@example.com',
            company: 'Smith Corp',
            status: 'contacted',
            value: 50000
        });
        const lead2 = createLead({
            firstName: 'Bob',
            lastName: 'Johnson',
            fullName: 'Bob Johnson',
            email: 'bob@acme.com',
            company: 'Acme Partners',
            status: 'qualified',
            value: 75000
        });
        const lead3 = createLead({
            firstName: 'Carol',
            lastName: 'White',
            fullName: 'Carol White',
            email: 'carol@xyz.com',
            status: 'new',
            value: 30000
        });

        await leadsCol.insertMany([lead1, lead2, lead3]);
        console.log(`  ✓ Created 3 leads`);

        // 6. Create blog posts
        console.log('\n📝 Creating blog posts...');
        const blogCol = db.collection('blogPosts');
        const blog1 = createBlogPost(staffUser1.userId, {
            title: '10 Web Design Trends in 2026',
            slug: '10-web-design-trends-2026',
            category: 'Design',
            status: 'published'
        });
        const blog2 = createBlogPost(staffUser2.userId, {
            title: 'Getting Started with React',
            slug: 'getting-started-react',
            category: 'Marketing',
            status: 'draft'
        });
        const blog3 = createBlogPost(adminUser.userId, {
            title: 'SEO Best Practices',
            slug: 'seo-best-practices',
            category: 'SEO',
            status: 'published',
            views: 250
        });

        await blogCol.insertMany([blog1, blog2, blog3]);
        console.log(`  ✓ Created 3 blog posts`);

        // 7. Create comments
        console.log('\n💬 Creating comments...');
        const commentsCol = db.collection('comments');
        const comment1 = createComment(project1.id, staffUser1.userId, {
            content: 'Great progress on the homepage design! The mockup looks professional.'
        });
        const comment2 = createComment(project1.id, staffUser2.userId, {
            content: 'I have set up the development environment. We can start coding now.'
        });
        const comment3 = createComment(project2.id, adminUser.userId, {
            content: 'Please ensure the API follows RESTful conventions.'
        });

        await commentsCol.insertMany([comment1, comment2, comment3]);
        console.log(`  ✓ Created 3 comments`);

        // 8. Create media files
        console.log('\n🖼️  Creating media files...');
        const mediaCol = db.collection('mediaStrings');
        const media1 = createMediaFile(staffUser1.userId, {
            fileName: 'homepage-banner.jpg',
            type: 'image',
            publicId: 'atlas-banner-001'
        });
        const media2 = createMediaFile(staffUser2.userId, {
            fileName: 'logo.png',
            type: 'image',
            sizeBytes: 51200,
            publicId: 'atlas-logo-001'
        });
        const media3 = createMediaFile(adminUser.userId, {
            fileName: 'company-presentation.pdf',
            type: 'document',
            mimeType: 'application/pdf',
            sizeBytes: 1024000
        });

        await mediaCol.insertMany([media1, media2, media3]);
        console.log(`  ✓ Created 3 media files`);

        // 9. Create activity logs
        console.log('\n📊 Creating activity logs...');
        const activityCol = db.collection('activityLogs');
        const activity1 = createActivityLog(staffUser1.userId, {
            type: 'project.created',
            entityId: project1.id,
            message: 'Website Redesign project was created'
        });
        const activity2 = createActivityLog(staffUser2.userId, {
            type: 'task.updated',
            entityId: task2.id,
            entityType: 'task',
            message: 'Setup development environment task was marked done'
        });
        const activity3 = createActivityLog(adminUser.userId, {
            type: 'auth.login',
            message: 'Admin user logged in'
        });

        await activityCol.insertMany([activity1, activity2, activity3]);
        console.log(`  ✓ Created 3 activity logs`);

        // 10. Create analytics snapshots
        console.log('\n📈 Creating analytics snapshots...');
        const analyticsCol = db.collection('analyticsSnapshots');
        const snapshot1 = createAnalyticsSnapshot({
            periodStart: now - 7 * 24 * 60 * 60 * 1000,
            periodEnd: now - 6 * 24 * 60 * 60 * 1000,
            visitors: 1500,
            pageViews: 4200
        });
        const snapshot2 = createAnalyticsSnapshot({
            periodStart: now - 6 * 24 * 60 * 60 * 1000,
            periodEnd: now - 5 * 24 * 60 * 60 * 1000,
            visitors: 1800,
            pageViews: 5100
        });

        await analyticsCol.insertMany([snapshot1, snapshot2]);
        console.log(`  ✓ Created 2 analytics snapshots`);

        // 11. Create campaign stats
        console.log('\n🚀 Creating campaign stats...');
        const campaignCol = db.collection('campaignStats');
        const campaign1 = createCampaignStat({
            campaignName: 'Spring 2026 Campaign',
            impressions: 50000,
            clicks: 2500,
            conversions: 125
        });
        const campaign2 = createCampaignStat({
            campaignName: 'Email Blast March',
            impressions: 30000,
            clicks: 1500,
            conversions: 90
        });

        await campaignCol.insertMany([campaign1, campaign2]);
        console.log(`  ✓ Created 2 campaign stats`);

        // 12. Create CMS pages
        console.log('\n📄 Creating CMS pages...');
        const cmsCol = db.collection('cms-pages');
        const cmsPage1 = createCmsPage({
            slug: 'about-us',
            title: 'About Us',
            content: '<h1>About Atlas</h1><p>We are a leading digital solutions company...</p>',
            status: 'Published'
        });
        const cmsPage2 = createCmsPage({
            slug: 'privacy-policy',
            title: 'Privacy Policy',
            content: '<h1>Privacy Policy</h1><p>Your privacy is important to us...</p>',
            status: 'Published'
        });
        const cmsPage3 = createCmsPage({
            slug: 'under-construction',
            title: 'Under Construction',
            content: '<h1>Coming Soon</h1><p>This page is under construction.</p>',
            status: 'Draft'
        });

        await cmsCol.insertMany([cmsPage1, cmsPage2, cmsPage3]);
        console.log(`  ✓ Created 3 CMS pages`);

        console.log('\n✨ Database seeding completed successfully!');
        console.log('\n📝 Credentials for testing:');
        console.log(`  Admin: admin@atlas.local / TestPassword123!`);
        console.log(`  Staff: alice@atlas.local / TestPassword123!`);
        console.log(`  Staff: bob@atlas.local / TestPassword123!`);

        return { success: true };

    } catch (error) {
        console.error('❌ Seeding failed:', error.message);
        console.error(error);
        process.exitCode = 1;
    } finally {
        if (client) {
            await client.close();
            console.log('\n🔌 Database connection closed');
        }
    }
}

// Run seeder
seedDatabase();
