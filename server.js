const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const STAFF_DESK_CODE = "VFI-HR-2026";
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const APPS_FILE = path.join(DATA_DIR, "applications.json");
const SESSION_SECRET = process.env.SESSION_SECRET || "virginia-foods-portal-secret-2026";

const STATUSES = ["Draft","Submitted","Under Review","Interview","Offer","Hired","Declined","Withdrawn"];
const POSITIONS = [
  "Production Operator","Quality Assurance","Warehouse / Logistics","Sales Representative",
  "Administrative Staff","Maintenance Technician","Driver","Other"
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

for (const d of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(APPS_FILE)) fs.writeFileSync(APPS_FILE, "[]");

const sessions = new Map();

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function uuid() {
  return crypto.randomUUID();
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
  } catch {
    return false;
  }
}
function publicUser(u) {
  return { id: u.id, email: u.email, fullName: u.fullName, role: u.role, createdAt: u.createdAt };
}
function publicApp(app) {
  const out = { ...app };
  if (Array.isArray(out.files)) {
    out.files = out.files.map((f) => ({
      id: f.id,
      originalName: f.originalName,
      size: f.size,
      mimeType: f.mimeType,
      uploadedAt: f.uploadedAt,
    }));
  }
  return out;
}
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  raw.split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function getSession(req) {
  const cookies = parseCookies(req);
  const sid = cookies.sid;
  if (!sid || !sessions.has(sid)) return null;
  return sessions.get(sid);
}
function setSession(res, userId) {
  const sid = uuid();
  sessions.set(sid, { userId, createdAt: Date.now() });
  res.setHeader(
    "Set-Cookie",
    `sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`
  );
}
function clearSession(req, res) {
  const cookies = parseCookies(req);
  if (cookies.sid) sessions.delete(cookies.sid);
  res.setHeader("Set-Cookie", "sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}
function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(text);
}
function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function getUser(req) {
  const sess = getSession(req);
  if (!sess) return null;
  const users = readJson(USERS_FILE);
  return users.find((u) => u.id === sess.userId) || null;
}
function safePath(base, rel) {
  const resolved = path.normalize(path.join(base, rel));
  if (!resolved.startsWith(base)) return null;
  return resolved;
}
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const filePath = safePath(PUBLIC, rel);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback
    const index = path.join(PUBLIC, "index.html");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(index).pipe(res);
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function parseMultipart(buffer, boundary) {
  const parts = [];
  const sep = Buffer.from(`--${boundary}`);
  let start = buffer.indexOf(sep) + sep.length;
  while (start < buffer.length) {
    if (buffer[start] === 45 && buffer[start + 1] === 45) break; // --
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
    const next = buffer.indexOf(sep, start);
    if (next < 0) break;
    let part = buffer.slice(start, next - 2); // trim \r\n
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd >= 0) {
      const headerText = part.slice(0, headerEnd).toString();
      const content = part.slice(headerEnd + 4);
      const nameMatch = /name="([^"]+)"/.exec(headerText);
      const fileMatch = /filename="([^"]*)"/.exec(headerText);
      const typeMatch = /Content-Type:\s*(.+)/i.exec(headerText);
      parts.push({
        name: nameMatch ? nameMatch[1] : "",
        filename: fileMatch ? fileMatch[1] : null,
        contentType: typeMatch ? typeMatch[1].trim() : "application/octet-stream",
        data: content,
      });
    }
    start = next + sep.length;
  }
  return parts;
}

async function handleApi(req, res, pathname) {
  const method = req.method || "GET";

  if (method === "GET" && pathname === "/api/meta") {
    return sendJson(res, 200, { company: "Virginia Foods Inc.", positions: POSITIONS, statuses: STATUSES });
  }

  if (method === "GET" && pathname === "/api/me") {
    const user = getUser(req);
    return sendJson(res, 200, { user: user ? publicUser(user) : null });
  }

  if (method === "POST" && pathname === "/api/register") {
    const raw = await readBody(req);
    const body = JSON.parse(raw.toString() || "{}");
    const cleanEmail = String(body.email || "").trim().toLowerCase();
    const cleanName = String(body.fullName || "").trim();
    const cleanPass = String(body.password || "");
    if (!isValidEmail(cleanEmail)) return sendJson(res, 400, { error: "Enter a valid email address." });
    if (cleanName.length < 2) return sendJson(res, 400, { error: "Full name is required." });
    if (cleanPass.length < 6) return sendJson(res, 400, { error: "Password must be at least 6 characters." });
    const wantStaff = body.role === "staff";
    if (wantStaff && String(body.deskCode || "").trim() !== STAFF_DESK_CODE) {
      return sendJson(res, 403, { error: "Invalid company desk code." });
    }
    const users = readJson(USERS_FILE);
    if (users.some((u) => u.email === cleanEmail)) {
      return sendJson(res, 409, { error: "An account with this email already exists." });
    }
    const user = {
      id: uuid(),
      email: cleanEmail,
      fullName: cleanName,
      passwordHash: hashPassword(cleanPass),
      role: wantStaff ? "staff" : "applicant",
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    writeJson(USERS_FILE, users);
    setSession(res, user.id);
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (method === "POST" && pathname === "/api/login") {
    const raw = await readBody(req);
    const body = JSON.parse(raw.toString() || "{}");
    const cleanEmail = String(body.email || "").trim().toLowerCase();
    const cleanPass = String(body.password || "");
    if (!isValidEmail(cleanEmail) || !cleanPass) {
      return sendJson(res, 400, { error: "Email and password are required." });
    }
    const users = readJson(USERS_FILE);
    const user = users.find((u) => u.email === cleanEmail);
    if (!user || !verifyPassword(cleanPass, user.passwordHash)) {
      return sendJson(res, 401, { error: "Invalid email or password." });
    }
    setSession(res, user.id);
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (method === "POST" && pathname === "/api/logout") {
    clearSession(req, res);
    return sendJson(res, 200, { ok: true });
  }

  if (method === "GET" && pathname === "/api/application") {
    const user = getUser(req);
    if (!user) return sendJson(res, 401, { error: "Please sign in." });
    if (user.role === "staff") return sendJson(res, 400, { error: "Staff should use the company desk." });
    const apps = readJson(APPS_FILE);
    const existing = apps.find((a) => a.userId === user.id);
    return sendJson(res, 200, { application: existing ? publicApp(existing) : null, positions: POSITIONS });
  }

  if (method === "POST" && pathname === "/api/application") {
    const user = getUser(req);
    if (!user || user.role !== "applicant") return sendJson(res, 403, { error: "Applicants only." });
    const raw = await readBody(req);
    const body = JSON.parse(raw.toString() || "{}");
    const apps = readJson(APPS_FILE);
    let appRow = apps.find((a) => a.userId === user.id);
    const locked = appRow && ["Offer", "Hired", "Declined", "Withdrawn"].includes(appRow.status);
    if (locked && body.action !== "withdraw") {
      return sendJson(res, 400, { error: "This application can no longer be edited." });
    }
    const fields = {
      fullName: String(body.fullName || user.fullName).trim(),
      phone: String(body.phone || "").trim(),
      city: String(body.city || "").trim(),
      position: String(body.position || "").trim(),
      experience: String(body.experience || "").trim(),
      education: String(body.education || "").trim(),
      availability: String(body.availability || "").trim(),
      coverNote: String(body.coverNote || "").trim(),
    };
    if (!fields.fullName || !fields.position) {
      return sendJson(res, 400, { error: "Full name and position are required." });
    }
    if (!POSITIONS.includes(fields.position)) {
      return sendJson(res, 400, { error: "Choose a valid position." });
    }
    const now = new Date().toISOString();
    const submit = body.action === "submit";
    const withdraw = body.action === "withdraw";
    if (!appRow) {
      appRow = {
        id: uuid(),
        userId: user.id,
        email: user.email,
        ...fields,
        status: submit ? "Submitted" : "Draft",
        statusNote: "",
        history: [{
          at: now,
          status: submit ? "Submitted" : "Draft",
          note: submit ? "Application submitted by applicant." : "Draft created.",
          by: user.fullName,
          role: "applicant",
        }],
        files: [],
        createdAt: now,
        updatedAt: now,
      };
      apps.push(appRow);
    } else {
      Object.assign(appRow, fields);
      appRow.updatedAt = now;
      if (submit && appRow.status === "Draft") {
        appRow.status = "Submitted";
        appRow.history.push({
          at: now, status: "Submitted", note: "Application submitted by applicant.",
          by: user.fullName, role: "applicant",
        });
      }
      if (withdraw && !["Hired", "Declined", "Withdrawn"].includes(appRow.status)) {
        appRow.status = "Withdrawn";
        appRow.history.push({
          at: now, status: "Withdrawn", note: "Withdrawn by applicant.",
          by: user.fullName, role: "applicant",
        });
      }
    }
    writeJson(APPS_FILE, apps);
    return sendJson(res, 200, { application: publicApp(appRow) });
  }

  if (method === "POST" && pathname === "/api/application/files") {
    const user = getUser(req);
    if (!user || user.role !== "applicant") return sendJson(res, 403, { error: "Applicants only." });
    const ctype = req.headers["content-type"] || "";
    const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ctype);
    if (!m) return sendJson(res, 400, { error: "Expected multipart upload." });
    const boundary = (m[1] || m[2]).trim();
    const buf = await readBody(req, 6 * 1024 * 1024);
    const parts = parseMultipart(buf, boundary);
    const filePart = parts.find((p) => p.name === "file" && p.filename);
    if (!filePart) return sendJson(res, 400, { error: "No file received." });
    const allowed = [
      "application/pdf", "image/jpeg", "image/png", "image/webp",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(filePart.contentType)) {
      return sendJson(res, 400, { error: "Only PDF, Word, or image files are allowed." });
    }
    if (filePart.data.length > 5 * 1024 * 1024) {
      return sendJson(res, 400, { error: "File too large (max 5 MB)." });
    }
    const apps = readJson(APPS_FILE);
    const appRow = apps.find((a) => a.userId === user.id);
    if (!appRow) return sendJson(res, 400, { error: "Save your application before uploading files." });
    if (["Offer", "Hired", "Declined", "Withdrawn"].includes(appRow.status)) {
      return sendJson(res, 400, { error: "Uploads are closed for this application." });
    }
    if ((appRow.files || []).length >= 8) {
      return sendJson(res, 400, { error: "Maximum 8 files allowed." });
    }
    const safe = String(filePart.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    const storedName = `${Date.now()}-${uuid().slice(0, 8)}-${safe}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, storedName), filePart.data);
    const fileMeta = {
      id: uuid(),
      originalName: filePart.filename,
      storedName,
      size: filePart.data.length,
      mimeType: filePart.contentType,
      uploadedAt: new Date().toISOString(),
    };
    appRow.files = appRow.files || [];
    appRow.files.push(fileMeta);
    appRow.updatedAt = new Date().toISOString();
    writeJson(APPS_FILE, apps);
    return sendJson(res, 200, { application: publicApp(appRow) });
  }

  const delFile = pathname.match(/^\/api\/application\/files\/([^/]+)$/);
  if (method === "DELETE" && delFile) {
    const user = getUser(req);
    if (!user || user.role !== "applicant") return sendJson(res, 403, { error: "Applicants only." });
    const apps = readJson(APPS_FILE);
    const appRow = apps.find((a) => a.userId === user.id);
    if (!appRow) return sendJson(res, 404, { error: "Application not found." });
    if (["Offer", "Hired", "Declined", "Withdrawn"].includes(appRow.status)) {
      return sendJson(res, 400, { error: "This application is locked." });
    }
    const file = (appRow.files || []).find((f) => f.id === delFile[1]);
    if (!file) return sendJson(res, 404, { error: "File not found." });
    const disk = path.join(UPLOAD_DIR, file.storedName);
    if (fs.existsSync(disk)) fs.unlinkSync(disk);
    appRow.files = appRow.files.filter((f) => f.id !== delFile[1]);
    appRow.updatedAt = new Date().toISOString();
    writeJson(APPS_FILE, apps);
    return sendJson(res, 200, { application: publicApp(appRow) });
  }

  if (method === "GET" && pathname === "/api/staff/applications") {
    const user = getUser(req);
    if (!user || user.role !== "staff") return sendJson(res, 403, { error: "Staff access required." });
    const url = new URL(req.url, `http://${req.headers.host}`);
    const status = String(url.searchParams.get("status") || "").trim();
    const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
    let list = readJson(APPS_FILE).map((a) => publicApp(a));
    if (status && status !== "All") list = list.filter((a) => a.status === status);
    if (q) {
      list = list.filter(
        (a) =>
          a.fullName.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          a.position.toLowerCase().includes(q) ||
          (a.city || "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return sendJson(res, 200, { applications: list });
  }

  const staffOne = pathname.match(/^\/api\/staff\/applications\/([^/]+)$/);
  if (method === "GET" && staffOne) {
    const user = getUser(req);
    if (!user || user.role !== "staff") return sendJson(res, 403, { error: "Staff access required." });
    const appRow = readJson(APPS_FILE).find((a) => a.id === staffOne[1]);
    if (!appRow) return sendJson(res, 404, { error: "Application not found." });
    return sendJson(res, 200, { application: publicApp(appRow) });
  }

  const staffStatus = pathname.match(/^\/api\/staff\/applications\/([^/]+)\/status$/);
  if (method === "PATCH" && staffStatus) {
    const user = getUser(req);
    if (!user || user.role !== "staff") return sendJson(res, 403, { error: "Staff access required." });
    const raw = await readBody(req);
    const body = JSON.parse(raw.toString() || "{}");
    const apps = readJson(APPS_FILE);
    const appRow = apps.find((a) => a.id === staffStatus[1]);
    if (!appRow) return sendJson(res, 404, { error: "Application not found." });
    const nextStatus = String(body.status || "").trim();
    const note = String(body.note || "").trim();
    const allowed = ["Under Review", "Interview", "Offer", "Hired", "Declined"];
    if (!allowed.includes(nextStatus)) {
      return sendJson(res, 400, { error: "Invalid status for company update." });
    }
    const now = new Date().toISOString();
    appRow.status = nextStatus;
    appRow.statusNote = note;
    appRow.updatedAt = now;
    appRow.history = appRow.history || [];
    appRow.history.push({
      at: now, status: nextStatus, note: note || `Status set to ${nextStatus}`,
      by: user.fullName, role: "staff",
    });
    writeJson(APPS_FILE, apps);
    return sendJson(res, 200, { application: publicApp(appRow) });
  }

  const fileGet = pathname.match(/^\/api\/files\/([^/]+)\/([^/]+)$/);
  if (method === "GET" && fileGet) {
    const user = getUser(req);
    if (!user) return sendJson(res, 401, { error: "Please sign in." });
    const appRow = readJson(APPS_FILE).find((a) => a.id === fileGet[1]);
    if (!appRow) return sendJson(res, 404, { error: "Not found." });
    if (user.role !== "staff" && appRow.userId !== user.id) {
      return sendJson(res, 403, { error: "Not allowed." });
    }
    const file = (appRow.files || []).find((f) => f.id === fileGet[2]);
    if (!file) return sendJson(res, 404, { error: "File not found." });
    const disk = path.join(UPLOAD_DIR, file.storedName);
    if (!fs.existsSync(disk)) return sendJson(res, 404, { error: "File missing on server." });
    res.writeHead(200, {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${file.originalName.replace(/"/g, "")}"`,
    });
    fs.createReadStream(disk).pipe(res);
    return;
  }

  return sendJson(res, 404, { error: "Not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const pathname = url.pathname;
    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
      return;
    }
    serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: err.message || "Server error" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Virginia Foods portal on http://0.0.0.0:${PORT}`);
  console.log(`Staff desk code: ${STAFF_DESK_CODE}`);
});
