import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/motion.css";
import "./styles/diagram.css";

import { initCursor } from "./lib/cursor";
import { detectCapabilities } from "./lib/capabilities";
import { initContact } from "./lib/contact";
import { mountDiagram } from "./diagram";
import { mountHero } from "./hero";

initCursor();
initContact();
mountDiagram(document.getElementById("datapath"));

const caps = detectCapabilities();
mountHero(document.getElementById("hero-canvas"), caps);

// Scrollspy: highlight the nav link of the section in view.
const navLinks = [...document.querySelectorAll<HTMLAnchorElement>(".nav-links a")];
const sections = navLinks
  .map((a) => document.querySelector<HTMLElement>(a.hash))
  .filter((s): s is HTMLElement => s !== null);

const spy = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      navLinks.forEach((a) => a.classList.toggle("active", a.hash === `#${entry.target.id}`));
    }
  },
  { rootMargin: "-40% 0px -55% 0px" },
);
sections.forEach((s) => spy.observe(s));

const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());
