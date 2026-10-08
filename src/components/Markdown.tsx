import { lazy, Suspense } from "react";

// The unified/remark/rehype stack (rehype-raw pulls in parse5) is ~330 KB, so it
// loads on first render of a description instead of with the app shell.
const MarkdownRenderer = lazy(() => import("./MarkdownRenderer"));

export function Markdown({ children }: { children: string }) {
  return (
    <Suspense fallback={<div className="markdown-body" />}>
      <MarkdownRenderer>{children}</MarkdownRenderer>
    </Suspense>
  );
}
