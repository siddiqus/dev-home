import type { Metadata } from "next";
import "bootstrap/dist/css/bootstrap.min.css";
import "../src/index.css";

export const metadata: Metadata = {
  title: "Dev Home",
  description: "Developer Home Dashboard - JIRA & GitHub integration",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  try {
    var pref = localStorage.getItem("dev-home-theme");
    var resolved =
      pref === "light" || pref === "dark"
        ? pref
        : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.setAttribute("data-theme", resolved);
  } catch (e) {
    /* localStorage/matchMedia unavailable — fall back to CSS default */
  }
})();
            `.trim(),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
