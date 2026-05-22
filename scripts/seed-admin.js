/**
 * One-time script to seed an admin user into the database.
 * Usage: node scripts/seed-admin.js
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const MONGO_URI = process.env.NODE_ENV === 'production'
  ? process.env.MONGO_URI_PROD
  : process.env.MONGO_URI;

const EMAIL    = 'admin1@atlas-africa.com.ng';
const PASSWORD = 'nimda@salta';
const FIRST    = 'Admin';
const LAST     = 'One';
const ROLE     = 'admin';

async function main() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const users = client.db('atlas-db').collection('users');

    const existing = await users.findOne({ email: EMAIL });
    if (existing) {
      console.log(`User "${EMAIL}" already exists — skipping.`);
      return;
    }

    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const userId       = crypto.randomBytes(16).toString('hex');
    const stamp        = `${crypto.randomBytes(16).toString('hex')}_stamp_${Date.now()}`;
    const now          = Date.now();

    await users.insertOne({
      userId,
      firstName: FIRST,
      lastName: LAST,
      fullName: `${FIRST} ${LAST}`,
      email: EMAIL,
      password: passwordHash,
      role: ROLE,
      job: null,
      status: 'active',
      authProvider: 'atlas',
      createdAt: now,
      updatedAt: now,
      lastLogin: null,
      stamp,
    });

    console.log(`✓ Admin user "${EMAIL}" created successfully (userId: ${userId})`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
