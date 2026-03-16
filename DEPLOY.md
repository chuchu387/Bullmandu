# Deployment Guide - Vercel + Turso (Free, No Credit Card)

This guide walks you through deploying your ShareAnalysis app to **Vercel** with **Turso** database (100% free, no credit card required).

---

## 📋 Prerequisites

- GitHub account
- Vercel account (free, no card)
- Turso account (free, no card)

---

## 🚀 Step-by-Step Deployment

### Step 1: Create Turso Database

1. **Install Turso CLI** (or use web dashboard):
   ```bash
   curl -sSf https://get.turso.sh | sh
   ```

2. **Sign up for Turso** (no card required):
   ```bash
   turso auth signup
   ```
   Or visit: https://turso.tech/app/signup

3. **Create a database**:
   ```bash
   turso db create bullmandu
   ```

4. **Get your database URL and token**:
   ```bash
   # Get database URL
   turso db show bullmandu --url
   
   # Create an auth token
   turso db tokens create bullmandu
   ```

5. **Combine into DATABASE_URL**:
   ```
   libsql://your-db-name.turso.io?authToken=your-token-here
   ```

### Step 2: Deploy to Vercel

1. **Go to Vercel**: https://vercel.com/new

2. **Import your GitHub repo**:
   - Click "Import Git Repository"
   - Select `chuchu387/Bullmandu`

3. **Configure Project**:
   - **Framework Preset**: Next.js (auto-detected)
   - **Build Command**: `npm install && npx prisma generate && npm run build`
   - **Output Directory**: `.next`

4. **Add Environment Variables**:
   Click "Environment Variables" and add:

   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | `libsql://your-db.turso.io?authToken=your-token` |
   | `JWT_SECRET` | `your-random-secret-string-min-32-chars` |
   | `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` |
   | `SEED_DEMO_USER_EMAIL` | `demo@shareanalysis.app` |
   | `SEED_DEMO_USER_PASSWORD` | `DemoPass123!` |

5. **Deploy**:
   - Click "Deploy"
   - Wait 2-5 minutes

### Step 3: Initialize Database

After first deploy, run the seed command:

1. Go to Vercel Dashboard → Your Project
2. Click **"Settings"** → **"Deployment Protection"**
3. Or use Vercel CLI:
   ```bash
   npm i -g vercel
   vercel login
   vercel link
   vercel env pull
   ```

4. **Run database migration**:
   ```bash
   # In Vercel dashboard → Settings → Deployment Logs
   # Or locally with Vercel CLI:
   vercel env pull
   npx prisma db push
   npx run seed
   ```

### Step 4: Open Your App

Your app will be live at: `https://bullmandu.vercel.app`

---

## ⚙️ Configuration Details

### vercel.json

```json
{
  "buildCommand": "npm install && npx prisma generate && npm run build",
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```

### prisma/schema.prisma

Uses `libsql` provider for Turso compatibility:

```prisma
datasource db {
  provider = "libsql"
  url      = env("DATABASE_URL")
}
```

---

## 🧪 Test Your Deployment

1. Visit your Vercel URL
2. Login with demo credentials:
   - **Email:** `demo@shareanalysis.app`
   - **Password:** `DemoPass123!`

---

## ⚠️ Important Notes

### Free Tier Limits

| Service | Free Limit |
|---------|------------|
| **Vercel** | 100GB bandwidth/month, Unlimited deployments |
| **Turso** | 1GB storage, 1 billion read rows/month, 50M write rows/month |

### Cold Starts

- Vercel Serverless Functions: No cold starts for active apps
- First deploy may take 3-5 minutes

### Database Persistence

- Turso stores data in the cloud (not serverless filesystem)
- Data persists across deployments
- Automatic backups included

---

## 🛠️ Troubleshooting

### Build Fails

Check Vercel deploy logs:
- Go to Vercel Dashboard → Your Project → Deployments
- Click on latest deployment → View logs

Common issues:
- **Missing env vars**: Add all required environment variables
- **Prisma errors**: Ensure `DATABASE_URL` is correct Turso format

### Database Connection Error

1. Verify `DATABASE_URL` format:
   ```
   libsql://db-name.turso.io?authToken=token-here
   ```

2. Test connection locally:
   ```bash
   npx prisma db push
   ```

### "Table does not exist" Error

Run database migration:
```bash
npx prisma db push
npm run seed
```

In Vercel, do this via:
- Vercel CLI: `vercel env pull` then run commands locally
- Or add a post-deploy script

---

## 📈 Useful Commands

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link project
vercel link

# Deploy
vercel --prod

# Pull environment variables
vercel env pull

# Check logs
vercel logs
```

---

## 🔗 Useful Links

- [Vercel Docs](https://vercel.com/docs)
- [Vercel Pricing](https://vercel.com/pricing)
- [Turso Docs](https://docs.turso.tech)
- [Turso Pricing](https://turso.tech/pricing)
- [Prisma + Turso Guide](https://docs.turso.tech/get-started/quickstart)

---

**Need help?** Check Vercel or Turso docs, or open an issue in your repo.
