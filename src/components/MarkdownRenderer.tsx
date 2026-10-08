import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

// GitHub-flavoured rendering: GFM (tables, task lists, strikethrough,
// autolinks), hard line breaks like PR bodies/comments, and the inline HTML
// GitHub permits (<details>, <img>, <br>…). rehype-sanitize runs after
// rehype-raw and uses GitHub's own allowlist, so scripts/handlers are stripped.
const REMARK_PLUGINS = [remarkGfm, remarkBreaks];
const REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize];

const COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

export default function MarkdownRenderer({ children }: { children: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
