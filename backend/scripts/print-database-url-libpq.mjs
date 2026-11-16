#!/usr/bin/env node
import { databaseUrlForLibpq } from "./lib/database-url-libpq.mjs";

const raw = process.env.DATABASE_URL;
if (!raw?.trim()) {
  process.exit(0);
}

process.stdout.write(databaseUrlForLibpq(raw));