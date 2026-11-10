import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db.js";
import { requireAuth } from "../auth.js";
import { isValidISODate, todayISO } from "../dates.js";

const router = Router();

export const EVENT_TYPES = ["Cleanup", "Plantation", "Donation", "Food Drive", "Blood Donation", "Education", "Health Camp", "Other"] as const;

function parseId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function cleanEvent(body: any, opts: { requireFuture: boolean }) {
  const errors: string[] = [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const title = str(body?.title);
  const description = str(body?.description);
  const eventType = str(body?.eventType);
  const thumbnail = str(body?.thumbnail);
  const location = str(body?.location);
  const eventDate = str(body?.eventDate);
  if (title.length < 5) errors.push("Title must be at least 5 characters.");
  if (description.length < 20) errors.push("Description must be at least 20 characters.");
  if (!(EVENT_TYPES as readonly string[]).includes(eventType)) errors.push("Please choose a valid event type.");
  if (!/^https?:\/\/\S+$/i.test(thumbnail)) errors.push("Thumbnail must be a valid image URL starting with http:// or https://.");
  if (location.length < 3) errors.push("Location is required.");
  if (!isValidISODate(eventDate)) errors.push("Please choose a valid event date.");
  else if (opts.requireFuture && eventDate <= todayISO()) errors.push("Event date must be in the future.");
  return { errors, data: { title, description, eventType, thumbnail, location, eventDate } };
}

// Public: upcoming events only, soonest first. ?limit= caps the list (the home page asks for 6).
router.get("/", async (req, res) => {
  const db = await getDb();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? ""), 10) || 0, 0), 100);
  const cursor = db.collection("events").find({ eventDate: { $gte: todayISO() } }).sort({ eventDate: 1, createdAt: 1 });
  if (limit) cursor.limit(limit);
  res.json({ events: await cursor.toArray() });
});

router.get("/mine", requireAuth, async (req, res) => {
  const db = await getDb();
  const events = await db.collection("events").find({ creatorEmail: req.user!.email }).sort({ eventDate: 1 }).toArray();
  const counts = await db
    .collection("joins")
    .aggregate([{ $match: { eventId: { $in: events.map((e) => e._id) } } }, { $group: { _id: "$eventId", n: { $sum: 1 } } }])
    .toArray();
  const byId = new Map(counts.map((c) => [String(c._id), c.n as number]));
  res.json({ events: events.map((e) => ({ ...e, participants: byId.get(String(e._id)) ?? 0 })) });
});

router.get("/:id", async (req, res) => {
  const _id = parseId(String(req.params.id));
  if (!_id) return res.status(404).json({ message: "Event not found." });
  const db = await getDb();
  const event = await db.collection("events").findOne({ _id });
  if (!event) return res.status(404).json({ message: "Event not found." });
  const participants = await db.collection("joins").countDocuments({ eventId: _id });
  res.json({ event: { ...event, participants } });
});

router.post("/", requireAuth, async (req, res) => {
  const { errors, data } = cleanEvent(req.body, { requireFuture: true });
  if (errors.length) return res.status(400).json({ message: errors[0], errors });
  const db = await getDb();
  const doc = { ...data, creatorEmail: req.user!.email, creatorName: req.user!.name, createdAt: new Date() };
  const r = await db.collection("events").insertOne(doc);
  res.status(201).json({ event: { _id: r.insertedId, ...doc } });
});

router.put("/:id", requireAuth, async (req, res) => {
  const _id = parseId(String(req.params.id));
  if (!_id) return res.status(404).json({ message: "Event not found." });
  const db = await getDb();
  const existing = await db.collection("events").findOne({ _id });
  if (!existing) return res.status(404).json({ message: "Event not found." });
  if (existing.creatorEmail !== req.user!.email) return res.status(403).json({ message: "You can only update events you created." });
  // The future-date rule only applies when the date is actually being changed.
  const dateChanged = typeof req.body?.eventDate === "string" && req.body.eventDate.trim() !== existing.eventDate;
  const { errors, data } = cleanEvent(req.body, { requireFuture: dateChanged });
  if (errors.length) return res.status(400).json({ message: errors[0], errors });
  await db.collection("events").updateOne({ _id }, { $set: { ...data, updatedAt: new Date() } });
  // Keep the copy stored with each join in step with the event.
  await db.collection("joins").updateMany({ eventId: _id }, { $set: { title: data.title, eventType: data.eventType, thumbnail: data.thumbnail, location: data.location, eventDate: data.eventDate } });
  res.json({ event: { ...existing, ...data } });
});

router.delete("/:id", requireAuth, async (req, res) => {
  const _id = parseId(String(req.params.id));
  if (!_id) return res.status(404).json({ message: "Event not found." });
  const db = await getDb();
  const existing = await db.collection("events").findOne({ _id });
  if (!existing) return res.status(404).json({ message: "Event not found." });
  if (existing.creatorEmail !== req.user!.email) return res.status(403).json({ message: "You can only delete events you created." });
  await db.collection("events").deleteOne({ _id });
  await db.collection("joins").deleteMany({ eventId: _id });
  res.json({ message: "Event deleted." });
});

// Join an event: stores the event and user data together; one join per person per event.
router.post("/:id/join", requireAuth, async (req, res) => {
  const _id = parseId(String(req.params.id));
  if (!_id) return res.status(404).json({ message: "Event not found." });
  const db = await getDb();
  const event = await db.collection("events").findOne({ _id });
  if (!event) return res.status(404).json({ message: "Event not found." });
  if (event.eventDate < todayISO()) return res.status(400).json({ message: "This event has already taken place." });
  const user = req.user!;
  try {
    await db.collection("joins").insertOne({
      eventId: _id,
      title: event.title,
      eventType: event.eventType,
      thumbnail: event.thumbnail,
      location: event.location,
      eventDate: event.eventDate,
      creatorEmail: event.creatorEmail,
      userEmail: user.email,
      userName: user.name,
      userPhoto: user.photoURL,
      joinedAt: new Date(),
    });
  } catch (err: any) {
    if (err?.code === 11000) return res.status(409).json({ message: "You have already joined this event." });
    throw err;
  }
  res.status(201).json({ message: "You have joined this event." });
});

router.get("/:id/joined", requireAuth, async (req, res) => {
  const _id = parseId(String(req.params.id));
  if (!_id) return res.json({ joined: false });
  const db = await getDb();
  res.json({ joined: Boolean(await db.collection("joins").findOne({ eventId: _id, userEmail: req.user!.email })) });
});

export default router;
