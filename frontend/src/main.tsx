import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminApp } from "./admin/AdminApp";
import { TestApp } from "./test/TestApp";
import "./styles.css";

const isAdmin = /^\/admin(\/|$)/.test(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isAdmin ? <AdminApp /> : <TestApp />}</StrictMode>
);
