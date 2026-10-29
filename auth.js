import { LIBRARIES, registerStaff, loginStaff, getSession, markAttendance } from "./store.js";

const $ = id => document.getElementById(id);
function msg(el, text, ok = false) {
  el.textContent = text;
  el.className = "form-msg " + (ok ? "ok" : "err");
  el.hidden = !text;
}

const fillLibraries = sel => sel && LIBRARIES.forEach(l => sel.append(new Option(l.name, l.id)));

// ---------- staff login page ----------
if ($("log-box") && $("loginStaffId")) {
  const session = getSession();
  if (session) location.replace(session.role === "worker" ? "worker.html" : "admin.html");

  $("reg-box").addEventListener("submit", async e => {
    e.preventDefault();
    if ($("password").value !== $("confirmPassword").value) return msg($("reg-msg"), "Passwords do not match.");
    try {
      const role = await registerStaff({
        lastName: $("LastName").value.trim(), firstName: $("firstName").value.trim(),
        email: $("email").value.trim(), staffId: $("staffId").value.trim(),
        password: $("password").value
      });
      e.target.reset();
      $("to-login").click();
      msg($("log-msg"), role === "universal"
        ? "Universal debug admin account created. Please log in."
        : "Account created. Log in; an admin will assign you a library and permissions.", true);
    } catch (err) { msg($("reg-msg"), err.message); }
  });

  $("log-box").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      const user = await loginStaff({
        staffId: $("loginStaffId").value.trim(), email: $("loginEmail").value.trim(),
        password: $("loginPassword").value
      }, $("remember").checked);
      location.href = user.role === "worker" ? "worker.html" : "admin.html";
    } catch (err) { msg($("log-msg"), err.message); }
  });
}

// ---------- student attendance page ----------
const form = $("att-form");
if (form) {
  fillLibraries($("Library"));
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (form.dataset.submitting === "true") return;
    form.dataset.submitting = "true";
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      await markAttendance({
        libId: $("Library").value,
        name: $("FullName").value.trim(),
        regNo: $("RegNo").value.trim().toUpperCase(),
        dept: $("Department").value.trim(),
        level: $("Level").value,
        cardNo: $("CardNo").value.trim(),
        otp: $("OneTimePassword").value.trim()
      });
      form.reset();
      msg($("reg-msg"), "Attendance marked. Welcome in!", true);
    } catch (err) {
      msg($("reg-msg"), err.message);
    } finally {
      form.dataset.submitting = "false";
      submitButton.disabled = false;
    }
  });
}