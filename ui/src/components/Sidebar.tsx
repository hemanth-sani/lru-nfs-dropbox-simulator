import { NavLink } from "react-router-dom";
import { XMarkIcon } from "@heroicons/react/24/outline";

export default function Sidebar({
  mobileOpen,
  setMobileOpen,
}: {
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}) {
  const link = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2 rounded-lg text-sm ${
      isActive
        ? "bg-slate-900 text-white dark:bg-slate-200 dark:text-black"
        : "hover:bg-slate-100 dark:hover:bg-slate-800"
    }`;

  // Desktop sidebar
  return (
    <>
      <aside className="hidden md:block w-60 shrink-0 border-r border-slate-200 dark:border-slate-800 p-3 space-y-2">
        <div className="text-xs uppercase tracking-wide text-slate-500">Navigation</div>
        <NavLink to="/files" className={link}>Files</NavLink>
        <NavLink to="/upload" className={link}>Upload</NavLink>
      </aside>

      {/* Mobile slide-in */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-white dark:bg-[#0b0e14] border-r border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center mb-3">
              <div className="font-semibold">Menu</div>
              <button className="ml-auto" onClick={() => setMobileOpen(false)}>
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <nav className="space-y-2">
              <NavLink to="/files" className={link} onClick={() => setMobileOpen(false)}>Files</NavLink>
              <NavLink to="/upload" className={link} onClick={() => setMobileOpen(false)}>Upload</NavLink>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
