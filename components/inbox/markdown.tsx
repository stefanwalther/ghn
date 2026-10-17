"use client";

import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkEmoji from "remark-emoji";
import remarkGfm from "remark-gfm";
import { unwrapDetails } from "@/lib/markdown";

const bodyText = { fontSize: "0.875rem", lineHeight: "1.6" } as const;

export function Markdown({ text }: { text: string }) {
  return (
    <div style={bodyText}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkEmoji]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, defaultSchema]]}
        components={{
          h1: ({ children }) => (
            <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0.75em 0 0.25em" }}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0.75em 0 0.25em" }}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: "0.75em 0 0.25em" }}>{children}</h3>
          ),
          p: ({ children }) => <p style={{ margin: "0.5em 0" }}>{children}</p>,
          ul: ({ children }) => (
            <ul style={{ listStyle: "disc", paddingLeft: "1.5rem", margin: "0.5em 0" }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ listStyle: "decimal", paddingLeft: "1.5rem", margin: "0.5em 0" }}>{children}</ol>
          ),
          li: ({ children }) => <li style={{ margin: "0.2em 0" }}>{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "underline" }}
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code
              style={{
                fontFamily: "monospace",
                fontSize: "0.85em",
                background: "var(--muted)",
                padding: "0.1em 0.3em",
                borderRadius: "0.25rem",
                wordBreak: "break-word",
              }}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre
              style={{
                overflowX: "auto",
                background: "var(--muted)",
                padding: "0.75rem",
                borderRadius: "0.5rem",
                fontSize: "0.8rem",
              }}
            >
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote
              style={{
                borderLeft: "3px solid var(--border)",
                paddingLeft: "0.75rem",
                margin: "0.5em 0",
                opacity: 0.85,
              }}
            >
              {children}
            </blockquote>
          ),
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={alt ?? ""}
              style={{ display: "inline-block", verticalAlign: "middle", maxWidth: "100%", borderRadius: "0.25rem" }}
            />
          ),
          input: (props) => <input {...props} style={{ marginRight: "0.4em" }} />,
        }}
      >
        {unwrapDetails(text)}
      </ReactMarkdown>
    </div>
  );
}
