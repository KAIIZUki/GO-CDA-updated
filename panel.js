// panel.js - the status / OTP / attendance panel shared by admin.html and worker.html
import {
  getOtp, newOtp, cancelOtp, attendanceForSheet, getAttendanceSheets,
  activeAttendanceSheet, startAfternoonSheet, checkOut, libState, setLibState
} from "./store.js";

const $ = id => document.getElementById(id);
const fmt = t => new Date(t).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
export function cell(tr, text) { const td = document.createElement("td"); td.textContent = text; tr.append(td); }

// getLib() returns the library being managed ({id, name}) or null; getUser() the signed-in user
export function mountPanel(getLib, getUser) {
  let selectedSheetId = null;
  const flash = (el, text, ok) => { el.textContent = text; el.className = "form-msg " + (ok ? "ok" : "err"); el.hidden = false; };

  function loadStatus() {
    const lib = getLib(), cur = lib && libState(lib.id);
    $("a-status").value = cur ? cur.status : "pending";
    $("a-reason").value = cur?.closureReason || "";
  }

  function showOtp() {
    const lib = getLib(), o = lib && getOtp(lib.id);
    $("a-otp").textContent = o ? o.code : "------";
    $("a-otp-exp").textContent = o ? `Expires ${new Date(o.expires).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}` : "No active code";
    $("a-cancelotp").disabled = !o;
  }

  function renderSheets() {
    const lib = getLib();
    if (!lib) return;
    const sheets = getAttendanceSheets(lib.id);
    const active = activeAttendanceSheet(lib.id);
    if (!sheets.some(sheet => sheet.id === selectedSheetId)) selectedSheetId = active?.id || sheets[0]?.id || null;
    $("a-sheet-select").replaceChildren(...sheets.map(sheet => new Option(
      `${sheet.name} - ${sheet.endedAt ? "Archived" : "Active"} - ${fmt(sheet.startedAt)}`,
      sheet.id
    )));
    $("a-sheet-select").value = selectedSheetId || "";
    $("a-afternoon-sheet").disabled = !getUser();
  }

  function visibleRows() {
    const lib = getLib();
    if (!lib || !selectedSheetId) return [];
    const q = $("a-search").value.trim().toLowerCase();
    return attendanceForSheet(lib.id, selectedSheetId).sort((a, b) => b.time - a.time)
      .filter(r => r.name.toLowerCase().includes(q) || r.regNo.toLowerCase().includes(q));
  }

  function renderRows() {
    const lib = getLib();
    if (!lib) return;
    const level = $("a-level-filter").value;
    const rows = visibleRows().filter(record => level === "all" || record.level === level);
    const sheet = getAttendanceSheets(lib.id).find(item => item.id === selectedSheetId);
    $("a-inside").textContent = rows.filter(record => !record.out).length;
    $("a-rows").replaceChildren(...rows.map(r => {
      const tr = document.createElement("tr");
      [fmt(r.time), r.name, r.regNo, r.dept, r.level, r.cardNo, r.out ? fmt(r.out) : "Inside"].forEach((text, index) => {
        const td = cell(tr, text);
        if (index === 1 && !r.out && sheet?.endedAt) {
          td.classList.add("sheet-open-warning");
          td.title = "Still marked inside on an archived sheet";
        }
      });
      const td = document.createElement("td");
      if (!r.out) {
        const b = document.createElement("button");
        b.className = "btn-out"; b.textContent = "Check out";
        b.onclick = () => { checkOut(r.id); renderRows(); };
        td.append(b);
      }
      tr.append(td);
      return tr;
    }));
  }

  $("a-save").onclick = () => {
    const lib = getLib(); if (!lib) return;
    try {
      setLibState(lib.id, { status: $("a-status").value, closureReason: $("a-reason").value.trim() || null, updatedBy: getUser().name });
      showOtp();
      flash($("a-msg"), "Status saved.", true);
    } catch (err) { flash($("a-msg"), err.message, false); }
  };

  $("a-newotp").onclick = () => {
    const lib = getLib();
    if (!lib) return;
    try {
      newOtp(lib.id);
      showOtp();
      flash($("a-msg"), "A new OTP is active for 24 hours.", true);
    } catch (err) {
      flash($("a-msg"), err.message, false);
    }
  };
  $("a-cancelotp").onclick = () => {
    const lib = getLib();
    if (!lib) return;
    try {
      cancelOtp(lib.id);
      showOtp();
      flash($("a-msg"), "Attendance OTP cancelled.", true);
    } catch (err) {
      flash($("a-msg"), err.message, false);
    }
  };
  $("a-search").oninput = renderRows;
  $("a-level-filter").onchange = renderRows;
  $("a-sheet-select").onchange = () => {
    selectedSheetId = $("a-sheet-select").value;
    renderRows();
  };
  $("a-afternoon-sheet").onclick = () => {
    const lib = getLib();
    if (!lib || !window.confirm("End the current sheet and start an afternoon sheet? Students still inside will remain marked inside on the archived sheet.")) return;
    try {
      selectedSheetId = startAfternoonSheet(lib.id).id;
      renderSheets();
      renderRows();
      flash($("a-msg"), "Afternoon sheet started. The previous sheet is archived.", true);
    } catch (err) {
      flash($("a-msg"), err.message, false);
    }
  };

  // CSV export guards against spreadsheet formula injection.
  $("a-csv").onclick = () => {
    const lib = getLib(); if (!lib) return;
    const esc = v => { v = String(v ?? ""); if (/^[=+\-@]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };
    const lines = [["Time in", "Name", "Reg No", "Department", "Level", "Card No", "Time out"]]
      .concat(visibleRows().filter(r => $("a-level-filter").value === "all" || r.level === $("a-level-filter").value).map(r =>
        [fmt(r.time), r.name, r.regNo, r.dept, r.level, r.cardNo, r.out ? fmt(r.out) : ""]));
    const url = URL.createObjectURL(new Blob([lines.map(l => l.map(esc).join(",")).join("\n")], { type: "text/csv" }));
    const sheet = getAttendanceSheets(lib.id).find(item => item.id === selectedSheetId);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `${lib.id}-${(sheet?.name || "attendance").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`
    });
    a.click(); URL.revokeObjectURL(url);
  };

  setInterval(() => { showOtp(); renderSheets(); renderRows(); }, 30000);
  return { loadStatus, showOtp, renderSheets, renderRows };
}
