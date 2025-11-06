import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import App from "./App";
import FileList from "./pages/FileList";
import Upload from "./pages/Upload";
import ViewFile from "./pages/ViewFile";
import Trash from "./pages/Trash";
import { ToastProvider } from "./components/ToastProvider";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Layout wrapper (App holds Navbar, etc.) */}
          <Route element={<App />}>
            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/files" replace />} />

            {/* Main pages */}
            <Route path="/files" element={<FileList />} />
            <Route path="/files/:name" element={<ViewFile />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/trash" element={<Trash />} />
            <Route path="/view/:name" element={<ViewFile />} />

            {/* 404 fallback */}
            <Route path="*" element={<div style={{ padding: "2rem" }}>404 - Page Not Found</div>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </React.StrictMode>
);
