import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
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

// GitHub sign-in. The client proxies /api/* to this server, so GitHub redirects back to the client origin
// and the session cookie stays first-party.
const STATE_COOKIE = "mohalla_oauth_state";
const clientOrigin = () => (process.env.CLIENT_URL || "http://localhost:3000").split(",")[0].trim().replace(/\/$/, "");
const failTo = (res: Response, code: string) => res.redirect(`${clientOrigin()}/login?error=${code}`);

router.get("/github", (req, res) => {
  const id = process.env.GITHUB_CLIENT_ID;
  if (!id || !process.env.GITHUB_CLIENT_SECRET) return failTo(res, "github_not_configured");
  const next = typeof req.query.next === "string" && req.query.next.startsWith("/") && !req.query.next.startsWith("//") ? req.query.next : "/";
  const state = randomBytes(16).toString("hex");
  res.cookie(STATE_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/",
  });
  const q = new URLSearchParams({
    client_id: id,
    redirect_uri: `${clientOrigin()}/api/auth/github/callback`,
    scope: "read:user user:email",
    state,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${q}`);
});

router.get("/github/callback", async (req, res) => {
  const id = process.env.GITHUB_CLIENT_ID;
  const secret = process.env.GITHUB_CLIENT_SECRET;
  if (!id || !secret) return failTo(res, "github_not_configured");
  let saved: { state: string; next: string } | null = null;
  try {
    saved = JSON.parse(req.cookies?.[STATE_COOKIE] ?? "null");
  } catch {
    saved = null;
  }
  res.clearCookie(STATE_COOKIE, { path: "/" });
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!saved || !code || req.query.state !== saved.state) return failTo(res, "github_failed");
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: id, client_secret: secret, code }),
    });
    const { access_token } = (await tokenRes.json()) as { access_token?: string };
    if (!access_token) return failTo(res, "github_failed");
    const headers = { Authorization: `Bearer ${access_token}`, Accept: "application/vnd.github+json", "User-Agent": "mohalla-events" };
    const profile = (await (await fetch("https://api.github.com/user", { headers })).json()) as { login?: string; name?: string; avatar_url?: string; email?: string };
    const emails = (await (await fetch("https://api.github.com/user/emails", { headers })).json()) as { email: string; primary: boolean; verified: boolean }[];
    const email = (Array.isArray(emails) ? emails.find((e) => e.primary && e.verified)?.email : null) ?? profile.email;
    if (!email) return failTo(res, "github_no_email");
    const db = await getDb();
    const normalised = email.toLowerCase();
    await db.collection("users").updateOne(
      { email: normalised },
      { $setOnInsert: { email: normalised, name: profile.name || profile.login || normalised.split("@")[0], photoURL: profile.avatar_url || "", createdAt: new Date() } },
      { upsert: true },
    );
    const user = await db.collection("users").findOne({ email: normalised });
    issueToken(res, { email: normalised, name: user?.name ?? "", photoURL: user?.photoURL ?? "" });
    res.redirect(`${clientOrigin()}${saved.next}`);
  } catch {
    failTo(res, "github_failed");
  }
});

router.put("/profile", requireAuth, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const photoURL = typeof req.body?.photoURL === "string" ? req.body.photoURL.trim() : "";
  if (name.length < 2) return res.status(400).json({ message: "Name must be at least 2 characters." });
  if (!/^https?:\/\/\S+$/i.test(photoURL)) return res.status(400).json({ message: "Photo URL must start with http:// or https://." });
  const db = await getDb();
  await db.collection("users").updateOne({ email: req.user!.email }, { $set: { name, photoURL } });
  const payload = { email: req.user!.email, name, photoURL };
  issueToken(res, payload);
  res.json({ user: payload });
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
