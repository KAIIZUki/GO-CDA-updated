import { libState, countInside } from "./store.js";

// Statuses
const statuses = {
  open: {
    label: "Open",
    cls: "is-open"
  },

  pending: {
    label: "Operating hours",
    cls: "is-warn"
  },

  temp: {
    label: "Temporarily closed",
    cls: "is-warn"
  },

  closed: {
    label: "Closed",
    cls: "is-closed"
  }
}

// Departments
// Library
let libraries = [
  {
    id: "convo",
    name: "Convocation Library",
    status: "pending",
    closureReason: null,
    occupied: 0,
    capacity: 50,
    location: "Ground floor, Main Building",
    hours: {
      mon: { opens: "08:00", closes: "20:00" },
      tue: { opens: "08:00", closes: "20:00" },
      wed: { opens: "08:00", closes: "20:00" },
      thu: { opens: "08:00", closes: "20:00" },
      fri: { opens: "08:00", closes: "18:00" },
      sat: { opens: "10:00", closes: "18:00" },
      sun: { opens: "13:00", closes: "18:00" }
    },
    updatedAt: null,
    updatedBy: "Not yet declared"
  },

  {
    id: "facit",
    name: "FACIT Library",
    status: "pending",
    closureReason: null,
    occupied: 0,
    capacity: 40,
    location: "First floor, FACIT Building",
    hours: {
      mon: { opens: "08:00", closes: "20:00" },
      tue: { opens: "08:00", closes: "20:00" },
      wed: { opens: "08:00", closes: "20:00" },
      thu: { opens: "08:00", closes: "20:00" },
      fri: { opens: "08:00", closes: "18:00" },
      sat: null,
      sun: null
    },
    updatedAt: null,
    updatedBy: "Not yet declared"
  },

  {
    id: "law",
    name: "Law Library",
    status: "pending",
    closureReason: null,
    occupied: 0,
    capacity: 30,
    location: "Law Faculty Block",
    hours: {
      mon: { opens: "08:00", closes: "20:00" },
      tue: { opens: "08:00", closes: "20:00" },
      wed: { opens: "08:00", closes: "20:00" },
      thu: { opens: "08:00", closes: "20:00" },
      fri: { opens: "08:00", closes: "18:00" },
      sat: { opens: "10:00", closes: "16:00" },
      sun: { opens: "13:00", closes: "18:00" }
    },
    updatedAt: null,
    updatedBy: "Not yet declared"
  }
]

// Pull staff-set status and the real head-count from storage
function sync() {
  libraries.forEach(l => {
    const s = libState(l.id);
    if (s) {
      l.status = s.status;
      l.closureReason = s.closureReason;
      l.updatedAt = s.updatedAt ? new Date(s.updatedAt) : null;
      l.updatedBy = s.updatedBy;
    }
    l.occupied = countInside(l.id);
  });
}

// Helpers
const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Monday-first order for the weekly timetable
const week = [
  ["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"],
  ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]
];

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getTodayHours(lib) {
  const now = new Date();

  const key = dayKeys[now.getDay()];
  const dayName = now.toLocaleDateString([], { weekday: "long" });
  const day = lib.hours[key];

  if (!day) return `${dayName}: Closed`;
  return `${dayName}: ${day.opens} - ${day.closes}`;
}

// Operating hours are informational; only a staff declaration changes status.
function getStatus(lib) {
  return lib.status;
}

// Explain the current state when the staff has not made a declaration.
function getClosureReason(lib) {
  if (getStatus(lib) === "pending") return "Currently operating hours, awaiting staff declaration.";
  if (getStatus(lib) === "open") return null;
  return lib.closureReason || "No reason given";
}

// Elements
const list = document.getElementById("status-list");
const cardDept = document.getElementById("dept-cards");

const dialog = document.getElementById("details-dialog");
const dTitle = document.getElementById("details-title");
const dBody  = document.getElementById("details-body");

// Hero status list rendering
function render() {
  list.replaceChildren(...libraries.map(lib => {
    const s = statuses[getStatus(lib)] ?? statuses.closed;

    const li = document.createElement("li");
    li.className = "status-row";

    const name = document.createElement("span");
    name.textContent = lib.name;

    const pill = document.createElement("span");
    pill.className = `pill ${s.cls}`;
    pill.innerHTML = "<i></i>";
    pill.append(s.label);

    li.append(name, pill);
    return li;
  }));
}

// A labelled block inside the pop-up
function makeSection(label, content) {
  const wrap = document.createElement("div");
  wrap.className = "d-section";

  const h = document.createElement("h3");
  h.textContent = label;

  wrap.append(h, content);
  return wrap;
}

// Details pop-up
function openDetails(lib) {
  dTitle.textContent = lib.name;
  dBody.replaceChildren();               // clear the previous library first

  const currentStatus = getStatus(lib);
  const s = statuses[currentStatus] ?? statuses.closed;
  const parts = [];                      // everything that goes into the pop-up, in order

  // 1. status pill
  const pill = document.createElement("span");
  pill.className = `pill ${s.cls}`;
  pill.innerHTML = "<i></i>";
  pill.append(s.label);
  parts.push(pill);

  // 2. closure reason (only when there is one), coloured like the status
  const reasonText = getClosureReason(lib);
  if (reasonText) {
    const reason = document.createElement("p");
    reason.className = `d-reason ${s.cls}`;
    reason.textContent = reasonText;
    parts.push(reason);
  }

  // 3. headcount
  const people = document.createElement("p");
  if (currentStatus === "pending") {
    people.textContent = "Currently operating hours, awaiting staff declaration";
  } else if (currentStatus !== "open") {
    people.textContent = "Currently closed";
  } else if (lib.occupied >= lib.capacity) {
    people.textContent = "Full";
  } else {
    people.textContent = `${lib.occupied} / ${lib.capacity} inside`;
  }
  parts.push(people);

  // 4. last update
  const updated = document.createElement("p");
  updated.className = "d-updated";
  updated.textContent = lib.updatedAt
    ? `Updated ${formatTime(lib.updatedAt)} by ${lib.updatedBy}`
    : "Not yet declared by library staff";
  parts.push(updated);

  // 5. weekly hours, today highlighted
  const todayKey = dayKeys[new Date().getDay()];
  const hoursList = document.createElement("ul");
  hoursList.className = "d-hours";

  week.forEach(([key, name]) => {
    const day = lib.hours[key];

    const li = document.createElement("li");
    li.classList.toggle("is-today", key === todayKey);

    const dayName = document.createElement("span");
    dayName.textContent = name;

    const times = document.createElement("span");
    times.textContent = day ? `${day.opens} - ${day.closes}` : "Closed";

    li.append(dayName, times);
    hoursList.append(li);
  });
  parts.push(makeSection("Opening hours", hoursList));

  // 6. location
  const place = document.createElement("p");
  place.textContent = lib.location;
  parts.push(makeSection("Location", place));

  dBody.append(...parts);
  dialog.showModal();
}

const detailsClose = document.getElementById("details-close");
if (detailsClose) {
  detailsClose.addEventListener("click", () => dialog.close());
}

// Individual library details cards rendering
function createCard(lib) {
  const s = statuses[getStatus(lib)] ?? statuses.closed;

  const card = document.createElement("article");
  card.className = "lib-card";

  const title = document.createElement("h3");
  title.textContent = lib.name;

  const pill = document.createElement("span");
  pill.className = `pill ${s.cls}`;
  pill.innerHTML = "<i></i>";
  pill.append(s.label);

  const top = document.createElement("div");
  top.className = "lib-card-top";
  top.append(title, pill);

  const hours = document.createElement("p");
  hours.textContent = getTodayHours(lib);

  // Occupancy text switches conditionally based on calculated library status
  const people = document.createElement("p");
  const currentStatus = getStatus(lib);

  if (currentStatus === "pending") {
    people.textContent = "Currently operating hours, awaiting staff declaration";
  } else if (currentStatus !== "open") {
    people.textContent = "Occupied: Currently closed";
  } else {
    const full = lib.occupied >= lib.capacity;
    people.textContent = full
      ? "Full"
      : `Occupied: ${lib.occupied} / ${lib.capacity}`;
  }

  const btn = document.createElement("button");
  btn.className = "btn";
  btn.type = "button";
  btn.textContent = "View details";
  btn.addEventListener("click", () => openDetails(lib));

  card.append(top, hours, people, btn);

  return card;
}

function renderDept() {
  cardDept.replaceChildren(...libraries.map(createCard));
}

// Initialize library views only on the page that contains them.
if (list && cardDept && dialog && dTitle && dBody) {
  const refresh = () => { sync(); render(); renderDept(); };
  refresh();
  setInterval(refresh, 60000);
  window.addEventListener("storage", refresh);   // updates when staff/students act in another tab
}

// Login and Register cards
// 1. Dom View Component Selection Elements
const regBox = document.getElementById('reg-box');
const logBox = document.getElementById('log-box');

const toLoginLink = document.getElementById('to-login');
const toRegisterLink = document.getElementById('to-register');

const customRememberClick = document.getElementById('custom-remember-click');
const realCheckbox = document.getElementById('remember');

// 2. Setup Default Active View Lifecycle on Load
if (regBox && logBox) {
    regBox.classList.add('active');
    logBox.classList.remove('active');
}

// 3. View Switch Event Toggle Dispatchers
if (toLoginLink && toRegisterLink && regBox && logBox) {
    toLoginLink.addEventListener('click', (event) => {
        event.preventDefault();
        regBox.classList.remove('active');
        logBox.classList.add('active');
    });

    toRegisterLink.addEventListener('click', (event) => {
        event.preventDefault();
        logBox.classList.remove('active');
        regBox.classList.add('active');
    });
}

// 4. Custom Mapped Checkbox Click Router
customRememberClick?.addEventListener('click', () => {
    realCheckbox?.click();
});
