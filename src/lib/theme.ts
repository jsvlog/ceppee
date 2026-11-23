/**
 * Dark mode is class-based: `<html class="dark">`. The choice is stored in
 * localStorage, and layout.tsx runs THEME_SCRIPT inline before the first paint so
 * a dark-mode student never sees a white flash on load.
 *
 * Keep this module free of React so the root layout (a server component) can
 * import the script string.
 */
export const THEME_STORAGE_KEY = "ceppee-theme";

export const THEME_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var s=localStorage.getItem(k);var d=s?s==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(_){}})();`;
