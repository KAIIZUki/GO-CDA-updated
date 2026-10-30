const toggles = [...document.querySelectorAll("[data-menu-toggle]")];

function closeMenus(except) {
  for (const toggle of toggles) {
    const menu = document.getElementById(toggle.getAttribute("aria-controls"));
    if (toggle === except || !menu) continue;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    menu.classList.remove("is-open");
  }
}

function closeStaffMenus(except) {
  for (const menu of document.querySelectorAll(".staff-menu[open]")) {
    if (menu !== except) menu.open = false;
  }
}

function closeClearMenus(except) {
  for (const menu of document.querySelectorAll(".clear-menu[open]")) {
    if (menu !== except) menu.open = false;
  }
}

for (const toggle of toggles) {
  const menu = document.getElementById(toggle.getAttribute("aria-controls"));
  if (!menu) continue;

  toggle.addEventListener("click", () => {
    const opening = toggle.getAttribute("aria-expanded") !== "true";
    closeMenus(toggle);
    closeStaffMenus();
    closeClearMenus();
    toggle.setAttribute("aria-expanded", String(opening));
    toggle.setAttribute("aria-label", opening ? "Close menu" : "Open menu");
    menu.classList.toggle("is-open", opening);
  });

  menu.addEventListener("click", event => {
    if (event.target.closest("a")) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
      menu.classList.remove("is-open");
    }
  });
}

document.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : null;
  const clickedToggle = target?.closest("[data-menu-toggle]");
  const clickedPanel = target?.closest(".menu-panel");
  const clickedClearMenu = target?.closest(".clear-menu");
  const clickedStaffMenu = target?.closest(".staff-menu");

  if (clickedToggle) {
    closeStaffMenus();
    closeClearMenus();
    return;
  }
  if (clickedClearMenu) {
    closeStaffMenus();
    closeClearMenus(clickedClearMenu);
    return;
  }
  if (clickedPanel) {
    closeStaffMenus();
    closeClearMenus();
    return;
  }
  if (clickedStaffMenu) {
    closeMenus();
    closeStaffMenus(clickedStaffMenu);
    closeClearMenus();
    return;
  }
  closeMenus();
  closeStaffMenus();
  closeClearMenus();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeMenus();
    closeStaffMenus();
    closeClearMenus();
  }
});
