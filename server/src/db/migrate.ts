import "dotenv/config"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("DATABASE_URL not set")
    process.exit(1)
  }
  const client = postgres(url, { max: 1 })
  const db = drizzle(client)
  await migrate(db, { migrationsFolder: "./drizzle" })
  await client.end()
  console.log("Migrations applied")
}

main().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
