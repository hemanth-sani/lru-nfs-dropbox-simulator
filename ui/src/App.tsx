import { Outlet } from "react-router-dom";
import Navbar from "./components/Navbar";

export default function App() {
  return (
    <>
      <Navbar />
      <main style={{ padding: "1rem 2rem" }}>
        <Outlet />
      </main>
    </>
  );
}
