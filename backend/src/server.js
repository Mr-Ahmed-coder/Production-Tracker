import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
dotenv.config();
import mongoose from "mongoose";
import { app } from "./app.js";
import { connectDatabase } from "./config/database.js";
try {
  await connectDatabase();
  const host =
    process.env.HOST ||
    (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
  const port = process.env.PORT || 4000;
  const server = app.listen(port, host, () =>
    console.info(
      `StudyMomentum running at: http://${host === "0.0.0.0" ? "localhost" : host}:${port}`,
    ),
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
