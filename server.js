import http from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
await mkdir(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "contacts.sqlite"));
db.exec(`
  CREATE TABLE IF NOT EXISTS contact_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    language_preference TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    where_met TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    interests TEXT NOT NULL DEFAULT '[]',
    consent INTEGER NOT NULL DEFAULT 0
  )
`);

const insertSubmission = db.prepare(`
  INSERT INTO contact_submissions
  (created_at, first_name, last_name, language_preference, email, phone, where_met, message, interests, consent)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const getSubmissions = db.prepare(`
  SELECT id, created_at, first_name, last_name, language_preference, email, phone, where_met, message, interests
  FROM contact_submissions
  ORDER BY id DESC
`);

const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || "change-this-admin-key";
const rateMap = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(payload));
}

function clean(value, maxLength = 500) {
  return String(value ?? "").trim().replace(/[\u0000-\u001F\u007F]/g, "").slice(0, maxLength);
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function validPhone(phone) {
  return /^[+()\-\.\s\d]{7,25}$/.test(phone);
}

function getClientKey(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0] || req.socket.remoteAddress || "unknown";
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function isRateLimited(req) {
  const key = getClientKey(req);
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 8;
  const recent = (rateMap.get(key) || []).filter((time) => now - time < windowMs);
  recent.push(now);
  rateMap.set(key, recent);
  return recent.length > max;
}

async function readJsonBody(req) {
  return await new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function hasAdminAccess(req, url) {
  const supplied = req.headers["x-admin-key"] || url.searchParams.get("key");
  if (typeof supplied !== "string") return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(ADMIN_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const resolved = path.normalize(path.join(publicDir, pathname));
  if (!resolved.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const info = await stat(resolved);
    if (!info.isFile()) throw new Error("Not a file");
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'"
    });
    createReadStream(resolved).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "POST" && url.pathname === "/api/contact") {
    if (isRateLimited(req)) {
      sendJson(res, 429, { ok: false, message: "Too many attempts. Please wait a few minutes and try again." });
      return;
    }

    try {
      const body = await readJsonBody(req);
      if (clean(body.website, 100)) {
        sendJson(res, 200, { ok: true, message: "Thank you." });
        return;
      }

      const submission = {
        firstName: clean(body.firstName, 80),
        lastName: clean(body.lastName, 80),
        languagePreference: clean(body.languagePreference, 50),
        email: clean(body.email, 254).toLowerCase(),
        phone: clean(body.phone, 25),
        whereMet: clean(body.whereMet, 150),
        message: clean(body.message, 1500),
        interests: Array.isArray(body.interests)
          ? body.interests.map((item) => clean(item, 80)).filter(Boolean).slice(0, 10)
          : [],
        consent: body.consent === true
      };

      const errors = [];
      if (!submission.firstName) errors.push("First name is required.");
      if (!submission.lastName) errors.push("Last name is required.");
      if (!validEmail(submission.email)) errors.push("Enter a valid email address.");
      if (!validPhone(submission.phone)) errors.push("Enter a valid phone number.");
      if (submission.interests.length === 0) errors.push("Select at least one topic.");
      if (!submission.consent) errors.push("Consent is required before submitting.");

      if (errors.length) {
        sendJson(res, 400, { ok: false, message: errors.join(" ") });
        return;
      }

      const result = insertSubmission.run(
        new Date().toISOString(),
        submission.firstName,
        submission.lastName,
        submission.languagePreference,
        submission.email,
        submission.phone,
        submission.whereMet,
        submission.message,
        JSON.stringify(submission.interests),
        1
      );

      sendJson(res, 201, {
        ok: true,
        id: Number(result.lastInsertRowid),
        message: "Thank you. Your information was submitted successfully. Oscar will follow up with you soon."
      });
    } catch (error) {
      console.error(error);
      sendJson(res, 500, { ok: false, message: "The form could not be submitted. Please email or call Oscar directly." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/submissions") {
    if (!hasAdminAccess(req, url)) {
      sendJson(res, 401, { ok: false, message: "Unauthorized" });
      return;
    }
    const rows = getSubmissions.all().map((row) => ({
      ...row,
      interests: JSON.parse(row.interests || "[]")
    }));
    sendJson(res, 200, { ok: true, submissions: rows });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/submissions.csv") {
    if (!hasAdminAccess(req, url)) {
      sendJson(res, 401, { ok: false, message: "Unauthorized" });
      return;
    }
    const rows = getSubmissions.all();
    const headers = ["ID", "Submitted", "First Name", "Last Name", "Language", "Email", "Phone", "Where Met", "Message", "Interests"];
    const lines = [headers.map(csvEscape).join(",")];
    for (const row of rows) {
      lines.push([
        row.id,
        row.created_at,
        row.first_name,
        row.last_name,
        row.language_preference,
        row.email,
        row.phone,
        row.where_met,
        row.message,
        JSON.parse(row.interests || "[]").join("; ")
      ].map(csvEscape).join(","));
    }
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=contact-submissions.csv",
      "Cache-Control": "no-store"
    });
    res.end(lines.join("\n"));
    return;
  }

  await serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`Oscar's website is running at http://localhost:${PORT}`);
  if (ADMIN_KEY === "change-this-admin-key") {
    console.warn("Set ADMIN_KEY before publishing: ADMIN_KEY='a-long-random-password' npm start");
  }
});
