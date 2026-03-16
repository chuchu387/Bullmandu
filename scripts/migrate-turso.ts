// Direct database migration script for Turso
import { createClient } from '@libsql/client'

const tursoUrl = 'libsql://bullmandu-chuchu387.aws-ap-south-1.turso.io'
const authToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzM2NTU3NTQsImlkIjoiMDE5Y2Y2MWUtMGYwMS03ZDQ1LWEzMjAtZWIxNWQzZTVjZmJjIiwicmlkIjoiZDk5MWZmYTQtNjQxMC00YzFlLWFmOGItZTAwZGJkZTU5MDRhIn0.fHqYyitOmgeNSTfM0-iZ10j7C2gDBonDisqLLF0P6VlMF1yZGXONr2ZxN_ECbxMAovC5iIagU2Pn2XMlxVIPCQ'

const client = createClient({
  url: tursoUrl,
  authToken: authToken,
})

const tables = `
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "WatchlistItem" (
  "id" TEXT PRIMARY KEY,
  "symbol" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  UNIQUE ("userId", "symbol")
);

CREATE TABLE IF NOT EXISTS "AnalysisHistory" (
  "id" TEXT PRIMARY KEY,
  "symbol" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "recommendation" TEXT NOT NULL,
  "currentPrice" REAL NOT NULL,
  "predictedPrice" REAL NOT NULL,
  "expectedChange" REAL NOT NULL,
  "rupeeMove" REAL NOT NULL,
  "confidence" REAL NOT NULL,
  "timeframeLabel" TEXT NOT NULL,
  "estimatedTargetDate" DATETIME,
  "riskNote" TEXT NOT NULL,
  "simpleExplanation" TEXT NOT NULL,
  "advancedExplanation" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "LivePriceSnapshot" (
  "id" TEXT PRIMARY KEY,
  "symbol" TEXT NOT NULL,
  "price" REAL NOT NULL,
  "previousClose" REAL NOT NULL,
  "volume" REAL NOT NULL,
  "source" TEXT NOT NULL,
  "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tradingDay" TEXT NOT NULL,
  "bucketLabel" TEXT NOT NULL,
  UNIQUE ("symbol", "tradingDay", "bucketLabel", "source")
);

CREATE INDEX IF NOT EXISTS "LivePriceSnapshot_symbol_capturedAt_idx" ON "LivePriceSnapshot"("symbol", "capturedAt");
`

async function runMigration() {
  try {
    console.log('Connecting to Turso...')
    await client.execute('SELECT 1')
    console.log('Connected successfully!')
    
    console.log('Creating tables...')
    const statements = tables.split(';').filter(s => s.trim())
    for (const stmt of statements) {
      if (stmt.trim()) {
        await client.execute(stmt)
      }
    }
    console.log('Tables created successfully!')
    
    console.log('Migration complete!')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await client.close()
  }
}

runMigration()
