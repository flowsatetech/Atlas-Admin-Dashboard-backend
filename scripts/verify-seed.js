#!/usr/bin/env node
require('dotenv').config();
const { MongoClient } = require('mongodb');

(async () => {
  try {
    const c = new MongoClient(process.env.MONGO_URI);
    await c.connect();
    const db = c.db('atlas-db');
    
    const counts = {
      users: await db.collection('users').countDocuments(),
      clients: await db.collection('clients').countDocuments(),
      projects: await db.collection('projects').countDocuments(),
      tasks: await db.collection('tasks').countDocuments(),
      leads: await db.collection('leads').countDocuments(),
      blogPosts: await db.collection('blogPosts').countDocuments(),
      comments: await db.collection('comments').countDocuments(),
      mediaStrings: await db.collection('mediaStrings').countDocuments(),
      activityLogs: await db.collection('activityLogs').countDocuments(),
      analyticsSnapshots: await db.collection('analyticsSnapshots').countDocuments(),
      campaignStats: await db.collection('campaignStats').countDocuments(),
      cmsPages: await db.collection('cms-pages').countDocuments()
    };
    
    console.log('✅ Collection Counts:');
    let total = 0;
    Object.entries(counts).forEach(([k, v]) => {
      console.log(`  ${k}: ${v}`);
      total += v;
    });
    console.log(`\n📊 Total documents: ${total}`);
    
    await c.close();
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
})();
