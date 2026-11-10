import "dotenv/config";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { getDb } from "../db.js";
import { todayISO } from "../dates.js";

const images = JSON.parse(readFileSync(new URL("./images.json", import.meta.url), "utf8")) as Record<string, { url: string }>;
const img = (k: string) => images[k].url;

const password = process.env.SEED_PASSWORD;
if (!password) throw new Error("Set SEED_PASSWORD in .env to create the demo accounts.");

const avatar = (seed: string, bg: string) => `https://api.dicebear.com/9.x/notionists/svg?seed=${seed}&backgroundColor=${bg}`;
const people = [
  { name: "Amina Rahman", email: "amina.organiser@mohalla.app", photoURL: avatar("AminaRahman", "f1d9c4") },
  { name: "Rafi Chowdhury", email: "rafi.organiser@mohalla.app", photoURL: avatar("RafiChowdhury", "c9dcd0") },
  { name: "Tasnim Akter", email: "tasnim.volunteer@mohalla.app", photoURL: avatar("TasnimAkter", "d5d3ec") },
];

// Dates are set relative to today (Dhaka time) so every seeded event is upcoming whenever the seed is run.
const inDays = (n: number) => {
  const d = new Date(`${todayISO()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const events = [
  {
    by: 0, title: "Winter Clothes Distribution – Mirpur 10, Dhaka", eventType: "Donation", image: "clothes", days: 9,
    location: "Mirpur 10 Roundabout, Dhaka",
    description: "We are handing out warm sweaters, shawls and socks to children and elders from the neighbourhood madrasas and nearby slums. Bring a bag of clean, wearable winter clothes or come early to help us sort and pack. We start sorting at 8 am and distribute from 10 am.",
  },
  {
    by: 1, title: "Blanket Distribution for the Needy – Mohammadpur, Dhaka", eventType: "Donation", image: "blanket", days: 14,
    location: "Town Hall Bazar, Mohammadpur, Dhaka",
    description: "Cold nights are hard on people who sleep outdoors. Volunteers will walk the Mohammadpur lanes after dark, handing blankets to rickshaw pullers, street vendors and families without a warm bed. Each team gets a route map and a list of blankets to carry.",
  },
  {
    by: 0, title: "Buriganga Riverside Cleanup Drive", eventType: "Cleanup", image: "beach", days: 18,
    location: "Sadarghat River Bank, Old Dhaka",
    description: "Join us for a morning of picking plastic and litter from the Sadarghat river bank. Gloves, grabbers and bags are provided. We will weigh and sort what we collect, then share a simple breakfast together. Wear shoes you do not mind getting muddy.",
  },
  {
    by: 2, title: "Monsoon Tree Plantation – Hatirjheel Lakefront", eventType: "Plantation", image: "plant", days: 26,
    location: "Hatirjheel Lakefront, Dhaka",
    description: "Help us plant 200 native saplings, including neem, krishnachura and jarul, along the Hatirjheel walkway. A forestry student team will show everyone how to plant and stake a sapling, and each family can adopt one tree to check on through the year.",
  },
  {
    by: 1, title: "Free Health Camp – Dhankora, Manikganj", eventType: "Health Camp", image: "health", days: 33,
    location: "Girish Institute, Dhankora, Manikganj",
    description: "A one-day camp offering free blood pressure, blood sugar and eye checks, plus basic medicines and nutrition advice for mothers and children. We need volunteers for registration, queue help, and walking elderly visitors between tables.",
  },
  {
    by: 2, title: "Community Food Packing Day – Uttara", eventType: "Food Drive", image: "food", days: 41,
    location: "Sector 7 Community Centre, Uttara, Dhaka",
    description: "Together we will pack 500 family food bags with rice, lentils, oil and salt for households who lost income this season. Packing runs in two-hour shifts, so you can join for one or stay for both. Donations of dry food are welcome at the door.",
  },
  {
    by: 0, title: "Brickfield Families Winter Support – Savar", eventType: "Donation", image: "brick", days: 52,
    location: "Brickfield Road, Savar, Dhaka",
    description: "Families living at the brickfields have few warm clothes for the cold months. We are collecting jackets and children's sweaters, and we need drivers and helpers to carry them out to Savar and distribute them family by family.",
  },
  {
    by: 1, title: "Saint Martin's Island Shoreline Cleanup", eventType: "Cleanup", image: "shore", days: 64,
    location: "Saint Martin's Island, Teknaf, Cox's Bazar",
    description: "A shoreline cleanup with local fishers, students and coast guard volunteers. We will fill sacks with washed-up plastic, nets and bottles along the east beach, then record what we find so the island council can plan better waste collection.",
  },
  {
    by: 2, title: "Campus Plantation Rally and Tree Fair", eventType: "Plantation", image: "rally", days: 78,
    location: "Syed Nazrul Islam College, Mymensingh",
    description: "A student-led walk through the town followed by a tree fair with free fruit and shade saplings. Volunteers help carry banners, hand out saplings and explain to families how to look after them through the first dry season.",
  },
];

const db = await getDb();

// This API now serves the events platform, so earlier-studio data is cleared along with the old demo accounts.
await Promise.all([db.collection("studios").drop().catch(() => {}), db.collection("bookings").drop().catch(() => {})]);
await db.collection("users").deleteMany({ email: { $regex: "@studiospace\\.app$" } });

const hash = await bcrypt.hash(password, 10);
for (const p of people) {
  await db.collection("users").updateOne({ email: p.email }, { $set: { ...p, passwordHash: hash }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
}

// Re-seeding replaces only the seeded events; events created through the site by real users are kept.
await db.collection("joins").deleteMany({ creatorEmail: { $in: people.map((p) => p.email) } });
await db.collection("events").deleteMany({ creatorEmail: { $in: people.map((p) => p.email) } });
const docs = events.map((e) => ({
  title: e.title,
  description: e.description,
  eventType: e.eventType,
  thumbnail: img(e.image),
  location: e.location,
  eventDate: inDays(e.days),
  creatorEmail: people[e.by].email,
  creatorName: people[e.by].name,
  createdAt: new Date(),
}));
await db.collection("events").insertMany(docs);
console.log(`Seeded ${docs.length} upcoming events and ${people.length} demo accounts.`);
process.exit(0);
