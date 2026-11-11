const state = {
  user: null,
  application: null,
  applications: [],
  selectedId: null,
  meta: { positions: [], statuses: [] },
  view: "home",
  authMode: "login",
  authRole: "applicant",
  message: null,
  error: null,
  loading: true,
};

const $app = document.getElementById("app");

async function api(path, options = {}) {
  const opts = { credentials: "same-origin", ...options };
  if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
    opts.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function statusClass(status) {
  return `status-pill status-${String(status).replace(/\s+/g, "\\ ")}`;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function setFlash(type, text) {
  state.message = type === "ok" ? text : null;
  state.error = type === "error" ? text : null;
}

function topbar() {
  const u = state.user;
  return `
    <div class="topbar">
      <a class="brand" href="#" data-nav="home">
        <img src="/brand/logo.png" alt="Virginia Foods logo" />
        <div class="brand-text">
          <strong>Virginia Foods Inc.</strong>
          <span>Applicant Portal</span>
        </div>
      </a>
      ${
        u
          ? `<div class="user-chip">
              <span class="name">${escapeHtml(u.fullName)}</span>
              <button class="btn btn-ghost" type="button" data-action="logout">Sign out</button>
            </div>`
          : `<div class="user-chip">
              <button class="btn btn-ghost" type="button" data-nav="auth">Sign in</button>
            </div>`
      }
    </div>
  `;
}

function flashHtml() {
  if (state.error) return `<div class="alert alert-error">${escapeHtml(state.error)}</div>`;
  if (state.message) return `<div class="alert alert-ok">${escapeHtml(state.message)}</div>`;
  return "";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHome() {
  return `
    <div class="shell">
      ${topbar()}
      <section class="hero">
        <h1>We take pride in our people</h1>
        <p>Apply to Virginia Foods Inc., upload your documents, and track your application status in one place. Company HR can review and update every application from the desk.</p>
        <div class="hero-actions">
          <button class="btn btn-primary" type="button" data-nav="auth" data-auth-mode="register" data-auth-role="applicant">Apply now</button>
          <button class="btn btn-ghost" type="button" data-nav="auth" data-auth-mode="login">Sign in</button>
          <button class="btn btn-ghost" type="button" data-nav="auth" data-auth-mode="register" data-auth-role="staff">Company desk</button>
        </div>
      </section>
      <div class="grid-2">
        <div class="card">
          <h2>For applicants</h2>
          <p class="sub">Register with a valid email, complete your profile, upload a resume, and follow status updates from HR.</p>
          <ul class="muted">
            <li>Email registration required</li>
            <li>Upload PDF, Word, or images (max 5 MB each)</li>
            <li>Live status: Submitted → Review → Interview → Offer</li>
          </ul>
        </div>
        <div class="card">
          <h2>For HR / company</h2>
          <p class="sub">Sign up with the company desk code, review every application, download files, and set the next status.</p>
          <ul class="muted">
            <li>Desk code required at registration</li>
            <li>Search and filter all applicants</li>
            <li>Add notes applicants can see on their timeline</li>
          </ul>
        </div>
      </div>
      <p class="footer-note">Virginia Foods Inc. · Internal applicant portal</p>
    </div>
  `;
}

function renderAuth() {
  const isLogin = state.authMode === "login";
  const isStaff = state.authRole === "staff";
  return `
    <div class="shell">
      ${topbar()}
      <div class="card" style="max-width:440px;margin:1rem auto 0;">
        <h2>${isLogin ? "Sign in" : isStaff ? "Company desk registration" : "Create applicant account"}</h2>
        <p class="sub">${isLogin ? "Use the email you registered with." : "Valid email required. Password at least 6 characters."}</p>
        ${flashHtml()}
        <div class="tabs">
          <button class="tab ${isLogin ? "active" : ""}" type="button" data-auth-mode="login">Sign in</button>
          <button class="tab ${!isLogin ? "active" : ""}" type="button" data-auth-mode="register">Register</button>
        </div>
        ${
          !isLogin
            ? `<div class="tabs">
                <button class="tab ${!isStaff ? "active" : ""}" type="button" data-auth-role="applicant">Applicant</button>
                <button class="tab ${isStaff ? "active" : ""}" type="button" data-auth-role="staff">Company</button>
              </div>`
            : ""
        }
        <form id="auth-form">
          ${
            !isLogin
              ? `<div class="field">
                  <label for="fullName">Full name</label>
                  <input id="fullName" name="fullName" required autocomplete="name" />
                </div>`
              : ""
          }
          <div class="field">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" required autocomplete="email" placeholder="you@example.com" />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" required minlength="6" autocomplete="${isLogin ? "current-password" : "new-password"}" />
          </div>
          ${
            !isLogin && isStaff
              ? `<div class="field">
                  <label for="deskCode">Company desk code</label>
                  <input id="deskCode" name="deskCode" required placeholder="Provided by HR" />
                  <p class="hint">Ask HR for the desk code. Demo code: <strong>VFI-HR-2026</strong></p>
                </div>`
              : ""
          }
          <button class="btn btn-red" style="width:100%" type="submit">${isLogin ? "Sign in" : "Create account"}</button>
        </form>
      </div>
    </div>
  `;
}

function renderApplicant() {
  const a = state.application;
  const locked = a && ["Offer", "Hired", "Declined", "Withdrawn"].includes(a.status);
  const positions = state.meta.positions || [];
  return `
    <div class="shell">
      ${topbar()}
      <div class="card">
        <div class="panel-header">
          <div>
            <h2>My application</h2>
            <p class="sub">Update your details and documents. Track status below.</p>
          </div>
          ${a ? `<span class="${statusClass(a.status)}">${escapeHtml(a.status)}</span>` : `<span class="status-pill status-Draft">No application yet</span>`}
        </div>
        ${flashHtml()}
        ${a?.statusNote ? `<div class="alert alert-ok"><strong>HR note:</strong> ${escapeHtml(a.statusNote)}</div>` : ""}
        <form id="app-form">
          <div class="grid-2">
            <div class="field">
              <label for="fullName">Full name</label>
              <input id="fullName" name="fullName" required value="${escapeHtml(a?.fullName || state.user.fullName)}" ${locked ? "disabled" : ""} />
            </div>
            <div class="field">
              <label for="phone">Phone</label>
              <input id="phone" name="phone" value="${escapeHtml(a?.phone || "")}" ${locked ? "disabled" : ""} />
            </div>
            <div class="field">
              <label for="city">City / area</label>
              <input id="city" name="city" value="${escapeHtml(a?.city || "")}" ${locked ? "disabled" : ""} />
            </div>
            <div class="field">
              <label for="position">Position</label>
              <select id="position" name="position" required ${locked ? "disabled" : ""}>
                <option value="">Select position</option>
                ${positions
                  .map(
                    (p) =>
                      `<option value="${escapeHtml(p)}" ${a?.position === p ? "selected" : ""}>${escapeHtml(p)}</option>`
                  )
                  .join("")}
              </select>
            </div>
          </div>
          <div class="field">
            <label for="experience">Work experience</label>
            <textarea id="experience" name="experience" ${locked ? "disabled" : ""}>${escapeHtml(a?.experience || "")}</textarea>
          </div>
          <div class="field">
            <label for="education">Education</label>
            <textarea id="education" name="education" ${locked ? "disabled" : ""}>${escapeHtml(a?.education || "")}</textarea>
          </div>
          <div class="field">
            <label for="availability">Availability / start date</label>
            <input id="availability" name="availability" value="${escapeHtml(a?.availability || "")}" ${locked ? "disabled" : ""} />
          </div>
          <div class="field">
            <label for="coverNote">Cover note</label>
            <textarea id="coverNote" name="coverNote" ${locked ? "disabled" : ""}>${escapeHtml(a?.coverNote || "")}</textarea>
          </div>
          ${
            !locked
              ? `<div class="actions-row">
                  <button class="btn btn-ghost-dark" type="submit" data-action-type="save">Save draft</button>
                  <button class="btn btn-red" type="submit" data-action-type="submit">${a?.status === "Draft" || !a ? "Submit application" : "Save updates"}</button>
                  ${a && !["Hired", "Declined", "Withdrawn"].includes(a.status) ? `<button class="btn btn-danger" type="button" data-action="withdraw">Withdraw</button>` : ""}
                </div>`
              : ""
          }
        </form>
      </div>

      <div class="card">
        <h2>Documents</h2>
        <p class="sub">Resume, certificates, or IDs. PDF, Word, JPG, PNG · max 5 MB · up to 8 files.</p>
        ${
          !locked
            ? `<form id="upload-form" class="actions-row">
                <input type="file" name="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,image/*" required />
                <button class="btn btn-primary" type="submit">Upload</button>
              </form>`
            : `<p class="muted">Uploads are closed for this status.</p>`
        }
        <ul class="file-list">
          ${(a?.files || [])
            .map(
              (f) => `
            <li>
              <div class="file-meta">
                <strong>${escapeHtml(f.originalName)}</strong>
                <span class="muted">${formatBytes(f.size)} · ${formatDate(f.uploadedAt)}</span>
              </div>
              <div class="file-actions">
                <a class="linkish" href="/api/files/${a.id}/${f.id}">Download</a>
                ${!locked ? `<button class="linkish" type="button" data-del-file="${f.id}">Remove</button>` : ""}
              </div>
            </li>`
            )
            .join("") || `<li class="empty">No files uploaded yet.</li>`}
        </ul>
      </div>

      ${
        a?.history?.length
          ? `<div class="card">
              <h2>Status timeline</h2>
              <ul class="timeline">
                ${[...a.history]
                  .reverse()
                  .map(
                    (h) => `
                  <li>
                    <strong>${escapeHtml(h.status)}</strong>
                    <div class="when">${formatDate(h.at)} · ${escapeHtml(h.by)} (${escapeHtml(h.role)})</div>
                    <div>${escapeHtml(h.note || "")}</div>
                  </li>`
                  )
                  .join("")}
              </ul>
            </div>`
          : ""
      }
    </div>
  `;
}

function renderStaffList() {
  const rows = state.applications || [];
  return `
    <div class="shell">
      ${topbar()}
      <div class="card">
        <div class="panel-header">
          <div>
            <h2>Company desk</h2>
            <p class="sub">Review applications and update status for Virginia Foods Inc.</p>
          </div>
        </div>
        ${flashHtml()}
        <div class="toolbar">
          <input id="staff-q" type="search" placeholder="Search name, email, position…" />
          <select id="staff-status">
            <option value="All">All statuses</option>
            ${(state.meta.statuses || [])
              .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
              .join("")}
          </select>
          <button class="btn btn-ghost-dark" type="button" data-action="staff-refresh">Refresh</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Position</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.length
                  ? rows
                      .map(
                        (a) => `
                <tr class="clickable" data-open-app="${a.id}">
                  <td>
                    <strong>${escapeHtml(a.fullName)}</strong><br />
                    <span class="muted">${escapeHtml(a.email)}</span>
                  </td>
                  <td>${escapeHtml(a.position)}</td>
                  <td><span class="${statusClass(a.status)}">${escapeHtml(a.status)}</span></td>
                  <td>${formatDate(a.updatedAt)}</td>
                </tr>`
                      )
                      .join("")
                  : `<tr><td colspan="4" class="empty">No applications yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderStaffDetail() {
  const a = state.applications.find((x) => x.id === state.selectedId) || state.selectedApp;
  if (!a) {
    return `<div class="shell">${topbar()}<div class="card"><p>Application not found.</p><button class="btn btn-ghost-dark" data-action="staff-back">Back</button></div></div>`;
  }
  return `
    <div class="shell">
      ${topbar()}
      <div class="card">
        <div class="panel-header">
          <div>
            <button class="linkish" type="button" data-action="staff-back">← All applications</button>
            <h2>${escapeHtml(a.fullName)}</h2>
            <p class="sub">${escapeHtml(a.email)} · ${escapeHtml(a.phone || "No phone")} · ${escapeHtml(a.city || "—")}</p>
          </div>
          <span class="${statusClass(a.status)}">${escapeHtml(a.status)}</span>
        </div>
        ${flashHtml()}
        <div class="grid-2">
          <div>
            <p><strong>Position:</strong> ${escapeHtml(a.position)}</p>
            <p><strong>Availability:</strong> ${escapeHtml(a.availability || "—")}</p>
            <p><strong>Experience</strong></p>
            <p class="muted">${escapeHtml(a.experience || "—")}</p>
            <p><strong>Education</strong></p>
            <p class="muted">${escapeHtml(a.education || "—")}</p>
            <p><strong>Cover note</strong></p>
            <p class="muted">${escapeHtml(a.coverNote || "—")}</p>
          </div>
          <div>
            <h3>Update status</h3>
            <form id="status-form">
              <div class="field">
                <label for="status">New status</label>
                <select id="status" name="status" required>
                  ${["Under Review", "Interview", "Offer", "Hired", "Declined"]
                    .map(
                      (s) =>
                        `<option value="${s}" ${a.status === s ? "selected" : ""}>${s}</option>`
                    )
                    .join("")}
                </select>
              </div>
              <div class="field">
                <label for="note">Note to applicant (optional)</label>
                <textarea id="note" name="note" placeholder="e.g. Please prepare for interview on Friday">${escapeHtml(a.statusNote || "")}</textarea>
              </div>
              <button class="btn btn-red" type="submit">Save status</button>
            </form>
          </div>
        </div>
      </div>
      <div class="card">
        <h2>Files</h2>
        <ul class="file-list">
          ${(a.files || [])
            .map(
              (f) => `
            <li>
              <div class="file-meta">
                <strong>${escapeHtml(f.originalName)}</strong>
                <span class="muted">${formatBytes(f.size)}</span>
              </div>
              <a class="linkish" href="/api/files/${a.id}/${f.id}">Download</a>
            </li>`
            )
            .join("") || `<li class="empty">No files.</li>`}
        </ul>
      </div>
      <div class="card">
        <h2>Timeline</h2>
        <ul class="timeline">
          ${[...(a.history || [])]
            .reverse()
            .map(
              (h) => `
            <li>
              <strong>${escapeHtml(h.status)}</strong>
              <div class="when">${formatDate(h.at)} · ${escapeHtml(h.by)}</div>
              <div>${escapeHtml(h.note || "")}</div>
            </li>`
            )
            .join("")}
        </ul>
      </div>
    </div>
  `;
}

function render() {
  if (state.loading) {
    $app.innerHTML = `<div class="loading">Loading portal…</div>`;
    return;
  }
  if (!state.user) {
    $app.innerHTML = state.view === "auth" ? renderAuth() : renderHome();
    return;
  }
  if (state.user.role === "staff") {
    $app.innerHTML = state.selectedId ? renderStaffDetail() : renderStaffList();
    return;
  }
  $app.innerHTML = renderApplicant();
}

async function boot() {
  try {
    const [me, meta] = await Promise.all([api("/api/me"), api("/api/meta")]);
    state.user = me.user;
    state.meta = meta;
    if (state.user?.role === "applicant") {
      const { application } = await api("/api/application");
      state.application = application;
      state.view = "applicant";
    } else if (state.user?.role === "staff") {
      const { applications } = await api("/api/staff/applications");
      state.applications = applications;
      state.view = "staff";
    }
  } catch (e) {
    state.error = e.message;
  } finally {
    state.loading = false;
    render();
  }
}

async function refreshApplicant() {
  const { application } = await api("/api/application");
  state.application = application;
}

async function refreshStaff(q = "", status = "All") {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  const { applications } = await api(`/api/staff/applications?${params}`);
  state.applications = applications;
}

$app.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-nav],[data-action],[data-auth-mode],[data-auth-role],[data-open-app],[data-del-file],[data-action-type]");
  if (!t) return;

  if (t.dataset.nav) {
    e.preventDefault();
    state.view = t.dataset.nav;
    if (t.dataset.authMode) state.authMode = t.dataset.authMode;
    if (t.dataset.authRole) state.authRole = t.dataset.authRole;
    state.error = null;
    state.message = null;
    render();
    return;
  }

  if (t.dataset.authMode) {
    state.authMode = t.dataset.authMode;
    state.error = null;
    render();
    return;
  }
  if (t.dataset.authRole) {
    state.authRole = t.dataset.authRole;
    state.error = null;
    render();
    return;
  }

  if (t.dataset.action === "logout") {
    await api("/api/logout", { method: "POST", body: {} });
    state.user = null;
    state.application = null;
    state.applications = [];
    state.selectedId = null;
    state.view = "home";
    setFlash("ok", "Signed out.");
    render();
    return;
  }

  if (t.dataset.action === "withdraw") {
    if (!confirm("Withdraw this application?")) return;
    try {
      const data = await api("/api/application", {
        method: "POST",
        body: { action: "withdraw", ...(state.application || {}) },
      });
      state.application = data.application;
      setFlash("ok", "Application withdrawn.");
      render();
    } catch (err) {
      setFlash("error", err.message);
      render();
    }
    return;
  }

  if (t.dataset.action === "staff-refresh") {
    const q = document.getElementById("staff-q")?.value || "";
    const status = document.getElementById("staff-status")?.value || "All";
    try {
      await refreshStaff(q, status);
      setFlash("ok", "List updated.");
      render();
    } catch (err) {
      setFlash("error", err.message);
      render();
    }
    return;
  }

  if (t.dataset.action === "staff-back") {
    state.selectedId = null;
    state.selectedApp = null;
    state.error = null;
    try {
      await refreshStaff();
    } catch {}
    render();
    return;
  }

  if (t.dataset.openApp) {
    state.selectedId = t.dataset.openApp;
    try {
      const { application } = await api(`/api/staff/applications/${state.selectedId}`);
      state.selectedApp = application;
      const idx = state.applications.findIndex((x) => x.id === application.id);
      if (idx >= 0) state.applications[idx] = application;
      state.error = null;
      render();
    } catch (err) {
      setFlash("error", err.message);
      render();
    }
    return;
  }

  if (t.dataset.delFile) {
    try {
      const data = await api(`/api/application/files/${t.dataset.delFile}`, { method: "DELETE" });
      state.application = data.application;
      setFlash("ok", "File removed.");
      render();
    } catch (err) {
      setFlash("error", err.message);
      render();
    }
  }
});

$app.addEventListener("submit", async (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  e.preventDefault();

  if (form.id === "auth-form") {
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    try {
      if (state.authMode === "login") {
        const data = await api("/api/login", { method: "POST", body: payload });
        state.user = data.user;
      } else {
        payload.role = state.authRole;
        const data = await api("/api/register", { method: "POST", body: payload });
        state.user = data.user;
      }
      setFlash("ok", "Welcome!");
      state.loading = true;
      render();
      if (state.user.role === "applicant") {
        await refreshApplicant();
      } else {
        await refreshStaff();
      }
      state.loading = false;
      render();
    } catch (err) {
      setFlash("error", err.message);
      render();
    }
    return;
  }

  if (form.id === "app-form") {
    const submitter = e.submitter;
    const actionType = submitter?.dataset?.actionType || "save";
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    body.action = actionType === "submit" ? "submit" : "save";
    try {
      const data = await api("/api/application", { method: "POST", body });
      state.application = data.application;
      setFlash("ok", actionType === "submit" ? "Application submitted." : "Saved.");
      render();
    } catch (err) {
      setFlash("error", err.message);
      render();
    }
    return;
  }

  if (form.id === "upload-form") {
    const fd = new FormData(form);
    try {
      const data = await api("/api/application/files", { method: "POST", body: fd });
      state.application = data.application;
      setFlash("ok", "File uploaded.");
      form.reset();
      render();
    } catch (err) {
      setFlash("error", err.message);
      render();
    }
    return;
  }

  if (form.id === "status-form") {
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    try {
      const data = await api(`/api/staff/applications/${state.selectedId}/status`, {
        method: "PATCH",
        body,
      });
      state.selectedApp = data.application;
      const idx = state.applications.findIndex((x) => x.id === data.application.id);
      if (idx >= 0) state.applications[idx] = data.application;
      setFlash("ok", "Status updated.");
      render();
    } catch (err) {
      setFlash("error", err.message);
      render();
    }
  }
});

$app.addEventListener("change", async (e) => {
  if (e.target.id === "staff-status" || e.target.id === "staff-q") {
    // live filter on change for status; search on change too
  }
});

$app.addEventListener("input", (e) => {
  if (e.target.id === "staff-q" || e.target.id === "staff-status") {
    clearTimeout(window.__staffFilterTimer);
    window.__staffFilterTimer = setTimeout(async () => {
      const q = document.getElementById("staff-q")?.value || "";
      const status = document.getElementById("staff-status")?.value || "All";
      try {
        await refreshStaff(q, status);
        render();
        const qEl = document.getElementById("staff-q");
        const sEl = document.getElementById("staff-status");
        if (qEl) {
          qEl.value = q;
          qEl.focus();
          qEl.selectionStart = qEl.selectionEnd = q.length;
        }
        if (sEl) sEl.value = status;
      } catch {}
    }, 250);
  }
});

if ("serviceWorker" in navigator) {
  // optional: no SW required for basic install prompt with manifest
}

boot();
