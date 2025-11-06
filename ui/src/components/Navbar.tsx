// ui/src/components/Navbar.tsx
import { NavLink } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import styles from "./Navbar.module.css";

export default function Navbar() {
  return (
    <header className={styles.navbar}>
      <div className={styles.inner}>
        {/* Logo */}
        <div className={styles.logo}>📁 <span>DocStore</span></div>

        {/* Center tabs */}
        <nav className={styles.tabs}>
          <NavLink to="/files" className={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}>Files</NavLink>
          <NavLink to="/upload" className={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}>Upload</NavLink>
          <NavLink to="/trash" className={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}>Trash</NavLink>
        </nav>

        {/* Right controls */}
        <div className={styles.right}>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
