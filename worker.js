import { LIBRARIES, getSession, logout } from "./store.js";
import { mountPanel } from "./panel.js";

const $ = id => document.getElementById(id);
let s = getSession();
if (!s) location.replace("login.html");
else if (s.role !== "worker") location.replace("admin.html");   // admins have their own page

let lib = null;
const panel = mountPanel(() => lib, () => s);
$("a-logout").onclick = () => { logout(); location.href = "login.html"; };

// Re-reads the account, so a new assignment (or role change) from an admin shows up at once
function refresh() {
  s = getSession();
  if (!s) return location.replace("login.html");
  if (s.role !== "worker") return location.replace("admin.html");
  const prev = lib?.id;
  lib = LIBRARIES.find(l => l.id === s.library) || null;
  $("a-lib").textContent = lib ? `${lib.name} - Staff` : "Staff";
  $("a-user").textContent = `Signed in as ${s.name} (${s.staffId}) - Worker`;
  $("a-pending").hidden = !!lib;
  $("a-panel").hidden = !lib;
  if (lib?.id !== prev) panel.loadStatus();
  panel.showOtp(); panel.renderRows();
}
refresh();
window.addEventListener("storage", refresh);
setInterval(refresh, 30000);
