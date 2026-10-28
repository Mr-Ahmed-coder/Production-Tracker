import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import dns from "node:dns";
import mongoose from "mongoose";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
dns.setServers(["8.8.8.8", "1.1.1.1"]);

async function compare() {
  const localConn = await mongoose.createConnection("mongodb://127.0.0.1:27017/prodtrack").asPromise();
  const atlasConn = await mongoose.createConnection(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 12000 }).asPromise();

  const collections = [
    "users",
    "sessions",
    "tasks",
    "notes",
    "goals",
    "habits",
    "habitcompletions",
    "focussessions",
    "productivitysettings",
    "dailyreviews",
  ];

  console.log("-----------------------------------------------------------------");
  console.log("Collection            | Local MongoDB (prodtrack) | Atlas (production)");
  console.log("-----------------------------------------------------------------");
  for (const c of collections) {
    const localCount = await localConn.db.collection(c).countDocuments().catch(() => 0);
    const atlasCount = await atlasConn.db.collection(c).countDocuments().catch(() => 0);
    console.log(
      `${c.padEnd(21)} | ${String(localCount).padEnd(25)} | ${String(atlasCount)}`
    );
  }
  console.log("-----------------------------------------------------------------");

  await localConn.close();
  await atlasConn.close();
}

compare().catch((err) => {
  console.error("Comparison error:", err.message);
  process.exit(1);
});
