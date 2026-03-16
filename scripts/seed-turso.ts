// Seed script for Turso database
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'

const tursoUrl = 'libsql://bullmandu-chuchu387.aws-ap-south-1.turso.io'
const authToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzM2NTU3NTQsImlkIjoiMDE5Y2Y2MWUtMGYwMS03ZDQ1LWEzMjAtZWIxNWQzZTVjZmJjIiwicmlkIjoiZDk5MWZmYTQtNjQxMC00YzFlLWFmOGItZTAwZGJkZTU5MDRhIn0.fHqYyitOmgeNSTfM0-iZ10j7C2gDBonDisqLLF0P6VlMF1yZGXONr2ZxN_ECbxMAovC5iIagU2Pn2XMlxVIPCQ'

const client = createClient({
  url: tursoUrl,
  authToken: authToken,
})

const demoEmail = 'demo@shareanalysis.app'
const demoPassword = 'DemoPass123!'

async function seed() {
  try {
    console.log('Connecting to Turso...')
    await client.execute('SELECT 1')
    console.log('Connected successfully!')
    
    // Check if demo user exists
    const existing = await client.execute(
      'SELECT id FROM "User" WHERE email = ?',
      [demoEmail]
    )
    
    if (existing.rows.length > 0) {
      console.log('Demo user already exists, skipping...')
      return
    }
    
    // Hash password
    console.log('Creating demo user...')
    const passwordHash = await bcrypt.hash(demoPassword, 10)
    
    await client.execute(
      `INSERT INTO "User" (id, name, email, "passwordHash", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      ['demo_user_1', 'Demo User', demoEmail, passwordHash]
    )
    
    console.log('✅ Demo user created successfully!')
    console.log(`   Email: ${demoEmail}`)
    console.log(`   Password: ${demoPassword}`)
  } catch (error) {
    console.error('Seed failed:', error)
    process.exit(1)
  } finally {
    await client.close()
  }
}

seed()
