// Disposable local QA database. Never use this command to store personal data.
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
process.env.NODE_ENV = "test";
process.env.CLIENT_ORIGIN = "http://127.0.0.1:5173";
const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri();
const { connectDatabase } = await import("../src/config/database.js");
const { app } = await import("../src/app.js");
await connectDatabase();
const server = app.listen(4000, "127.0.0.1", () =>
  console.info(
    "Disposable QA API at http://127.0.0.1:4000. All QA data is removed when stopped.",
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      await mongoose.disconnect();
      await mongo.stop();
      process.exit(0);
    }),
  );
