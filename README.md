# ShareAnalysis

ShareAnalysis is a production-oriented NEPSE stock analysis platform built with Next.js, TypeScript, Tailwind CSS, Prisma, SQLite, and a mock-friendly market data abstraction layer.

This analysis is for educational and informational purposes only and should not be treated as guaranteed investment advice.

## Features

- Secure register/login flow with signed JWT session cookies and bcrypt password hashing
- Dashboard with top gainers, top losers, trending stocks, recent analyses, recommendation distribution, and watchlist summary
- NEPSE stock analysis page with historical chart, future prediction chart, technical indicators, timeframe estimate, target price, rupee move, risk note, and clear explanations
- Watchlist and prediction history backed by SQLite through Prisma
- Market data provider abstraction designed for future NEPSE API integration
- Unit, API, auth, and UI smoke tests with Vitest and React Testing Library

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- SQLite
- Prisma ORM
- Custom JWT auth with `jose`
- Recharts
- Zod
- Vitest + React Testing Library

## Project Structure

```text
shareanalysis-app/
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.ts
├─ public/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/
│  │  │  ├─ login/page.tsx
│  │  │  └─ register/page.tsx
│  │  ├─ (dashboard)/
│  │  │  ├─ analysis/page.tsx
│  │  │  ├─ dashboard/page.tsx
│  │  │  ├─ history/page.tsx
│  │  │  ├─ market/page.tsx
│  │  │  ├─ profile/page.tsx
│  │  │  ├─ stocks/[symbol]/page.tsx
│  │  │  ├─ watchlist/page.tsx
│  │  │  └─ layout.tsx
│  │  ├─ api/
│  │  │  ├─ analysis/[symbol]/route.ts
│  │  │  ├─ auth/
│  │  │  │  ├─ login/route.ts
│  │  │  │  ├─ logout/route.ts
│  │  │  │  ├─ me/route.ts
│  │  │  │  └─ register/route.ts
│  │  │  ├─ history/route.ts
│  │  │  ├─ stocks/
│  │  │  │  ├─ [symbol]/route.ts
│  │  │  │  └─ search/route.ts
│  │  │  └─ watchlist/
│  │  │     ├─ [symbol]/route.ts
│  │  │     └─ route.ts
│  │  ├─ globals.css
│  │  ├─ layout.tsx
│  │  └─ page.tsx
│  ├─ components/
│  │  ├─ charts/
│  │  ├─ dashboard/
│  │  ├─ forms/
│  │  ├─ layout/
│  │  └─ stocks/
│  ├─ lib/
│  │  ├─ analysis/
│  │  ├─ auth/
│  │  ├─ data/
│  │  ├─ validations/
│  │  ├─ db.ts
│  │  ├─ server-data.ts
│  │  └─ utils.ts
│  └─ types/
├─ tests/
├─ middleware.ts
├─ next.config.ts
├─ package.json
└─ vitest.config.ts
```

## Environment Variables

Create `.env` from `.env.example`.

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="replace-with-a-long-random-string"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
SEED_DEMO_USER_EMAIL="demo@shareanalysis.app"
SEED_DEMO_USER_PASSWORD="DemoPass123!"
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Apply the Prisma schema:

```bash
npx prisma db push
```

3. Seed demo data:

```bash
npm run seed
```

4. Start development:

```bash
npm run dev
```

## Demo Credentials

- Email: `demo@shareanalysis.app`
- Password: `DemoPass123!`

## Testing

```bash
npm test
```

## Analysis Engine Notes

- Indicators: SMA, EMA, RSI, MACD, Bollinger Bands, support/resistance, momentum, volume trend, volatility, and trend slope
- Recommendation engine: weighted score mapped to Strong Buy / Buy / Hold / Sell / Strong Sell
- Forecasting approach: moving average trend projection, regression slope, resistance-aware target adjustment, confidence scoring, and timeframe bucketing
- Data layer: currently seeded/mock-backed, but isolated behind a provider for future NEPSE live API replacement

## Deployment

This repository is configured for Render because it currently uses SQLite. A ready-to-use [render.yaml](./render.yaml) is included.

### Render requirements

1. Push the repository to GitHub.
2. Create a new Render Web Service from this repository.
3. Use the included blueprint or match these settings manually:

```yaml
buildCommand: npm install && npx prisma generate && npm run build
startCommand: npx prisma db push && npm run seed && npx next start -H 0.0.0.0 -p $PORT
healthCheckPath: /login
```

4. Add a persistent disk mounted at:

```text
/opt/render/project/src/prisma/data
```

5. Set these environment variables:

```env
DATABASE_URL="file:./data/prod.db"
JWT_SECRET="<long-random-secret>"
NEXT_PUBLIC_APP_URL="https://your-service-name.onrender.com"
SEED_DEMO_USER_EMAIL="demo@shareanalysis.app"
SEED_DEMO_USER_PASSWORD="DemoPass123!"
```

### Why Render

- SQLite needs persistent filesystem storage.
- Render supports persistent disks for Node services.
- Vercel is not a good fit for this repository unless the database is migrated away from SQLite.

## Assumptions

- Mock NEPSE data is included because live exchange integration is intentionally abstracted for later replacement.
- Prediction outputs are explainable heuristics rather than black-box guarantees.
- Historical success/failure comparison logic can be deepened once a live market data archive is connected.

## Run Commands

```bash
npm install
npx prisma db push
npm run seed
npm run dev
```

## Production Commands

```bash
npm install
npx prisma generate
npm run build
npm run start
```
