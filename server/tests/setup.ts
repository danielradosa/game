import "dotenv/config"

// Default to a separate test DB if not explicitly set. CI / dev should
// point DATABASE_URL_TEST at a dedicated test database.
if (!process.env.DATABASE_URL && process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST
}
process.env.NODE_ENV = "test"
process.env.ARGON2_PEPPER ||= "test-pepper-not-for-prod-aGFzaC1tZS1wbGVhc2U="
process.env.CORS_ORIGIN ||= "http://localhost:5173"
process.env.DATABASE_URL ||= "postgres://drift:drift@localhost:5433/drift_test"
