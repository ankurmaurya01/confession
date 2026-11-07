const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { User, Confession } = require('./models');
const {
  getClientIp,
  signupRateLimiter,
  validateEmail,
  requireAuth,
  requireAdmin
} = require('./middleware');

// In-memory post rate limiter: 1 post per 5 minutes per user
const userLastPostTime = new Map();

// Helper: Make currentUser available to all EJS templates
router.use((req, res, next) => {
  res.locals.currentUser = req.session.userId
    ? {
        _id: req.session.userId,
        name: req.session.name,
        username: req.session.username,
        role: req.session.role
      }
    : null;
  next();
});

// ==========================================
// PUBLIC & FEED ROUTES
// ==========================================

// GET / - Public feed (approved confessions only, filterable by category)
router.get('/', async (req, res) => {
  try {
    const category = req.query.category;
    const filter = {
      status: 'approved',
      isReportHidden: { $ne: true }
    };

    if (category && category !== 'All') {
      filter.category = category;
    }

    const confessions = await Confession.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.render('feed', {
      confessions,
      currentCategory: category || 'All',
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Feed error:', err);
    res.status(500).render('feed', {
      confessions: [],
      currentCategory: 'All',
      error: 'Failed to load confessions. Please refresh.'
    });
  }
});

// ==========================================
// AUTHENTICATION ROUTES (USER)
// ==========================================

// GET /signup
router.get('/signup', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('signup', { error: null, formData: {} });
});

// POST /signup
router.post('/signup', signupRateLimiter, async (req, res) => {
  try {
    const { name, username, email, mobile, rollNumber, password, confirmPassword, adminNotice } = req.body;
    const ip = getClientIp(req);

    // 1. Mandatory checkbox
    if (!adminNotice) {
      return res.status(400).render('signup', {
        error: 'You must acknowledge the admin transparency notice to sign up.',
        formData: req.body
      });
    }

    // 2. Validate passwords
    if (!password || password.length < 6) {
      return res.status(400).render('signup', {
        error: 'Password must be at least 6 characters long.',
        formData: req.body
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).render('signup', {
        error: 'Passwords do not match.',
        formData: req.body
      });
    }

    // 3. Validate Mobile (10 digits, starts with 6-9)
    const mobileRegex = /^[6-9]\d{9}$/;
    const cleanMobile = (mobile || '').trim();
    if (!mobileRegex.test(cleanMobile)) {
      return res.status(400).render('signup', {
        error: 'Mobile number must be a valid 10-digit Indian phone number starting with 6, 7, 8, or 9.',
        formData: req.body
      });
    }

    // 4. Validate Email (Format, disposable blacklist, and MX records)
    const cleanEmail = (email || '').trim().toLowerCase();
    const emailCheck = await validateEmail(cleanEmail);
    if (!emailCheck.valid) {
      return res.status(400).render('signup', {
        error: emailCheck.message,
        formData: req.body
      });
    }

    const cleanUsername = (username || '').trim().toLowerCase();
    if (cleanUsername.length < 3 || !/^[a-z0-9_]+$/.test(cleanUsername)) {
      return res.status(400).render('signup', {
        error: 'Username must be at least 3 characters and contain only letters, numbers, and underscores.',
        formData: req.body
      });
    }

    // 5. Anti-fake: Check if email, mobile, or IP is banned
    const bannedUserMatch = await User.findOne({
      isBanned: true,
      $or: [
        { email: cleanEmail },
        { mobile: cleanMobile },
        { signupIp: ip },
        { lastLoginIp: ip }
      ]
    });

    if (bannedUserMatch) {
      return res.status(403).render('signup', {
        error: 'This email, mobile, or network IP has been restricted from creating accounts due to prior college rule violations.',
        formData: req.body
      });
    }

    // 6. Check unique constraints (email, mobile, username)
    const existing = await User.findOne({
      $or: [
        { email: cleanEmail },
        { mobile: cleanMobile },
        { username: cleanUsername }
      ]
    });

    if (existing) {
      let duplicateField = 'Email';
      if (existing.username === cleanUsername) duplicateField = 'Username';
      if (existing.mobile === cleanMobile) duplicateField = 'Mobile number';

      return res.status(400).render('signup', {
        error: `${duplicateField} is already registered. Please log in or use your own credentials.`,
        formData: req.body
      });
    }

    // 7. Hash password with bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 8. Create user
    const newUser = await User.create({
      name: name.trim(),
      username: cleanUsername,
      email: cleanEmail,
      mobile: cleanMobile,
      rollNumber: (rollNumber || '').trim(),
      password: hashedPassword,
      signupIp: ip,
      lastLoginIp: ip,
      role: 'user'
    });

    // Record rate limit attempt on successful creation
    if (req.recordSignupAttempt) req.recordSignupAttempt();

    // Auto log in to session
    req.session.userId = newUser._id;
    req.session.name = newUser.name;
    req.session.username = newUser.username;
    req.session.role = newUser.role;
    req.session.isBanned = false;

    res.redirect('/?success=Account created successfully! Welcome to GL Bajaj Confessions.');
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).render('signup', {
      error: 'An unexpected error occurred during signup. Please try again.',
      formData: req.body
    });
  }
});

// GET /login
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('login', { error: null });
});

// POST /login
router.post('/login', async (req, res) => {
  try {
    const { loginId, password } = req.body;
    const ip = getClientIp(req);
    const cleanId = (loginId || '').trim().toLowerCase();

    const user = await User.findOne({
      $or: [{ email: cleanId }, { username: cleanId }]
    });

    if (!user) {
      return res.status(401).render('login', { error: 'Invalid email/username or password.' });
    }

    if (user.isBanned) {
      return res.status(403).render('login', {
        error: `Your account is banned. Reason: ${user.banReason || 'College policy violation'}`
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).render('login', { error: 'Invalid email/username or password.' });
    }

    // Update last login IP
    user.lastLoginIp = ip;
    await user.save();

    // Establish session
    req.session.userId = user._id;
    req.session.name = user.name;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.isBanned = false;

    res.redirect('/');
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).render('login', { error: 'An unexpected error occurred during login.' });
  }
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// ==========================================
// CONFESSION INTERACTIONS (USER)
// ==========================================

// POST /confessions - Create new confession
router.post('/confessions', requireAuth, async (req, res) => {
  try {
    const { content, category } = req.body;
    const userId = req.session.userId.toString();
    const now = Date.now();

    // 1 post per 5 minutes per user rate limit
    const lastPostTime = userLastPostTime.get(userId);
    const cooldownMs = 5 * 60 * 1000;
    if (lastPostTime && now - lastPostTime < cooldownMs) {
      const remainingSeconds = Math.ceil((cooldownMs - (now - lastPostTime)) / 1000);
      return res.redirect(`/?error=${encodeURIComponent(`Please wait ${remainingSeconds} seconds before posting another confession (cooldown: 5 mins).`)}`);
    }

    if (!content || content.trim().length === 0) {
      return res.redirect('/?error=Confession content cannot be empty.');
    }

    if (content.trim().length > 500) {
      return res.redirect('/?error=Confession cannot exceed 500 characters.');
    }

    const validCategories = ['Love', 'Funny', 'Campus Life', 'Secret', 'Other'];
    const chosenCategory = validCategories.includes(category) ? category : 'Other';

    await Confession.create({
      content: content.trim(),
      category: chosenCategory,
      author: req.session.userId,
      status: 'pending' // Goes to admin moderation
    });

    userLastPostTime.set(userId, now);

    res.redirect('/my-confessions?success=Confession submitted! It will appear on the feed once reviewed by moderators.');
  } catch (err) {
    console.error('Post confession error:', err);
    res.redirect('/?error=Could not submit confession. Please try again.');
  }
});

// POST /confessions/:id/like - Toggle like
router.post('/confessions/:id/like', requireAuth, async (req, res) => {
  try {
    const confession = await Confession.findById(req.params.id);
    if (!confession) return res.redirect('/?error=Confession not found');

    const userId = req.session.userId;
    const index = confession.likes.indexOf(userId);

    if (index === -1) {
      confession.likes.push(userId);
    } else {
      confession.likes.splice(index, 1);
    }

    await confession.save();
    res.redirect('back');
  } catch (err) {
    console.error('Like error:', err);
    res.redirect('/');
  }
});

// POST /confessions/:id/report - Report confession (3 reports auto-hides)
router.post('/confessions/:id/report', requireAuth, async (req, res) => {
  try {
    const confession = await Confession.findById(req.params.id);
    if (!confession) return res.redirect('/?error=Confession not found');

    const userId = req.session.userId;
    const alreadyReported = confession.reports.some(r => r.user.toString() === userId.toString());

    if (!alreadyReported) {
      confession.reports.push({ user: userId });
      if (confession.reports.length >= 3) {
        confession.isReportHidden = true; // Auto-hide from feed
      }
      await confession.save();
    }

    res.redirect('/?success=Thank you for reporting. Our moderation team has been notified.');
  } catch (err) {
    console.error('Report error:', err);
    res.redirect('/');
  }
});

// GET /my-confessions
router.get('/my-confessions', requireAuth, async (req, res) => {
  try {
    const confessions = await Confession.find({ author: req.session.userId })
      .sort({ createdAt: -1 })
      .lean();

    res.render('my-confessions', {
      confessions,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('My Confessions error:', err);
    res.status(500).send('Error loading confessions');
  }
});

// POST /my-confessions/:id/delete - Delete own confession
router.post('/my-confessions/:id/delete', requireAuth, async (req, res) => {
  try {
    const confession = await Confession.findOne({
      _id: req.params.id,
      author: req.session.userId
    });

    if (confession) {
      await Confession.findByIdAndDelete(req.params.id);
    }

    res.redirect('/my-confessions?success=Confession deleted successfully.');
  } catch (err) {
    console.error('Delete own confession error:', err);
    res.redirect('/my-confessions');
  }
});

// ==========================================
// ADMIN ROUTES
// ==========================================

// GET /admin/login
router.get('/admin/login', (req, res) => {
  if (req.session.role === 'admin') return res.redirect('/admin');
  res.render('admin-login', { error: null });
});

// POST /admin/login
router.post('/admin/login', async (req, res) => {
  try {
    const { adminId, email, password } = req.body;
    const identifier = (adminId || email || '').trim().toLowerCase();

    const adminUser = await User.findOne({
      role: 'admin',
      $or: [{ username: identifier }, { email: identifier }]
    });

    if (!adminUser) {
      return res.status(401).render('admin-login', { error: 'Invalid admin ID or password.' });
    }

    const match = await bcrypt.compare(password, adminUser.password);
    if (!match) {
      return res.status(401).render('admin-login', { error: 'Invalid admin ID or password.' });
    }

    req.session.userId = adminUser._id;
    req.session.name = adminUser.name;
    req.session.username = adminUser.username;
    req.session.role = 'admin';
    req.session.isBanned = false;

    // Explicitly save session before redirecting (essential for serverless Vercel)
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('Session save error:', saveErr);
        return res.status(500).render('admin-login', { error: 'Failed to create admin session: ' + saveErr.message });
      }
      res.redirect('/admin');
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).render('admin-login', { error: 'Server error during admin login: ' + (err.message || 'Unknown error') });
  }
});

// GET /admin - Dashboard summary
router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const [totalUsers, bannedUsers, totalConfessions, pendingConfessions, reportedConfessions] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isBanned: true }),
      Confession.countDocuments(),
      Confession.countDocuments({ status: 'pending' }),
      Confession.countDocuments({ 'reports.0': { $exists: true } })
    ]);

    const recentConfessions = await Confession.find({
      $or: [{ status: 'pending' }, { 'reports.0': { $exists: true } }]
    })
      .sort({ createdAt: -1 })
      .limit(6)
      .populate('author', 'name username email mobile isBanned')
      .lean();

    res.render('admin-dashboard', {
      stats: {
        totalUsers,
        bannedUsers,
        totalConfessions,
        pendingConfessions,
        reportedConfessions
      },
      recentConfessions
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).send('Error loading admin dashboard');
  }
});

// GET /admin/users - Users list & search
router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const search = req.query.search;
    let query = {};

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query = {
        $or: [
          { name: regex },
          { username: regex },
          { email: regex },
          { mobile: regex },
          { rollNumber: regex },
          { signupIp: regex },
          { lastLoginIp: regex }
        ]
      };
    }

    // Exclude password field from the query output
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    res.render('admin-users', {
      users,
      search: search || '',
      success: req.query.success || null
    });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).send('Error loading users table');
  }
});

// POST /admin/users/:id/ban
router.post('/admin/users/:id/ban', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role === 'admin') {
      return res.redirect('/admin/users');
    }

    user.isBanned = true;
    user.banReason = req.body.reason || 'Violated GL Bajaj student conduct policies.';
    user.bannedAt = new Date();
    await user.save();

    res.redirect('/admin/users?success=' + encodeURIComponent(`User @${user.username} has been banned.`));
  } catch (err) {
    console.error('Ban user error:', err);
    res.redirect('/admin/users');
  }
});

// POST /admin/users/:id/unban
router.post('/admin/users/:id/unban', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user) {
      user.isBanned = false;
      user.banReason = '';
      user.bannedAt = null;
      await user.save();
    }
    res.redirect('/admin/users?success=User unbanned successfully.');
  } catch (err) {
    console.error('Unban error:', err);
    res.redirect('/admin/users');
  }
});

// GET /admin/confessions - Moderation tabs
router.get('/admin/confessions', requireAdmin, async (req, res) => {
  try {
    const tab = req.query.tab || 'pending';
    let filter = {};

    if (tab === 'reported') {
      filter = { 'reports.0': { $exists: true } };
    } else if (['pending', 'approved', 'rejected'].includes(tab)) {
      filter = { status: tab };
    }

    const confessions = await Confession.find(filter)
      .sort({ createdAt: -1 })
      .populate('author', 'name username email mobile isBanned role')
      .lean();

    res.render('admin-confessions', {
      confessions,
      currentTab: tab,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('Admin confessions error:', err);
    res.status(500).send('Error loading confessions for moderation');
  }
});

// POST /admin/confessions/:id/approve
router.post('/admin/confessions/:id/approve', requireAdmin, async (req, res) => {
  try {
    await Confession.findByIdAndUpdate(req.params.id, {
      status: 'approved',
      isReportHidden: false
    });
    res.redirect('back');
  } catch (err) {
    console.error('Approve error:', err);
    res.redirect('/admin/confessions');
  }
});

// POST /admin/confessions/:id/reject
router.post('/admin/confessions/:id/reject', requireAdmin, async (req, res) => {
  try {
    await Confession.findByIdAndUpdate(req.params.id, { status: 'rejected' });
    res.redirect('back');
  } catch (err) {
    console.error('Reject error:', err);
    res.redirect('/admin/confessions');
  }
});

// POST /admin/confessions/:id/delete
router.post('/admin/confessions/:id/delete', requireAdmin, async (req, res) => {
  try {
    await Confession.findByIdAndDelete(req.params.id);
    res.redirect('back');
  } catch (err) {
    console.error('Delete error:', err);
    res.redirect('/admin/confessions');
  }
});

module.exports = router;
