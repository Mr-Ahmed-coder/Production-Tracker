import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "../src/config/database.js";
import { runEmailWorker } from "../src/email/worker.js";
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
dotenv.config({ quiet: true });
try {
  await connectDatabase();
  const stats = await runEmailWorker({
    dryRun: !process.argv.includes("--send"),
  });
  console.info(JSON.stringify({ service: "email-reminders", ...stats }));
  if (stats.failed || stats.retry || stats.uncertain) process.exitCode = 1;
} catch {
  console.error(
    "Email worker failed. Check configuration and database connectivity. No request bodies or credentials are logged.",
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
