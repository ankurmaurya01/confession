const dns = require('dns').promises;

// Hardcoded disposable email domains blocklist
const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com', '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
  'sharklasers.com', 'throwawaymail.com', 'getairmail.com', 'temp-mail.org',
  'yopmail.com', 'dispostable.com', 'crazymailing.com', 'dropmail.me',
  'mytemp.email', 'trashmail.com', 'nada.ltd', 'mohmal.com'
];

// Helper to get client IP cleanly (handles proxies/Vercel)
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || '127.0.0.1';
}

// In-memory signup rate limiter (3 signups per IP per 24 hours)
const signupIpTracker = new Map();

function signupRateLimiter(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  let records = signupIpTracker.get(ip) || [];
  // Clean records older than 24 hours
  records = records.filter(time => now - time < oneDay);

  if (records.length >= 3) {
    return res.status(429).render('signup', {
      error: 'Signup rate limit exceeded (maximum 3 accounts per day from this network/IP).',
      formData: req.body
    });
  }

  // Record this attempt timestamp on finish if successful
  req.recordSignupAttempt = () => {
    records.push(Date.now());
    signupIpTracker.set(ip, records);
  };

  next();
}

// Validate email format, disposable blocklist, and MX record
async function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return { valid: false, message: 'Invalid email address format.' };
  }

  const domain = email.split('@')[1].toLowerCase();
  if (DISPOSABLE_EMAIL_DOMAINS.includes(domain)) {
    return { valid: false, message: 'Temporary / disposable email services are strictly prohibited.' };
  }

  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, message: 'Email domain has no valid mail exchanger (MX) record.' };
    }
  } catch (err) {
    return { valid: false, message: 'Could not verify mail server for this email domain.' };
  }

  return { valid: true };
}

// Require user authentication
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login');
  }
  if (req.session.isBanned) {
    req.session.destroy(() => {
      res.render('login', { error: 'Your account has been banned from accessing GL Bajaj Confessions.' });
    });
    return;
  }
  next();
}

// Require admin privilege
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId || req.session.role !== 'admin') {
    return res.redirect('/admin/login');
  }
  next();
}

module.exports = {
  getClientIp,
  signupRateLimiter,
  validateEmail,
  requireAuth,
  requireAdmin
};
