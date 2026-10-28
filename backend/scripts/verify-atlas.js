import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
dotenv.config();

import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";

async function verify() {
  console.log("Connecting to configured database via connectDatabase()...");
  const start = Date.now();
  await connectDatabase();
  const elapsed = Date.now() - start;
  console.log(`Connected in ${elapsed}ms.`);

  const db = mongoose.connection.db;
  console.log("Database Name:", mongoose.connection.name);
  console.log("Host:", mongoose.connection.host);
  console.log("ReadyState:", mongoose.connection.readyState === 1 ? "Connected (1)" : mongoose.connection.readyState);

  const collections = await db.listCollections().toArray();
  console.log(`Collections (${collections.length}):`);
  for (const c of collections.sort((a, b) => a.name.localeCompare(b.name))) {
    const coll = db.collection(c.name);
    const count = await coll.countDocuments();
    const indexes = await coll.indexes();
    const indexNames = indexes.map((idx) => idx.name).join(", ");
    console.log(`  - ${c.name}: ${count} document(s) | Indexes: [${indexNames}]`);
  }

  await mongoose.disconnect();
  console.log("Verification completed successfully.");
}

verify().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
