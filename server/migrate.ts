// Runner de migrations versionadas (drizzle-orm migrator).
// Usa archivos SQL en ./migrations generados por `drizzle-kit generate`.
// Idempotente: cada migration aplicada se registra en __drizzle_migrations.
//
// Comando: npm run db:migrate
//
// Para crear una nueva migration tras editar shared/schema.ts:
//   npm run db:generate -- --name=<short_description>
// Revisa el SQL generado en ./migrations, luego:
//   npm run db:migrate

import "dotenv/config";
import "./env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { logger } from "./logger";

async function main() {
  if (!process.env.DATABASE_URL) {
    logger.error("DATABASE_URL no definida");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const db = drizzle(pool);

  logger.info("[migrate] aplicando migrations desde ./migrations ...");
  await migrate(db, { migrationsFolder: "./migrations" });
  logger.info("[migrate] OK");

  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, "[migrate] falló");
  process.exit(1);
});
