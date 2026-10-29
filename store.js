// store.js - the ONLY file that touches storage. Swap these functions for
// fetch() calls to a real backend later and nothing else has to change.
export const LIBRARIES = [
  { id: "convo", name: "Convocation Library" },
  { id: "facit", name: "FACIT Library" },
  { id: "law", name: "Law Library" }
];

const K = { users: "cda_users", session: "cda_session", att: "cda_attendance", sheets: "cda_attendance_sheets", otp: "cda_otp", libs: "cda_libs" };
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const normalizeStaffId = staffId => String(staffId).trim().toLowerCase();
const isBootstrapAdmin = staffId => normalizeStaffId(staffId) === "staff 5623";
const emptyPermissions = () => ({ allLibraries: false, libraries: [], manageStaff: false, manageLibraries: false });
const legacyPermissions = () => ({ allLibraries: true, libraries: LIBRARIES.map(l => l.id), manageStaff: true, manageLibraries: true });

function normalizePermissions(permissions, fallback = emptyPermissions()) {
  const source = permissions || fallback;
  return {
    allLibraries: Boolean(source.allLibraries),
    libraries: Array.isArray(source.libraries)
      ? [...new Set(source.libraries.filter(id => LIBRARIES.some(l => l.id === id)))]
      : [],
    manageStaff: Boolean(source.manageStaff),
    manageLibraries: Boolean(source.manageLibraries)
  };
}

export async function hash(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ---- staff accounts ----
export async function registerStaff(u) {
  const users = read(K.users, []);
  const staffId = String(u.staffId || "").trim();
  const email = String(u.email || "").trim();
  if (!staffId || !email || !u.password) throw new Error("Complete all required fields.");
  if (users.some(x => normalizeStaffId(x.staffId) === normalizeStaffId(staffId) || x.email.toLowerCase() === email.toLowerCase()))
    throw new Error("That Staff ID or email is already registered.");
  const role = isBootstrapAdmin(staffId) ? "universal" : "worker";
  users.push({ ...u, staffId, email, library: null, role, password: await hash(u.password) });
  write(K.users, users);
  return role;
}

export async function loginStaff({ staffId, email, password }, remember) {
  const h = await hash(password);
  const u = read(K.users, []).find(x => normalizeStaffId(x.staffId) === normalizeStaffId(staffId)
    && x.email.toLowerCase() === email.toLowerCase() && x.password === h);
  if (!u) throw new Error("Wrong Staff ID, email or password.");
  (remember ? localStorage : sessionStorage).setItem(K.session, JSON.stringify({ staffId: u.staffId }));
  return publicUser(u);
}

const publicUser = u => {
  const { password, ...r } = u;
  const role = isBootstrapAdmin(u.staffId) ? "universal" : u.role || "worker";
  return {
    ...r,
    role,
    library: role === "universal" || role === "admin" ? null : u.library || null,
    permissions: role === "universal"
      ? { allLibraries: true, libraries: LIBRARIES.map(l => l.id), manageStaff: true, manageLibraries: true }
      : role === "admin"
        ? normalizePermissions(u.permissions, legacyPermissions())
        : emptyPermissions(),
    name: `${u.firstName} ${u.lastName}`
  };
};

export function getSession() {
  const raw = JSON.parse(sessionStorage.getItem(K.session) || localStorage.getItem(K.session) || "null");
  const u = raw && read(K.users, []).find(x => normalizeStaffId(x.staffId) === normalizeStaffId(raw.staffId));
  return u ? publicUser(u) : null;
}
export const isUniversalAdmin = user => user?.role === "universal";
export const canManageStaff = user => isUniversalAdmin(user) || (user?.role === "admin" && user.permissions.manageStaff);
export const canManageLibrary = (libId, user = getSession()) => {
  if (!user) return false;
  if (user.role === "universal") return LIBRARIES.some(l => l.id === libId);
  if (user.role === "admin") {
    return user.permissions.manageLibraries
      && (user.permissions.allLibraries || user.permissions.libraries.includes(libId));
  }
  return user.library === libId;
};
export const getAccessibleLibraries = (user = getSession()) => LIBRARIES.filter(l => canManageLibrary(l.id, user));
const canManage = libId => canManageLibrary(libId);
export const logout = () => { sessionStorage.removeItem(K.session); localStorage.removeItem(K.session); };

// ---- OTP (staff generates it, student types it) ----
export function newOtp(libId) {
  if (!canManage(libId)) throw new Error("Not allowed for this library.");
  const state = libState(libId);
  if (state?.status === "closed" || state?.status === "temp")
    throw new Error("The attendance OTP cannot be created while the library is closed.");
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  const all = read(K.otp, {});
  all[libId] = { code, expires: Date.now() + 24 * 60 * 60 * 1000 };
  write(K.otp, all);
  return all[libId];
}
export const getOtp = libId => {
  const state = libState(libId);
  if (state?.status === "closed" || state?.status === "temp") return null;
  const otp = read(K.otp, {})[libId];
  return otp && otp.expires > Date.now() ? otp : null;
};
export function cancelOtp(libId) {
  if (!canManage(libId)) throw new Error("Not allowed for this library.");
  const all = read(K.otp, {});
  if (!all[libId]) return false;
  delete all[libId];
  write(K.otp, all);
  return true;
}

// ---- attendance ----
export const allAttendance = () => read(K.att, []);
const today = () => new Date().toDateString();

function getAttendanceSheetsState() {
  const sheets = read(K.sheets, []);
  const records = read(K.att, []);
  let changedSheets = false;
  let changedRecords = false;
  for (const lib of LIBRARIES) {
    const legacy = records.filter(record => record.libId === lib.id && !record.sheetId);
    if (legacy.length) {
      let sheet = sheets.find(item => item.libId === lib.id && !item.endedAt);
      if (!sheet) {
        sheet = {
          id: crypto.randomUUID(),
          libId: lib.id,
          name: "Existing sheet",
          startedAt: Math.min(...legacy.map(record => record.time)),
          endedAt: null
        };
        sheets.push(sheet);
        changedSheets = true;
      }
      for (const record of legacy) {
        record.sheetId = sheet.id;
        changedRecords = true;
      }
    }
    if (!sheets.some(item => item.libId === lib.id && !item.endedAt)) {
      sheets.push({
        id: crypto.randomUUID(),
        libId: lib.id,
        name: "Current sheet",
        startedAt: Date.now(),
        endedAt: null
      });
      changedSheets = true;
    }
  }
  if (changedRecords) write(K.att, records);
  if (changedSheets) write(K.sheets, sheets);
  return sheets;
}

export function getAttendanceSheets(libId) {
  if (!LIBRARIES.some(lib => lib.id === libId)) throw new Error("Library not found.");
  return getAttendanceSheetsState()
    .filter(sheet => sheet.libId === libId)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export function activeAttendanceSheet(libId) {
  return getAttendanceSheets(libId).find(sheet => !sheet.endedAt) || null;
}

export function attendanceForSheet(libId, sheetId) {
  const sheet = getAttendanceSheets(libId).find(item => item.id === sheetId);
  if (!sheet) throw new Error("Attendance sheet not found.");
  return allAttendance().filter(record => record.libId === libId && record.sheetId === sheetId);
}

export function startAfternoonSheet(libId) {
  if (!canManage(libId)) throw new Error("Not allowed for this library.");
  const sheets = getAttendanceSheetsState();
  const now = Date.now();
  const current = sheets.find(sheet => sheet.libId === libId && !sheet.endedAt);
  if (current) current.endedAt = now;
  const previousAfternoons = sheets.filter(sheet => sheet.libId === libId && sheet.name.startsWith("Afternoon sheet")).length;
  const nextSheet = {
    id: crypto.randomUUID(),
    libId,
    name: previousAfternoons ? `Afternoon sheet ${previousAfternoons + 1}` : "Afternoon sheet",
    startedAt: now,
    endedAt: null
  };
  sheets.push(nextSheet);
  write(K.sheets, sheets);
  return nextSheet;
}

export async function markAttendance(r) {
  const o = getOtp(r.libId);
  if (!o || o.code !== r.otp) throw new Error("Invalid or expired OTP. Ask the library staff for a new one.");
  const saveAttendance = () => {
    const sheet = activeAttendanceSheet(r.libId);
    if (!sheet) return new Error("Attendance is paused. Ask library staff to start a new sheet.");
    const all = read(K.att, []);
    if (all.some(x => x.regNo.toLowerCase() === r.regNo.toLowerCase()
        && x.libId === r.libId && x.sheetId === sheet.id && !x.out))
      return new Error("You are already checked in. Ask staff to check you out first.");
    const { otp, ...rec } = r;
    all.push({ ...rec, sheetId: sheet.id, id: crypto.randomUUID(), time: Date.now(), out: null });
    write(K.att, all);
    return null;
  };
  let error;
  if (navigator.locks) {
    error = await navigator.locks.request(`cda-attendance-${r.libId}`, saveAttendance);
  } else {
    error = saveAttendance();
  }
  if (error) throw error;
}

export function checkOut(id) {
  const all = read(K.att, []);
  const r = all.find(x => x.id === id);
  if (r && !canManage(r.libId)) return;
  if (r) { r.out = Date.now(); write(K.att, all); }
}

export const countInside = libId => read(K.att, []).filter(x => x.libId === libId && !x.out && new Date(x.time).toDateString() === today()).length;

// ---- staff-set library status ----
export const libState = id => read(K.libs, {})[id];
export function setLibState(id, s) {
  if (!canManage(id)) throw new Error("You do not have permission to change this library's status.");
  if (!LIBRARIES.some(l => l.id === id)) throw new Error("Library not found.");
  if (!["open", "temp", "closed"].includes(s.status)) throw new Error("Choose a valid library status.");
  const all = read(K.libs, {});
  all[id] = { ...s, updatedAt: Date.now() };
  write(K.libs, all);
  if (s.status === "closed" || s.status === "temp") {
    const otps = read(K.otp, {});
    if (otps[id]) {
      delete otps[id];
      write(K.otp, otps);
    }
  }
}

// ---- staff management ----
export function listStaff() {
  if (!canManageStaff(getSession())) throw new Error("You do not have permission to manage staff.");
  return read(K.users, []).map(publicUser);
}
export function updateStaff(staffId, { library, role, permissions }) {
  const actor = getSession();
  if (!canManageStaff(actor)) throw new Error("You do not have permission to manage staff.");
  if (!["worker", "admin", "universal"].includes(role)) throw new Error("Choose a valid staff role.");
  if (role === "universal" && !isUniversalAdmin(actor))
    throw new Error("Only a universal admin can create universal admins.");
  if (library && !LIBRARIES.some(l => l.id === library)) throw new Error("Choose a valid library.");
  const users = read(K.users, []);
  const u = users.find(x => normalizeStaffId(x.staffId) === normalizeStaffId(staffId));
  if (!u) throw new Error("Staff member not found.");
  if (normalizeStaffId(actor.staffId) === normalizeStaffId(u.staffId))
    throw new Error("You cannot change your own staff account.");
  const previousRole = u.role || "worker";
  if (previousRole === "universal" && !isUniversalAdmin(actor))
    throw new Error("Only a universal admin can change a universal admin account.");
  if (isBootstrapAdmin(u.staffId) && role !== "universal")
    throw new Error("Staff 5623 is the fixed universal administrator.");
  if (role === "universal" && library) throw new Error("Universal admins do not need a library assignment.");
  if (permissions && !isUniversalAdmin(actor))
    throw new Error("Only a universal admin can change admin permissions.");
  if (permissions && !Array.isArray(permissions.libraries))
    throw new Error("Choose valid library permissions.");
  u.role = role;
  if (role === "worker") {
    u.library = library || null;
    delete u.permissions;
  } else {
    u.library = null;
    if (role === "admin") {
      if (permissions) u.permissions = normalizePermissions(permissions);
      else if (previousRole !== "admin") u.permissions = emptyPermissions();
    } else {
      delete u.permissions;
    }
  }
  write(K.users, users);
}

export function clearAppData() {
  if (!isUniversalAdmin(getSession())) throw new Error("Only a universal admin can clear app data.");
  for (const key of Object.values(K)) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
  logout();
}