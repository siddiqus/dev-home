import { useContext, useEffect, useMemo, useRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { hasSignedAttachments } from "../api/github/attachments";
import { ImageExpiredContext } from "./markdownImages";

// GitHub-flavoured rendering: GFM (tables, task lists, strikethrough,
// autolinks), hard line breaks like PR bodies/comments, and the inline HTML
// GitHub permits (<details>, <img>, <br>…). rehype-sanitize runs after
// rehype-raw and uses GitHub's own allowlist, so scripts/handlers are stripped.
const REMARK_PLUGINS = [remarkGfm, remarkBreaks];
const REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize];

export default function MarkdownRenderer({ children }: { children: string }) {
  // Read through a ref so a new handler doesn't remount (and reload) every image.
  const onImageExpired = useContext(ImageExpiredContext);
  const latest = useRef(onImageExpired);
  useEffect(() => {
    latest.current = onImageExpired;
  });
  const components = useMemo<Components>(
    () => ({
      a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
      // Lazy, so a long thread's screenshots load as they scroll into view. That
      // can be after their signed URLs expire, hence onError.
      img: ({ node: _node, ...props }) => (
        <img
          {...props}
          loading="lazy"
          onError={(e) => {
            if (hasSignedAttachments(e.currentTarget.src)) latest.current?.();
          }}
        />
      ),
    }),
    [],
  );
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
