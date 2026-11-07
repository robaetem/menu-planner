import { cn } from "@/lib/utils"
import { marked } from "marked"
import { memo, useId, useMemo } from "react"
import ReactMarkdown, { Components } from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { CodeBlock, CodeBlockCode } from "./code-block"

export type MarkdownProps = {
  children: string
  id?: string
  className?: string
  components?: Partial<Components>
}

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown)
  return tokens.map((token) => token.raw)
}

function extractLanguage(className?: string): string {
  if (!className) return "plaintext"
  const match = className.match(/language-(\w+)/)
  return match ? match[1] : "plaintext"
}

const INITIAL_COMPONENTS: Partial<Components> = {
  code: function CodeComponent({ className, children, ...props }) {
    const isInline =
      !props.node?.position?.start.line ||
      props.node?.position?.start.line === props.node?.position?.end.line

    if (isInline) {
      return (
        <span
          className={cn(
            "bg-muted rounded-sm px-1 py-0.5 font-mono text-[0.85em]",
            className
          )}
          {...props}
        >
          {children}
        </span>
      )
    }

    const language = extractLanguage(className)

    return (
      <CodeBlock className={className}>
        <CodeBlockCode code={children as string} language={language} />
      </CodeBlock>
    )
  },
  pre: function PreComponent({ children }) {
    return <>{children}</>
  },
  p: ({ node: _n, className, ...props }) => (
    <p className={cn("leading-relaxed", className)} {...props} />
  ),
  h1: ({ node: _n, className, ...props }) => (
    <h1 className={cn("mt-1 text-base font-semibold tracking-tight", className)} {...props} />
  ),
  h2: ({ node: _n, className, ...props }) => (
    <h2 className={cn("mt-1 text-sm font-semibold tracking-tight", className)} {...props} />
  ),
  h3: ({ node: _n, className, ...props }) => (
    <h3 className={cn("mt-1 text-sm font-semibold", className)} {...props} />
  ),
  h4: ({ node: _n, className, ...props }) => (
    <h4 className={cn("text-sm font-medium", className)} {...props} />
  ),
  ul: ({ node: _n, className, ...props }) => (
    <ul className={cn("list-disc space-y-1 pl-5 marker:text-muted-foreground", className)} {...props} />
  ),
  ol: ({ node: _n, className, ...props }) => (
    <ol className={cn("list-decimal space-y-1 pl-5 marker:text-muted-foreground", className)} {...props} />
  ),
  a: ({ node: _n, className, ...props }) => (
    <a
      className={cn("underline underline-offset-2", className)}
      target="_blank"
      rel="noreferrer noopener"
      {...props}
    />
  ),
  img: ({ node: _n, className, alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} className={cn("h-auto max-w-full rounded-lg", className)} {...props} />
  ),
  blockquote: ({ node: _n, className, ...props }) => (
    <blockquote
      className={cn("border-l-2 border-border pl-3 text-muted-foreground", className)}
      {...props}
    />
  ),
  hr: ({ node: _n, className, ...props }) => (
    <hr className={cn("border-border", className)} {...props} />
  ),
  table: ({ node: _n, className, ...props }) => (
    <div className="max-w-full overflow-x-auto rounded-lg border">
      <table className={cn("w-full border-collapse text-left text-xs", className)} {...props} />
    </div>
  ),
  thead: ({ node: _n, className, ...props }) => (
    <thead className={cn("bg-muted/50 text-muted-foreground", className)} {...props} />
  ),
  tr: ({ node: _n, className, ...props }) => (
    <tr className={cn("border-b last:border-b-0", className)} {...props} />
  ),
  th: ({ node: _n, className, ...props }) => (
    <th className={cn("px-2 py-1.5 text-left font-medium whitespace-nowrap", className)} {...props} />
  ),
  td: ({ node: _n, className, ...props }) => (
    <td className={cn("px-2 py-1.5 text-left align-top", className)} {...props} />
  ),
}

const MemoizedMarkdownBlock = memo(
  function MarkdownBlock({
    content,
    components = INITIAL_COMPONENTS,
  }: {
    content: string
    components?: Partial<Components>
  }) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    )
  },
  function propsAreEqual(prevProps, nextProps) {
    return prevProps.content === nextProps.content
  }
)

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock"

function MarkdownComponent({
  children,
  id,
  className,
  components = INITIAL_COMPONENTS,
}: MarkdownProps) {
  const generatedId = useId()
  const blockId = id ?? generatedId
  const blocks = useMemo(() => parseMarkdownIntoBlocks(children), [children])

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {blocks.map((block, index) => (
        <MemoizedMarkdownBlock
          key={`${blockId}-block-${index}`}
          content={block}
          components={components}
        />
      ))}
    </div>
  )
}

const Markdown = memo(MarkdownComponent)
Markdown.displayName = "Markdown"

export { Markdown }
