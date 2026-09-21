import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL env var is required.");
}

// Neon requires SSL; local dev (Mac mini / docker-compose postgres) does not.
// Controlled explicitly via PGSSL so moving between environments is just an
// env var change, not a code change.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Unexpected error on idle Postgres client", err);
});
