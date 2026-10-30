import {
  LIBRARIES,
  canManageStaff,
  getAccessibleLibraries,
  getSession,
  isUniversalAdmin,
  listStaff,
  updateStaff,
  logout,
  clearAppData,
  cancelOtp,
  newOtp,
  getOtp,
  attendanceForSheet,
  getAttendanceSheets,
  activeAttendanceSheet,
  startAfternoonSheet,
  renameAttendanceSheet,
  checkOut,
  libState,
  setLibState
} from "./store.js";

const $ = id => document.getElementById(id);
let s = getSession();

if (!s || s.role === "worker") {
  location.replace(s ? "worker.html" : "login.html");
} else {
  let lib = null;
  let manageableLibraries = [];
  let canManageStaffList = false;
  let universal = false;
  let selectedSheetId = null;
  const flashTimers = new WeakMap();

  const flash = (el, text, ok, duration = 5000) => {
    clearTimeout(flashTimers.get(el));
    el.textContent = text;
    el.className = "form-msg " + (ok ? "ok" : "err");
    el.hidden = false;
    if (duration) {
      flashTimers.set(el, setTimeout(() => {
        el.hidden = true;
      }, duration));
    }
  };

  $("a-logout").onclick = () => {
    logout();
    location.href = "login.html";
  };

  $("a-clear-data").onclick = () => {
    if (!isUniversalAdmin(getSession())) {
      $("a-clear-data").hidden = true;
      return;
    }
    if (!window.confirm("Clear all staff accounts, attendance, OTPs, and library statuses from this browser? This cannot be undone.")) return;
    try {
      clearAppData();
      logout();
      location.replace(new URL("login.html", location.href).href);
    } catch (err) {
      flash($("a-staff-msg"), err.message, false);
    }
  };

  function refreshPermissions() {
    s = getSession();
    if (!s || s.role === "worker") {
      location.replace(s ? "worker.html" : "login.html");
      return false;
    }
    universal = isUniversalAdmin(s);
    canManageStaffList = canManageStaff(s);
    manageableLibraries = getAccessibleLibraries(s);
    const selectedLibrary = $("a-switch").value;
    $("a-clear-data").hidden = !universal;
    $("a-staff").hidden = !canManageStaffList;
    $("a-no-permissions").hidden = canManageStaffList || manageableLibraries.length > 0;
    $("a-switch").replaceChildren(...manageableLibraries.map(l => new Option(l.name, l.id)));
    if (manageableLibraries.some(l => l.id === selectedLibrary)) $("a-switch").value = selectedLibrary;
    $("a-switch").hidden = manageableLibraries.length < 2;
    return true;
  }

  function pickLibrary() {
    const id = $("a-switch").value || manageableLibraries[0]?.id;
    lib = manageableLibraries.find(l => l.id === id) || null;
    $("a-lib").textContent = universal ? "Universal Admin Console" : "Admin Console";
    $("a-user").textContent = `Signed in as ${s.name} (${s.staffId}) - ${universal ? "Universal Admin" : "Admin"}`;
    $("a-panel").hidden = !lib;
  }

  function loadStatus() {
    const cur = lib && libState(lib.id);
    $("a-status").value = cur ? cur.status : "pending";
    $("a-reason").value = cur?.closureReason || "";
  }

  function showOtp() {
    const otp = lib && getOtp(lib.id);
    $("a-otp").textContent = otp ? otp.code : "------";
    $("a-otp-exp").textContent = otp
      ? `Expires ${new Date(otp.expires).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}`
      : "No active code";
    $("a-cancelotp").disabled = !otp;
  }

  const fmt = time => new Date(time).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
  const cell = (row, text) => {
    const td = document.createElement("td");
    td.textContent = text;
    row.append(td);
    return td;
  };

  function renderSheets() {
    if (!lib) return;
    const sheets = getAttendanceSheets(lib.id);
    const active = activeAttendanceSheet(lib.id);
    if (!sheets.some(sheet => sheet.id === selectedSheetId)) selectedSheetId = active?.id || sheets[0]?.id || null;
    $("a-sheet-select").replaceChildren(...sheets.map(sheet => new Option(
      `${sheet.name} - ${sheet.endedAt ? "Archived" : "Active"} - ${fmt(sheet.startedAt)}`,
      sheet.id
    )));
    $("a-sheet-select").value = selectedSheetId || "";
    $("a-afternoon-sheet").disabled = !lib;
  }

  function visibleRows() {
    if (!lib || !selectedSheetId) return [];
    const query = $("a-search").value.trim().toLowerCase();
    return attendanceForSheet(lib.id, selectedSheetId)
      .sort((a, b) => b.time - a.time)
      .filter(record => record.name.toLowerCase().includes(query)
        || record.regNo.toLowerCase().includes(query)
        || String(record.cardNo).toLowerCase().includes(query));
  }

  function renderRows() {
    if (!lib) {
      $("a-rows").replaceChildren();
      $("a-inside").textContent = "0";
      return;
    }
    const level = $("a-level-filter").value;
    const rows = visibleRows().filter(record => level === "all" || record.level === level);
    const sheet = getAttendanceSheets(lib.id).find(item => item.id === selectedSheetId);
    $("a-inside").textContent = rows.filter(record => !record.out).length;
    $("a-rows").replaceChildren(...rows.map(record => {
      const tr = document.createElement("tr");
      [fmt(record.time), record.name, record.regNo, record.dept, record.level, record.cardNo, record.out ? fmt(record.out) : "Inside"]
        .forEach((value, index) => {
          const td = cell(tr, value);
          if (index === 1 && !record.out && sheet?.endedAt) {
            td.classList.add("sheet-open-warning");
            td.title = "Still marked inside on an archived sheet";
          }
        });
      const action = document.createElement("td");
      if (!record.out) {
        const button = document.createElement("button");
        button.className = "btn-out";
        button.textContent = "Check out";
        button.onclick = () => {
          checkOut(record.id);
          renderRows();
        };
        action.append(button);
      }
      tr.append(action);
      return tr;
    }));
  }

  function exportCsv() {
    if (!lib) return;
    const escape = value => {
      let text = String(value ?? "");
      if (/^[=+\-@]/.test(text)) text = "'" + text;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const level = $("a-level-filter").value;
    const sheet = getAttendanceSheets(lib.id).find(item => item.id === selectedSheetId);
    const lines = [["Time in", "Name", "Reg No", "Department", "Level", "Card No", "Time out"]]
      .concat(visibleRows().filter(record => level === "all" || record.level === level).map(record =>
        [fmt(record.time), record.name, record.regNo, record.dept, record.level, record.cardNo, record.out ? fmt(record.out) : ""]));
    const url = URL.createObjectURL(new Blob([lines.map(line => line.map(escape).join(",")).join("\n")], { type: "text/csv" }));
    const filename = (sheet?.name || "attendance").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const anchor = Object.assign(document.createElement("a"), { href: url, download: `${lib.id}-${filename}.csv` });
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const hasLibraryAccess = (user, libraryId) => {
    if (user.role === "universal") return true;
    if (user.role === "admin") {
      return user.permissions.manageLibraries
        && (user.permissions.allLibraries || user.permissions.libraries.includes(libraryId));
    }
    return user.library === libraryId;
  };

  function renderStaff() {
    if (!canManageStaffList) return;
    $("a-staff").classList.remove("staff-menu-open");
    let users = listStaff();
    const filter = $("a-staff-filter").value;
    const query = $("a-staff-search").value.trim().toLowerCase();

    if (filter === "waiting") {
      users = users.filter(user => user.role === "worker"
        ? !user.library
        : user.role === "admin" && !LIBRARIES.some(library => hasLibraryAccess(user, library.id)));
    } else if (filter === "admins") {
      users = users.filter(user => user.role === "admin" || user.role === "universal");
    } else if (filter !== "all") {
      users = users.filter(user => user.role === "worker"
        ? user.library === filter
        : user.role === "admin" && !user.permissions.allLibraries && hasLibraryAccess(user, filter));
    }

    users = users.filter(user => `${user.name} ${user.staffId} ${user.email}`.toLowerCase().includes(query));
    $("a-staff-rows").replaceChildren(...users.map(user => {
      const tr = document.createElement("tr");
      const identity = cell(tr, "");
      identity.className = "staff-identity";
      const name = document.createElement("strong");
      name.textContent = user.name;
      const staffId = document.createElement("span");
      staffId.textContent = `ID: ${user.staffId}`;
      const email = document.createElement("span");
      email.textContent = user.email;
      identity.append(name, staffId, email);

      const roles = universal ? ["worker", "admin", "universal"] : ["worker", "admin"];
      if (!roles.includes(user.role)) roles.push(user.role);
      const role = document.createElement("select");
      role.setAttribute("aria-label", `Role for ${user.name}`);
      for (const value of roles) role.append(new Option(
        value === "universal" ? "Universal admin" : value[0].toUpperCase() + value.slice(1),
        value
      ));
      role.value = user.role;

      const assignment = document.createElement("select");
      assignment.setAttribute("aria-label", `Library assignment for ${user.name}`);
      assignment.append(new Option("Unassigned", ""));
      for (const library of LIBRARIES) assignment.append(new Option(library.name, library.id));
      assignment.value = user.library || "";

      const scopeAll = document.createElement("input");
      scopeAll.type = "checkbox";
      scopeAll.checked = user.permissions.allLibraries;
      scopeAll.setAttribute("aria-label", `All library access for ${user.name}`);
      const scopeAllLabel = document.createElement("label");
      scopeAllLabel.append(scopeAll, document.createTextNode(" All libraries"));

      const scopeLibraries = document.createElement("select");
      scopeLibraries.multiple = true;
      scopeLibraries.size = 3;
      scopeLibraries.setAttribute("aria-label", `Admin library scope for ${user.name}`);
      for (const library of LIBRARIES) {
        const option = new Option(library.name, library.id);
        option.selected = user.permissions.libraries.includes(library.id);
        scopeLibraries.append(option);
      }

      const manageStaff = document.createElement("input");
      manageStaff.type = "checkbox";
      manageStaff.checked = user.permissions.manageStaff;
      manageStaff.setAttribute("aria-label", `Staff management permission for ${user.name}`);

      const manageLibraries = document.createElement("input");
      manageLibraries.type = "checkbox";
      manageLibraries.checked = user.permissions.manageLibraries;
      manageLibraries.setAttribute("aria-label", `Library status and OTP permission for ${user.name}`);

      const roleField = document.createElement("label");
      roleField.className = "staff-menu-field";
      roleField.append(document.createTextNode("Role"), role);
      const assignmentField = document.createElement("label");
      assignmentField.className = "staff-menu-field";
      assignmentField.append(document.createTextNode("Worker library"), assignment);
      const scopeField = document.createElement("div");
      scopeField.className = "staff-menu-field";
      const scopeLabel = document.createElement("span");
      scopeLabel.textContent = "Admin library scope";
      scopeField.append(scopeLabel, scopeAllLabel, scopeLibraries);
      const staffPermissionLabel = document.createElement("label");
      staffPermissionLabel.className = "staff-menu-checkbox";
      staffPermissionLabel.append(manageStaff, document.createTextNode(" Manage staff"));
      const libraryPermissionLabel = document.createElement("label");
      libraryPermissionLabel.className = "staff-menu-checkbox";
      libraryPermissionLabel.append(manageLibraries, document.createTextNode(" Manage library status & OTP"));

      const bootstrapTarget = user.staffId.trim().toLowerCase() === "staff 5623";
      const currentAccount = user.staffId.trim().toLowerCase() === s.staffId.trim().toLowerCase();
      const syncControls = () => {
        const worker = role.value === "worker";
        const admin = role.value === "admin";
        const canEditPermissions = universal && admin;
        assignmentField.hidden = !worker;
        scopeField.hidden = !admin;
        scopeAllLabel.hidden = !admin;
        scopeLibraries.hidden = !admin || scopeAll.checked;
        manageStaff.disabled = !canEditPermissions;
        manageLibraries.disabled = !canEditPermissions;
        scopeAll.disabled = !canEditPermissions;
        scopeLibraries.disabled = !canEditPermissions || scopeAll.checked;
        assignment.disabled = bootstrapTarget || currentAccount || role.value === "universal";
        role.disabled = bootstrapTarget || currentAccount || (user.role === "universal" && !universal);
        save.disabled = bootstrapTarget || currentAccount;
      };

      const save = document.createElement("button");
      save.className = "btn-out";
      save.textContent = "Save";
      const menu = document.createElement("details");
      menu.className = "staff-menu";
      const trigger = document.createElement("summary");
      trigger.className = "staff-menu-trigger";
      trigger.setAttribute("aria-label", `Manage ${user.name}`);
      for (let index = 0; index < 3; index += 1) {
        const dot = document.createElement("span");
        dot.className = "staff-menu-dot";
        trigger.append(dot);
      }
      const menuPanel = document.createElement("div");
      menuPanel.className = "staff-menu-panel";
      menuPanel.append(
        roleField,
        assignmentField,
        scopeField,
        staffPermissionLabel,
        libraryPermissionLabel,
        save
      );
      menu.append(trigger, menuPanel);
      const menuCell = cell(tr, "");
      menuCell.className = "staff-menu-cell";
      menuCell.append(menu);
      menu.addEventListener("toggle", () => {
        $("a-staff").classList.toggle(
          "staff-menu-open",
          document.querySelector(".staff-menu[open]") !== null
        );
      });

      role.onchange = syncControls;
      scopeAll.onchange = syncControls;
      syncControls();
      menu.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          menu.open = false;
          trigger.focus();
        }
      });
      save.onclick = () => {
        try {
          const permissions = role.value === "admin" && universal ? {
            allLibraries: scopeAll.checked,
            libraries: [...scopeLibraries.selectedOptions].map(option => option.value),
            manageStaff: manageStaff.checked,
            manageLibraries: manageLibraries.checked
          } : undefined;
          updateStaff(user.staffId, {
            role: role.value,
            library: role.value === "worker" ? assignment.value : null,
            ...(permissions ? { permissions } : {})
          });
          flash($("a-staff-msg"), `Saved ${user.name}.`, true);
          renderStaff();
        } catch (err) {
          flash($("a-staff-msg"), err.message, false);
        }
      };
      cell(tr, "").append(save);
      return tr;
    }));
  }

  function refreshAll() {
    if (!refreshPermissions()) return;
    const previousLibrary = lib?.id;
    pickLibrary();
    if (lib?.id !== previousLibrary) loadStatus();
    renderSheets();
    showOtp();
    renderRows();
    renderStaff();
  }

  $("a-switch").onchange = () => {
    pickLibrary();
    loadStatus();
    showOtp();
    renderSheets();
    renderRows();
  };
  $("a-save").onclick = () => {
    if (!lib) return;
    try {
      setLibState(lib.id, {
        status: $("a-status").value,
        closureReason: $("a-reason").value.trim() || null,
        updatedBy: s.name
      });
      showOtp();
      flash($("a-msg"), "Status saved.", true, 5000);
    } catch (err) {
      flash($("a-msg"), err.message, false);
    }
  };
  $("a-newotp").onclick = () => {
    if (!lib) return;
    try {
      newOtp(lib.id);
      showOtp();
    } catch (err) {
      flash($("a-msg"), err.message, false);
    }
  };
  $("a-cancelotp").onclick = () => {
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
  $("a-rename-sheet").onclick = () => {
    if (!lib) return;
    const sheet = getAttendanceSheets(lib.id).find(item => item.id === selectedSheetId);
    if (!sheet) return;
    const name = window.prompt("Enter a new name for this attendance sheet:", sheet.name);
    if (name === null) return;
    try {
      renameAttendanceSheet(lib.id, sheet.id, name);
      renderSheets();
      flash($("a-msg"), "Attendance sheet renamed.", true);
    } catch (err) {
      flash($("a-msg"), err.message, false);
    }
  };
  $("a-csv").onclick = exportCsv;
  $("a-staff-filter").onchange = renderStaff;
  $("a-staff-search").oninput = renderStaff;

  refreshAll();
  window.addEventListener("storage", refreshAll);
  setInterval(refreshAll, 30000);
}
