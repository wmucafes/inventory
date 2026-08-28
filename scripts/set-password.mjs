// Usage: node scripts/set-password.mjs <email> <password> <database_url>
// Example: node scripts/set-password.mjs benwin.george@wmich.edu MyPassword123 "postgresql://..."
import bcrypt from "bcryptjs";
import pg from "pg";

const [email, password, databaseUrl] = process.argv.slice(2);
process.env.DATABASE_URL = databaseUrl || process.env.DATABASE_URL;

if (!email || !password) {
  console.error("Usage: node scripts/set-password.mjs <email> <password>");
  process.exit(1);
}

if (password.length < 6) {
  console.error("Password must be at least 6 characters.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const hash = await bcrypt.hash(password, 12);
const result = await pool.query(
  `UPDATE user_roles SET password_hash = $1 WHERE email = $2 RETURNING email`,
  [hash, email.trim().toLowerCase()],
);

if (result.rowCount === 0) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}

console.log(`✓ Password set for ${email}`);
await pool.end();
