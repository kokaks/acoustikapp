/**
 * Usage:
 *   DATABASE_URL=postgres://... npx ts-node scripts/seed-admin.ts <username> <password> <full name>
 */
import "dotenv/config";
import { pool } from "../src/db";
import { hashPassword } from "../src/auth";

async function main() {
  const [username, password, ...nameParts] = process.argv.slice(2);
  if (!username || !password || nameParts.length === 0) {
    console.error("Usage: seed-admin.ts <username> <password> <full name>");
    process.exit(1);
  }
  const fullName = nameParts.join(" ");
  const passwordHash = await hashPassword(password);

  await pool.query(
    `insert into employees (full_name, username, password_hash, role)
     values ($1, $2, $3, 'admin')
     on conflict (username) do update set password_hash = excluded.password_hash, role = 'admin'`,
    [fullName, username, passwordHash]
  );

  console.log(`Admin account ready: ${username}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
