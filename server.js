require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const bcrypt = require('bcrypt');
const { User } = require('./models');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/glbajaj_confessions';
const SESSION_SECRET = process.env.SESSION_SECRET || 'glbajaj_fallback_secret_change_me';

// Trust reverse proxy for correct secure cookies and IP detection on Vercel
app.set('trust proxy', 1);

// Security Headers via Helmet (with relaxed CSP for Tailwind CDN and inline scripts)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:']
      }
    }
  })
);

// Body Parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// View Engine Setup (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// MongoDB Connection Cache for Serverless environments (e.g. Vercel)
let isConnectedBefore = false;
async function connectDB() {
  if (mongoose.connection.readyState >= 1) {
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('MongoDB connected successfully.');
    if (!isConnectedBefore) {
      await seedAdminUser();
      isConnectedBefore = true;
    }
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
  }
}

// One-time startup/seed check for Admin account from environment variables
async function seedAdminUser() {
  try {
    const adminUsername = (process.env.ADMIN_ID || 'admin').trim().toLowerCase();
    const adminEmail = (process.env.ADMIN_EMAIL || `${adminUsername}@glbajaj.org`).trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || 'maurya123';

    let existingAdmin = await User.findOne({
      $or: [{ username: adminUsername }, { email: adminEmail }]
    });

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    if (!existingAdmin) {
      await User.create({
        name: 'GL Bajaj Admin',
        username: adminUsername,
        email: adminEmail,
        mobile: '9876543210',
        rollNumber: 'STAFF-01',
        password: hashedPassword,
        role: 'admin',
        signupIp: '127.0.0.1'
      });
      console.log(`Admin account seeded automatically for: ${adminUsername} / ${adminEmail}`);
    } else {
      // Ensure credentials match environment configurations
      existingAdmin.role = 'admin';
      existingAdmin.password = hashedPassword;
      existingAdmin.username = adminUsername;
      existingAdmin.isBanned = false;
      await existingAdmin.save();
    }
  } catch (err) {
    console.error('Admin seed error:', err.message);
  }
}

// Ensure DB is connected for incoming requests (crucial for cold starts on Vercel)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection middleware failed:', err.message);
    res.status(500).send('Database connection error. Please verify your MONGODB_URI and Network Access settings in MongoDB Atlas.');
  }
});

// Session Middleware with MongoStore (stateless serverless compatible)
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      clientPromise: mongoose.connection.asPromise().then(m => m.getClient()),
      collectionName: 'sessions',
      ttl: 14 * 24 * 60 * 60 // 14 days session
    }),
    cookie: {
      maxAge: 14 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production'
    }
  })
);

// Mount all routes
app.use('/', routes);

// 404 Handler
app.use((req, res) => {
  res.status(404).send('Page not found on GL Bajaj Confessions.');
});

// Start listening if running locally or as a long-lived Node process
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`GL Bajaj Confessions server running at http://localhost:${PORT}`);
    });
  });
}

// Export app for Vercel serverless deployment
module.exports = app;
