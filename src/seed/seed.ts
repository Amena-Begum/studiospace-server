import "dotenv/config";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { getDb } from "../db.js";

const images = JSON.parse(readFileSync(new URL("./images.json", import.meta.url), "utf8")) as Record<string, { url: string }>;
const img = (k: string) => images[k].url;

const password = process.env.SEED_PASSWORD;
if (!password) throw new Error("Set SEED_PASSWORD in .env to create the demo accounts.");

const hosts = [
  { name: "Mira Halloran", email: "mira.host@studiospace.app", photoURL: "https://api.dicebear.com/9.x/notionists/svg?seed=MiraHalloran&backgroundColor=f1d9c4" },
  { name: "Teo Okafor", email: "teo.host@studiospace.app", photoURL: "https://api.dicebear.com/9.x/notionists/svg?seed=TeoOkafor&backgroundColor=c9dcd0" },
];
const guest = { name: "Jun Aldana", email: "jun.guest@studiospace.app", photoURL: "https://api.dicebear.com/9.x/notionists/svg?seed=JunAldana&backgroundColor=d5d3ec" };

const reviewers = ["Priya N.", "Daniel R.", "Ife A.", "Lucía M.", "Sam K.", "Hanna V."];
const mkReviews = (rows: [number, string][]) =>
  rows.map(([rating, comment], i) => ({
    name: reviewers[i % reviewers.length],
    rating,
    comment,
    date: new Date(Date.UTC(2026, 8 - i, 10 + i)).toISOString().slice(0, 10),
  }));
const avg = (r: { rating: number }[]) => Math.round((r.reduce((s, x) => s + x.rating, 0) / r.length) * 10) / 10;

type Seed = {
  host: 0 | 1; title: string; category: string; hourlyRate: number; securityDeposit: number; maxCapacity: number;
  location: string; hero: string; extra: string[]; amenities: string[]; overview: string; reviews: [number, string][];
};

const studios: Seed[] = [
  {
    host: 0, title: "Whitewall Cyc Loft", category: "Photo Studio", hourlyRate: 48, securityDeposit: 150, maxCapacity: 10,
    location: "Wynwood Arts District, Miami, FL", hero: "cyc", extra: ["lights"],
    amenities: ["Infinity cyc wall", "Strobe kit", "Seamless paper rolls", "Makeup station", "Tethering cart", "Free Wi-Fi"],
    overview: "A 1,400 sq ft white cyclorama with a poured-floor sweep, built for e-commerce, lookbooks and portrait days. Two Profoto-style strobe heads, softboxes, V-flats and a tethered capture cart are included in the hourly rate. Load-in is through a roll-up door at street level, so racks and furniture are no trouble.",
    reviews: [[5, "Wall was spotless and the sweep is truly seamless. We shot 40 looks in one day."], [4, "Great light control. Parking nearby is the only tricky bit."], [5, "Host left a clear checklist, which made the turnover painless."]],
  },
  {
    host: 0, title: "Lumen Gallery Set", category: "Photo Studio", hourlyRate: 62, securityDeposit: 200, maxCapacity: 8,
    location: "Garment District, New York, NY", hero: "lights", extra: ["cyc"],
    amenities: ["Period architecture backdrop", "Continuous lighting", "C-stands", "Steamer", "Laptop tether station"],
    overview: "A marble-floored corner of a converted townhouse with tall mouldings and warm daylight, ideal for editorial portraits and fashion stories. Bring your own camera; the stands, flags and modifiers on the shelf are yours to use.",
    reviews: [[5, "Looks like a magazine set the second you walk in."], [4, "Gorgeous space. Heating takes a while in winter."]],
  },
  {
    host: 1, title: "Carousel Court Set", category: "Photo Studio", hourlyRate: 38, securityDeposit: 120, maxCapacity: 12,
    location: "Shibuya, Tokyo, Japan", hero: "carousel", extra: ["backlot"],
    amenities: ["Outdoor styled set", "Props closet", "Changing room", "Power outlets on every wall", "Free Wi-Fi"],
    overview: "A whitewashed courtyard set with a vintage carousel, arched windows and a tiny conservatory, rentable by the hour for wedding styling, maternity portraits and campaign work. A weather-cover plan is included, so rain days can still run.",
    reviews: [[5, "Our bridal shoot felt like a storybook."], [5, "Props closet was a happy surprise."], [4, "Lovely, but book early for golden hour."]],
  },
  {
    host: 1, title: "Rustboard Backlot", category: "Photo Studio", hourlyRate: 34, securityDeposit: 100, maxCapacity: 10,
    location: "Koenji, Tokyo, Japan", hero: "backlot", extra: ["carousel"],
    amenities: ["Covered shooting bay", "Vintage furniture", "Bike and prop rail", "Power outlets", "Free Wi-Fi"],
    overview: "An open-front workshop bay dressed as a lived-in garage apartment, with timber trusses, a retro fridge and a bicycle. It works for lifestyle brands, music videos and cinematic stills.",
    reviews: [[4, "Textured, characterful and quiet in the mornings."], [4, "Great for lifestyle content. Lots of natural light."]],
  },
  {
    host: 0, title: "Greenroom Stage A", category: "Film Stage", hourlyRate: 85, securityDeposit: 400, maxCapacity: 14,
    location: "Burbank, Los Angeles, CA", hero: "greenroom", extra: ["chroma"],
    amenities: ["Chroma green wall", "Key and fill LED panels", "Green room lounge", "Teleprompter", "Cable run to control desk", "Free Wi-Fi"],
    overview: "A dressed green-screen set with a velvet lounge in front, made for shows, web series and talk formats. LED panels are pre-rigged and the audio drop to the control desk is ready, so you can start rolling in ten minutes.",
    reviews: [[5, "We recorded three episodes before lunch. Everything just worked."], [5, "Clean key, no spill, great crew-friendly layout."], [4, "Wish there was a second restroom, otherwise perfect."]],
  },
  {
    host: 1, title: "Chroma Bay Stage", category: "Film Stage", hourlyRate: 110, securityDeposit: 600, maxCapacity: 20,
    location: "Cologne, Germany", hero: "chroma", extra: ["greenroom"],
    amenities: ["Full green cyc", "Lighting grid", "Camera dolly", "Blackout curtains", "Crew lounge", "Loading dock"],
    overview: "A teaching-grade sound stage with a lighting grid, a floor that takes a dolly and a wall that takes a full-body key. A good fit for student films, short-form ads and VFX plates. Rental includes a studio manager on site.",
    reviews: [[5, "Honest pricing, flexible grid and a very patient manager."], [4, "Big enough for our crew of 15."]],
  },
  {
    host: 0, title: "Roundtable Podcast Room", category: "Podcast Lounge", hourlyRate: 28, securityDeposit: 60, maxCapacity: 6,
    location: "Austin, TX", hero: "podroom", extra: ["podmics"],
    amenities: ["Four-mic round table", "Acoustic panels", "Mixer with multitrack recording", "Video camera hookup", "Free Wi-Fi"],
    overview: "A treated room with a six-seat round table, four broadcast microphones with boom arms and a control corner for the producer. Multitrack recording is included, and the walls are tuned for a short decay so speech stays clear.",
    reviews: [[5, "Our audio was clean from the first take."], [5, "Comfortable chairs, so long episodes were no problem."], [4, "Easy booking and great sound."]],
  },
  {
    host: 1, title: "Mic Row Lounge", category: "Podcast Lounge", hourlyRate: 24, securityDeposit: 50, maxCapacity: 5,
    location: "Lisbon, Portugal", hero: "podmics", extra: ["podroom"],
    amenities: ["Glass-wall booth", "Remote guest hookup", "Pop filters and shock mounts", "Refreshments", "Free Wi-Fi"],
    overview: "A glass-fronted studio with a wooden table and a separate producer desk, so a remote guest can join without echo. A quiet street, good daylight and tea on request.",
    reviews: [[4, "Cozy and quiet; the remote guest setup is smart."], [5, "Best value room I have rented."]],
  },
  {
    host: 0, title: "Control Room One", category: "Music Suite", hourlyRate: 95, securityDeposit: 300, maxCapacity: 8,
    location: "Nashville, TN", hero: "control", extra: ["console"],
    amenities: ["Analog console", "Outboard racks", "Live room", "Vintage amps", "Isolation booth", "Lounge and kitchenette"],
    overview: "A warm brick-and-wood tracking room with a large-format console, a tuned live room and an iso booth. An in-house engineer is available by the session. It suits full-band tracking, vocal comping and mixdowns.",
    reviews: [[5, "The drums sound huge in the live room."], [5, "Engineer knew the console inside out."], [5, "Left with a finished EP."]],
  },
  {
    host: 1, title: "Grand Console Suite", category: "Music Suite", hourlyRate: 120, securityDeposit: 500, maxCapacity: 10,
    location: "Berlin, Germany", hero: "console", extra: ["control"],
    amenities: ["Hybrid console", "Studio monitors", "Atmos-ready control room", "Piano", "Vocal booth", "Mastering chain"],
    overview: "A high-ceilinged mixing and mastering suite with a hybrid console, symmetrical room treatment and a grand piano next door. Quiet, accurate and ready for album sessions.",
    reviews: [[5, "Monitoring is brutally honest, which is exactly what I want."], [4, "Pricey but worth it for final mixes."]],
  },
  {
    host: 0, title: "Paper & Print Atelier", category: "Workshop", hourlyRate: 22, securityDeposit: 40, maxCapacity: 12,
    location: "Portland, OR", hero: "atelier", extra: [],
    amenities: ["Large work tables", "Wall pin boards", "Drying racks", "North-facing windows", "Sink", "Easels"],
    overview: "A sunlit studio with big tables, pin walls and a drying rack, run as a shared workshop space for illustrators, printmakers and small classes. Good ventilation and a deep sink make messy work easy.",
    reviews: [[5, "Perfect for our weekend print club."], [4, "Bright, roomy and tidy."]],
  },
];

async function main() {
  const db = await getDb();
  const hash = await bcrypt.hash(password!, 10);
  for (const u of [...hosts, guest]) {
    await db.collection("users").updateOne({ email: u.email }, { $set: { ...u, passwordHash: hash }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  }
  const demoOwners = hosts.map((h) => h.email);
  await db.collection("studios").deleteMany({ ownerEmail: { $in: demoOwners } });
  const now = Date.now();
  const docs = studios.map((s, i) => {
    const reviews = mkReviews(s.reviews);
    const h = hosts[s.host];
    return {
      title: s.title, category: s.category, hourlyRate: s.hourlyRate, securityDeposit: s.securityDeposit, maxCapacity: s.maxCapacity,
      location: s.location, imageUrl: img(s.hero), gallery: [img(s.hero), ...s.extra.map(img)], amenities: s.amenities, overview: s.overview,
      rating: avg(reviews), reviews,
      ownerEmail: h.email, ownerName: h.name, ownerPhoto: h.photoURL,
      createdAt: new Date(now - i * 36 * 3600 * 1000),
    };
  });
  await db.collection("studios").insertMany(docs);
  console.log(`Seeded ${docs.length} studios and ${hosts.length + 1} demo accounts.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
