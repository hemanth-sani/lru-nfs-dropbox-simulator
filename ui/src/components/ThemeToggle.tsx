import { useEffect, useState } from "react";

/**
 * Global Theme Toggle (one button controls whole app)
 * Persists to localStorage and respects system preference on first load.
 */
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // Initialize from localStorage or prefers-color-scheme
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const shouldDark = saved ? saved === "dark" : prefersDark;
    setDark(shouldDark);
    document.documentElement.classList.toggle("dark", shouldDark);
  }, []);

  // Apply/remove .dark on <html>
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <button
      aria-label="Toggle theme"
      onClick={() => setDark(v => !v)}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm
                 border border-[var(--border)] bg-[var(--card-bg)] text-[var(--text)]
                 hover:bg-[var(--card-hover)] transition shadow-sm"
      title={dark ? "Dark" : "Light"}
    >
      <span>{dark ? "🌙" : "☀️"}</span>
      <span className="hidden sm:inline">{dark ? "Dark" : "Light"}</span>
    </button>
  );
}
