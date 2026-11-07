import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/bootstrap.scss";
import "./index.css";
import App from "./App";
import { initAnalytics } from "./lib/analytics";

initAnalytics();

// iOS Safari ignores the viewport's user-scalable=no; cancelling its pinch
// gesture keeps the page at its fixed scale there too.
document.addEventListener("gesturestart", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
