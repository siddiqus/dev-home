"use client";

import dynamic from "next/dynamic";

// The app reads localStorage during its first render, so it only runs in the browser.
const App = dynamic(() => import("../src/App"), { ssr: false });

export default function ClientApp() {
  return <App />;
}
