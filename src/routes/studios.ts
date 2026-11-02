import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();

export const CATEGORIES = ["Photo Studio", "Film Stage", "Podcast Lounge", "Music Suite", "Workshop"] as const;

function parseId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function cleanStudio(body: any) {
  const errors: string[] = [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const num = (v: unknown) => (v === "" || v === null || v === undefined ? NaN : Number(v));
  const title = str(body.title);
  const category = str(body.category);
  const hourlyRate = num(body.hourlyRate);
  const securityDeposit = num(body.securityDeposit);
  const maxCapacity = num(body.maxCapacity);
  const location = str(body.location);
  const imageUrl = str(body.imageUrl);
  const overview = str(body.overview);
  const amenities = Array.isArray(body.amenities) ? body.amenities.map(str).filter(Boolean) : [];
  if (!title) errors.push("Title is required.");
  if (!(CATEGORIES as readonly string[]).includes(category)) errors.push("Please choose a valid category.");
  if (!(hourlyRate > 0)) errors.push("Hourly rate must be greater than 0.");
  if (!(securityDeposit >= 0)) errors.push("Security deposit must be 0 or more.");
  if (!(Number.isInteger(maxCapacity) && maxCapacity > 0)) errors.push("Max capacity must be a whole number above 0.");
  if (!location) errors.push("Location is required.");
  if (!/^https?:\/\//i.test(imageUrl)) errors.push("Image URL must start with http:// or https://.");
  if (!overview) errors.push("Detailed overview is required.");
  if (amenities.length === 0) errors.push("Select at least one amenity.");
  return {
    errors,
    data: { title, category, hourlyRate, securityDeposit, maxCapacity, location, imageUrl, amenities, overview },
  };
}

// List every studio (no pagination). Optional ?limit= for the home page, ?sort=top|newest.
router.get("/", async (req, res) => {
  const db = await getDb();
  const limit = Math.max(0, parseInt(String(req.query.limit ?? "0"), 10) || 0);
  const sort = req.query.sort === "top" ? { rating: -1, createdAt: -1 } : { createdAt: -1 };
  let cursor = db.collection("studios").find({}).sort(sort as any);
  if (limit) cursor = cursor.limit(limit);
  res.json(await cursor.toArray());
});

router.get("/mine", requireAuth, async (req, res) => {
  const db = await getDb();
  res.json(await db.collection("studios").find({ ownerEmail: req.user!.email }).sort({ createdAt: -1 }).toArray());
});

router.get("/:id", async (req, res) => {
  const _id = parseId(String(req.params.id));
  if (!_id) return res.status(404).json({ message: "Studio not found." });
  const db = await getDb();
  const studio = await db.collection("studios").findOne({ _id });
  if (!studio) return res.status(404).json({ message: "Studio not found." });
  res.json(studio);
});

router.post("/", requireAuth, async (req, res) => {
  const { errors, data } = cleanStudio(req.body ?? {});
  if (errors.length) return res.status(400).json({ message: errors[0], errors });
  const db = await getDb();
  const doc = {
    ...data,
    gallery: [data.imageUrl],
    rating: 0,
    reviews: [],
    ownerEmail: req.user!.email,
    ownerName: req.user!.name,
    ownerPhoto: req.user!.photoURL,
    createdAt: new Date(),
  };
  const result = await db.collection("studios").insertOne(doc);
  res.status(201).json({ _id: result.insertedId, ...doc });
});

router.put("/:id", requireAuth, async (req, res) => {
  const _id = parseId(String(req.params.id));
  if (!_id) return res.status(404).json({ message: "Studio not found." });
  const db = await getDb();
  const existing = await db.collection("studios").findOne({ _id });
  if (!existing) return res.status(404).json({ message: "Studio not found." });
  if (existing.ownerEmail !== req.user!.email) return res.status(403).json({ message: "You can only edit your own listings." });
  const { errors, data } = cleanStudio(req.body ?? {});
  if (errors.length) return res.status(400).json({ message: errors[0], errors });
  const gallery = Array.isArray(existing.gallery) && existing.gallery.length ? [...existing.gallery] : [data.imageUrl];
  if (existing.imageUrl !== data.imageUrl) gallery[0] = data.imageUrl;
  await db.collection("studios").updateOne({ _id }, { $set: { ...data, gallery, updatedAt: new Date() } });
  res.json({ message: "Studio updated." });
});

router.delete("/:id", requireAuth, async (req, res) => {
  const _id = parseId(String(req.params.id));
  if (!_id) return res.status(404).json({ message: "Studio not found." });
  const db = await getDb();
  const existing = await db.collection("studios").findOne({ _id });
  if (!existing) return res.status(404).json({ message: "Studio not found." });
  if (existing.ownerEmail !== req.user!.email) return res.status(403).json({ message: "You can only delete your own listings." });
  await db.collection("studios").deleteOne({ _id });
  res.json({ message: "Studio deleted." });
});

export default router;
