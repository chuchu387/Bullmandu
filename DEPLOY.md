# Deployment Guide - Fly.io

This guide walks you through deploying your ShareAnalysis app to **Fly.io** (free tier, no credit card required).

---

## 📋 Prerequisites

- GitHub account
- Fly.io account (no credit card required for free tier)
- Your code pushed to GitHub

---

## 🚀 Deploy to Fly.io (Step-by-Step)

### Step 1: Install Fly CLI

```bash
# Linux/Mac
curl -L https://fly.io/install.sh | sh

# After installation, restart your terminal or run:
source ~/.flyrc
```

### Step 2: Sign Up (No Credit Card)

```bash
fly auth signup
```

- Use GitHub login (no card needed for free tier)
- Verify your email

### Step 3: Login

```bash
fly auth login
```

### Step 4: Deploy

```bash
# Deploy your app
fly launch

# When prompted:
# - Would you like to copy its configuration to the new app? → Yes
# - App Name → bullmandu (or your preferred name)
# - Select Organization → your personal org
# - Select region → sin (Singapore) or closest to you
# - Would you like to set up a Postgres database? → No
# - Would you like to set up a Redis database? → No
# - Would you like to deploy now? → Yes
```

Or deploy directly:

```bash
fly deploy
```

### Step 5: Open Your App

```bash
fly open
```

Your app will be live at: `https://bullmandu.fly.dev`

---

## ⚙️ Configuration Details

### fly.toml (Already Configured)

| Setting | Value |
|---------|-------|
| **App Name** | bullmandu |
| **Region** | sin (Singapore) |
| **Build Command** | `npm install && npx prisma generate && npm run build` |
| **Release Command** | `npx prisma db push && npm run seed` |
| **Internal Port** | 3000 |
| **VM Size** | shared-cpu-1x (256MB RAM) |
| **Database** | SQLite (1GB persistent volume) |

### Environment Variables

Set in `fly.toml`:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | SQLite database path |
| `JWT_SECRET` | JWT signing secret |
| `NEXT_PUBLIC_APP_URL` | Your app's public URL |
| `SEED_DEMO_USER_EMAIL` | Demo user email |
| `SEED_DEMO_USER_PASSWORD` | Demo user password |

---

## 🧪 Test Your Deployment

1. Visit `https://bullmandu.fly.dev`
2. Login with demo credentials:
   - **Email:** `demo@shareanalysis.app`
   - **Password:** `DemoPass123!`
3. Test the dashboard and features

---

## ⚠️ Important Notes

### Free Tier Limits

| Resource | Limit |
|----------|-------|
| **VMs** | 3 shared-cpu-1x (256MB each) |
| **Bandwidth** | 160GB/month |
| **Persistent Volume** | 3GB total |
| **Auto-stop** | Enabled (saves resources when idle) |

### Auto-stop Behavior

- Machines auto-stop after inactivity to save resources
- Auto-start on new requests (cold start ~5-10 seconds)
- To keep running 24/7: `fly scale count 1 --min-per-region 1`

### Database Persistence

- SQLite stored on persistent volume (`/app/prisma/data/prod.db`)
- Data survives restarts and redeploys
- Volume is region-locked

---

## 🛠️ Troubleshooting

### Check Logs

```bash
fly logs --recent
```

### SSH into Machine

```bash
fly ssh console
```

### Database Issues

Reset database (⚠️ deletes all data):

```bash
fly ssh console
rm prisma/data/prod.db
npx prisma db push
npm run seed
exit
```

### Redeploy After Changes

```bash
git push origin main
fly deploy
```

### App Won't Start

1. Check logs: `fly logs --recent`
2. SSH and debug: `fly ssh console`
3. Verify volume is mounted: `fly volumes list`

---

## 📈 Useful Commands

```bash
# View app status
fly status

# View logs
fly logs --recent

# Open app in browser
fly open

# SSH into machine
fly ssh console

# Restart app
fly restart

# Scale resources
fly scale count 1
fly scale memory 512

# View volumes
fly volumes list

# Deploy update
fly deploy
```

---

## 🔗 Useful Links

- [Fly.io Docs](https://fly.io/docs/)
- [Fly.io Pricing](https://fly.io/docs/about/pricing/)
- [Fly.io CLI Reference](https://fly.io/docs/flyctl/)
- [Next.js on Fly.io](https://fly.io/docs/languages/nextjs/)

---

**Need help?** Check Fly.io docs or community forums.
