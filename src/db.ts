import { MongoClient, Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(process.env.DB_NAME || "studiospace");
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("events").createIndex({ eventDate: 1 }),
    db.collection("events").createIndex({ creatorEmail: 1 }),
    db.collection("joins").createIndex({ eventId: 1, userEmail: 1 }, { unique: true }),
    db.collection("joins").createIndex({ userEmail: 1, eventDate: 1 }),
  ]);
  return db;
}
