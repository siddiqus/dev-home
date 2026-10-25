import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/bootstrap.scss";
import "./index.css";
import App from "./App";
import { initAnalytics } from "./lib/analytics";

initAnalytics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
