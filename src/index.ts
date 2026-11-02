import express from "express";
import { createApp } from "./create-app.js";

// Vercel entry point: the default export is an Express app (local development uses src/local.ts).
const app = express();
app.use(createApp());

export default app;
