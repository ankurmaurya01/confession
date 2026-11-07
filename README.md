# 🎓 GL Bajaj Confessions

A minimal, single-codebase anonymous confession portal built exclusively for GL Bajaj college students. Complete with anti-abuse measures, MX email verification, dark mode support, and an administrative moderation panel.

> **Disclaimer:** Made for GL Bajaj students, for fun only. Not an official college platform.

---

## ⚡ Tech Stack & Architecture

- **Backend:** Node.js + Express (single-app architecture)
- **Database:** MongoDB Atlas via Mongoose (2 collections: `users`, `confessions`)
- **Frontend / UI:** EJS templates styled with Tailwind CSS via CDN (zero build step)
- **Sessions & Auth:** `express-session` with `connect-mongo` (persistent across serverless cold starts)
- **Security:** `bcrypt` password hashing, `helmet` HTTP headers, sanitized inputs, role-based protection

---

## 📁 File Structure

```text
.
├── server.js               # App setup, DB connection, session, admin seeder & mounting
├── models.js               # User and Confession schemas (one file)
├── routes.js               # All user & admin routes (one file)
├── middleware.js           # Auth checks, MX record validator, and rate limiters
├── views/
│   ├── feed.ejs            # Public feed with category filters & post form
│   ├── signup.ejs          # Registration form with anti-fake checks & transparency note
│   ├── login.ejs           # User login
│   ├── my-confessions.ejs  # User's submissions & approval status
│   ├── admin-login.ejs     # Admin login gateway
│   ├── admin-dashboard.ejs # Metrics overview & quick action queue
│   ├── admin-users.ejs     # Student user table, search & ban controls
│   ├── admin-confessions.ejs # Confession review tabs (Pending, Reported, Live, Rejected)
│   └── partials/
│       ├── header.ejs      # Top navigation with dark mode toggle
│       └── footer.ejs      # College disclaimer & theme toggle scripts
├── vercel.json             # Vercel serverless configuration
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## 🛠️ Local Development Setup

1. **Clone or enter directory:**
   ```bash
   cd "c:\Users\Windows 11\Desktop\New folder"
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Fill in your configuration:
   ```env
   PORT=3000
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/glbajaj_confessions?retryWrites=true&w=majority
   SESSION_SECRET=super_secret_session_key_glbajaj
   ADMIN_ID=admin
   ADMIN_EMAIL=admin@glbajaj.org
   ADMIN_PASSWORD=maurya123
   ```

   **Default Admin Credentials:**
   - **Admin ID:** `admin` (or `admin@glbajaj.org`)
   - **Password:** `maurya123`

4. **Run the app locally:**
   ```bash
   npm start
   ```
   Open `http://localhost:3000` in your browser. The default admin account configured in `.env` will be automatically seeded into the database on initial startup.

---

## 🚀 Deploy to Vercel (Free Tier)

This application is 100% pre-configured for free serverless hosting on Vercel using `vercel.json` and `connect-mongo`.

### Step 1: Set up MongoDB Atlas (Free Tier)
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and register for a free M0 cluster.
2. In **Database Access**, create a database user and password.
3. In **Network Access**, click **Add IP Address** and choose **Allow Access From Anywhere (`0.0.0.0/0`)**. *(This is required because Vercel serverless functions execute on dynamic IP pools).*
4. Click **Connect** &rarr; **Drivers** &rarr; Copy the connection string (e.g. `mongodb+srv://...`).

### Step 2: Push to GitHub
1. Initialize a git repository and commit your files:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of GL Bajaj Confessions"
   ```
2. Create a new repository on [GitHub](https://github.com/new).
3. Push your code:
   ```bash
   git remote add origin https://github.com/<your-username>/gl-bajaj-confessions.git
   git branch -M main
   git push -u origin main
   ```

### Step 3: Import & Deploy on Vercel
1. Log in to [Vercel](https://vercel.com/) and click **"Add New..." &rarr; "Project"**.
2. Select your GitHub repository and import it.
3. In the **Environment Variables** section, add the following 4 variables:
   - `MONGODB_URI` &rarr; Your MongoDB Atlas connection string.
   - `SESSION_SECRET` &rarr; A random secure string (e.g. `c748df928a3810...`).
   - `ADMIN_EMAIL` &rarr; Your desired admin email address (e.g. `admin@glbajaj.org`).
   - `ADMIN_PASSWORD` &rarr; A strong password for the admin portal.
4. Click **Deploy**.
5. Vercel will build and assign you a live `.vercel.app` URL.

---

## 🛡️ Anti-Abuse & Moderation Features

- **No Disposable Emails:** Blocklist of common temporary email providers.
- **DNS MX Validation:** Ensures domains actually receive mail before account creation.
- **Indian Mobile Validation:** Enforces 10-digit phone numbers starting with 6, 7, 8, or 9.
- **Rate Limiters:** 
  - Max 3 account registrations per IP per 24 hours.
  - Max 1 confession submission per 5 minutes per user.
- **Crowdsourced Auto-Hide:** If 3 students report a confession, it is automatically hidden from the public feed until an admin reviews it.
- **Banning System:** Banning a student records their email, mobile, and IP addresses to prevent re-registration under fake accounts.
