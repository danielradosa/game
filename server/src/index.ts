import { buildApp } from "./app.js"
import { loadEnv } from "./env.js"

async function main(): Promise<void> {
  const env = loadEnv()
  const app = await buildApp(env)
  await app.listen({ port: env.PORT, host: "0.0.0.0" })
}

main().catch((err) => {
  console.error("Failed to start server:", err)
  process.exit(1)
})
