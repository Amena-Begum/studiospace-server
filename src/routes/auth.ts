import { Router } from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { getDb } from "../db.js";
import { clearToken, issueToken, readUser, requireAuth } from "../auth.js";

const router = Router();
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z]).{6,}$/;
const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/register", async (req, res) => {
  const { name, email, photoURL, password } = req.body ?? {};
  if (![name, email, photoURL, password].every((v) => typeof v === "string" && v.trim()))
    return res.status(400).json({ message: "Name, email, photo URL and password are all required." });
  if (!EMAIL_RULE.test(email)) return res.status(400).json({ message: "Please enter a valid email address." });
  if (!/^https?:\/\//i.test(photoURL)) return res.status(400).json({ message: "Photo URL must start with http:// or https://." });
  if (!PASSWORD_RULE.test(password))
    return res.status(400).json({ message: "Password needs an uppercase letter, a lowercase letter and at least 6 characters." });
  const db = await getDb();
  const normalised = email.trim().toLowerCase();
  if (await db.collection("users").findOne({ email: normalised }))
    return res.status(409).json({ message: "An account with this email already exists." });
  await db.collection("users").insertOne({
    name: name.trim(),
    email: normalised,
    photoURL: photoURL.trim(),
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date(),
  });
  res.status(201).json({ message: "Registration successful. Please log in." });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string")
    return res.status(400).json({ message: "Email and password are required." });
  const db = await getDb();
  const user = await db.collection("users").findOne({ email: email.trim().toLowerCase() });
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ message: "Incorrect email or password." });
  const payload = { email: user.email, name: user.name, photoURL: user.photoURL };
  issueToken(res, payload);
  res.json({ user: payload });
});

router.post("/google", async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const { credential } = req.body ?? {};
  if (!clientId) return res.status(503).json({ message: "Google sign-in is not configured yet." });
  if (typeof credential !== "string") return res.status(400).json({ message: "Missing Google credential." });
  try {
    const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken: credential, audience: clientId });
    const p = ticket.getPayload();
    if (!p?.email || !p.email_verified) return res.status(401).json({ message: "Google account email is not verified." });
    const db = await getDb();
    const email = p.email.toLowerCase();
    const name = p.name || email.split("@")[0];
    const photoURL = p.picture || "";
    await db.collection("users").updateOne(
      { email },
      { $setOnInsert: { email, name, photoURL, createdAt: new Date() } },
      { upsert: true },
    );
    const user = await db.collection("users").findOne({ email });
    const payload = { email, name: user?.name ?? name, photoURL: user?.photoURL ?? photoURL };
    issueToken(res, payload);
    res.json({ user: payload });
  } catch {
    res.status(401).json({ message: "Google sign-in failed. Please try again." });
  }
});

router.get("/me", (req, res) => {
  const user = readUser(req);
  if (!user) return res.status(401).json({ message: "Not logged in." });
  res.json({ user });
});

router.post("/logout", requireAuth, (_req, res) => {
  clearToken(res);
  res.json({ message: "Logged out." });
});

export default router;
