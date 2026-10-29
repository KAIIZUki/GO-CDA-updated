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

for (const toggle of toggles) {
  const menu = document.getElementById(toggle.getAttribute("aria-controls"));
  if (!menu) continue;

  toggle.addEventListener("click", () => {
    const opening = toggle.getAttribute("aria-expanded") !== "true";
    closeMenus(toggle);
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
  if (!event.target.closest("[data-menu-toggle], .menu-panel")) closeMenus();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeMenus();
});
