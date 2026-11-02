import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.js";
import studioRoutes from "./routes/studios.js";
import bookingRoutes from "./routes/bookings.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  const origins = (process.env.CLIENT_URL || "http://localhost:3000").split(",").map((s) => s.trim().replace(/\/$/, ""));
  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/", (_req, res) => res.json({ name: "StudioSpace API", status: "ok" }));
  app.use("/api/auth", authRoutes);
  app.use("/api/studios", studioRoutes);
  app.use("/api/bookings", bookingRoutes);

  app.use((_req, res) => res.status(404).json({ message: "Route not found." }));
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ message: "Something went wrong on the server. Please try again." });
  });
  return app;
}
