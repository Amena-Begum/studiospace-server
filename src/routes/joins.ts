import { Router } from "express";
import { getDb } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();

// Every event the logged-in user has joined, soonest event date first.
router.get("/mine", requireAuth, async (req, res) => {
  const db = await getDb();
  const joins = await db.collection("joins").find({ userEmail: req.user!.email }).sort({ eventDate: 1, joinedAt: 1 }).toArray();
  res.json({ joins });
});

export default router;
