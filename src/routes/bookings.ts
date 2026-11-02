import { Router } from "express";
import { ObjectId, type Db } from "mongodb";
import { getDb } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
const toMinutes = (t: string) => {
  if (t === "24:00") return 1440; // end of day
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

// A new slot collides with a Confirmed booking when the intervals overlap on the same studio and date.
async function findCollision(db: Db, studioId: string, date: string, startMin: number, endMin: number, ignoreId?: ObjectId) {
  const query: Record<string, unknown> = {
    studioId,
    date,
    status: "Confirmed",
    startMin: { $lt: endMin },
    endMin: { $gt: startMin },
  };
  if (ignoreId) query._id = { $ne: ignoreId };
  return db.collection("bookings").findOne(query);
}

const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

router.post("/", requireAuth, async (req, res) => {
  const { studioId, date, startTime, endTime, note } = req.body ?? {};
  if (typeof studioId !== "string" || !ObjectId.isValid(studioId)) return res.status(400).json({ message: "Invalid studio." });
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: "Please pick a booking date." });
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) return res.status(400).json({ message: "You cannot book a date in the past." });
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  if (Number.isNaN(startMin) || Number.isNaN(endMin)) return res.status(400).json({ message: "Please choose a start and end time." });
  if (endMin <= startMin) return res.status(400).json({ message: "End time must be after the start time." });
  if ((endMin - startMin) % 60 !== 0) return res.status(400).json({ message: "Bookings must be in whole hours." });
  const db = await getDb();
  const studio = await db.collection("studios").findOne({ _id: new ObjectId(studioId) });
  if (!studio) return res.status(404).json({ message: "Studio not found." });
  if (studio.ownerEmail === req.user!.email) return res.status(400).json({ message: "You cannot book your own studio." });
  const clash = await findCollision(db, studioId, date, startMin, endMin);
  if (clash)
    return res.status(409).json({
      message: `This slot overlaps a confirmed booking (${fmt(clash.startMin)}–${fmt(clash.endMin)} on ${date}). Please choose another time.`,
    });
  const hours = (endMin - startMin) / 60;
  const doc = {
    studioId,
    studioTitle: studio.title,
    studioImage: studio.imageUrl,
    studioLocation: studio.location,
    hostEmail: studio.ownerEmail,
    userEmail: req.user!.email,
    userName: req.user!.name,
    date,
    startTime,
    endTime,
    startMin,
    endMin,
    hours,
    hourlyRate: studio.hourlyRate,
    total: hours * studio.hourlyRate,
    securityDeposit: studio.securityDeposit,
    note: typeof note === "string" ? note.trim().slice(0, 300) : "",
    status: "Pending",
    createdAt: new Date(),
  };
  const result = await db.collection("bookings").insertOne(doc);
  res.status(201).json({ _id: result.insertedId, ...doc });
});

// Bookings I made (asGuest) and booking requests on studios I host (asHost).
router.get("/mine", requireAuth, async (req, res) => {
  const db = await getDb();
  const email = req.user!.email;
  const [asGuest, asHost] = await Promise.all([
    db.collection("bookings").find({ userEmail: email }).sort({ createdAt: -1 }).toArray(),
    db.collection("bookings").find({ hostEmail: email }).sort({ createdAt: -1 }).toArray(),
  ]);
  res.json({ asGuest, asHost });
});

const HOST_ACTIONS: Record<string, { from: string[]; to: string }> = {
  confirm: { from: ["Pending"], to: "Confirmed" },
  cancel: { from: ["Pending", "Confirmed"], to: "Cancelled" },
  complete: { from: ["Confirmed"], to: "Completed" },
};

router.patch("/:id/status", requireAuth, async (req, res) => {
  if (!ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: "Booking not found." });
  const _id = new ObjectId(String(req.params.id));
  const db = await getDb();
  const booking = await db.collection("bookings").findOne({ _id });
  if (!booking) return res.status(404).json({ message: "Booking not found." });
  const action = String(req.body?.action ?? "");
  const email = req.user!.email;

  // Guests may only cancel their own pending bookings.
  if (action === "cancel" && booking.userEmail === email && booking.hostEmail !== email) {
    if (booking.status !== "Pending") return res.status(400).json({ message: "Only pending bookings can be cancelled by the guest." });
    await db.collection("bookings").updateOne({ _id }, { $set: { status: "Cancelled", updatedAt: new Date() } });
    return res.json({ status: "Cancelled" });
  }

  if (booking.hostEmail !== email) return res.status(403).json({ message: "You are not allowed to change this booking." });
  const rule = HOST_ACTIONS[action];
  if (!rule) return res.status(400).json({ message: "Unknown action." });
  if (!rule.from.includes(booking.status))
    return res.status(400).json({ message: `A ${booking.status.toLowerCase()} booking cannot be ${rule.to.toLowerCase()}.` });
  if (action === "confirm") {
    // Re-run the overlap check at confirmation time: another booking may have been confirmed since this was requested.
    const clash = await findCollision(db, booking.studioId, booking.date, booking.startMin, booking.endMin, _id);
    if (clash)
      return res.status(409).json({
        message: `Cannot confirm: it overlaps another confirmed booking (${fmt(clash.startMin)}–${fmt(clash.endMin)} on ${booking.date}).`,
      });
  }
  await db.collection("bookings").updateOne({ _id }, { $set: { status: rule.to, updatedAt: new Date() } });
  res.json({ status: rule.to });
});

export default router;
