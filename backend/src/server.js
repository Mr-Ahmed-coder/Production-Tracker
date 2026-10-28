import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
dotenv.config();

// Ensure NODE_ENV is set to production when running on cloud platforms like Render
if (process.env.RENDER === "true" && !process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

import mongoose from "mongoose";
import { app } from "./app.js";
import { connectDatabase } from "./config/database.js";

try {
  await connectDatabase();

  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.RENDER === "true" ||
    Boolean(process.env.RENDER_EXTERNAL_URL) ||
    Boolean(process.env.RENDER_SERVICE_ID);

  // In production / cloud environments, bind to 0.0.0.0 so the host container and Render port scanner can detect the open port.
  // In local development, fall back to 127.0.0.1.
  const host = process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");

  // Use process.env.PORT supplied by Render (or cloud host), falling back to 4000 locally.
  const port = Number(process.env.PORT) || 4000;

  const server = app.listen(port, host, () =>
    console.info(`StudyMomentum running at: http://${host}:${port}`),
  );

  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () =>
      server.close(async () => {
        await mongoose.disconnect();
        process.exit(0);
      }),
    );
} catch (err) {
  console.error(
    "API startup failed. Check your MongoDB configuration and connectivity.",
    err?.message || "",
  );
  process.exit(1);
}
