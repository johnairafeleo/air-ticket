import { format, formatDistanceToNow } from "date-fns";

/**
 * "34 minutes ago", rendered without tripping hydration.
 *
 * A relative timestamp is computed from `Date.now()`, so the server renders it
 * at one instant and the client hydrates at another. Cross a minute boundary in
 * between — which happens constantly on a page that is open for a while and
 * then reloaded — and React sees "35 minutes ago" against "34 minutes ago" and
 * throws away the tree.
 *
 * `suppressHydrationWarning` is React's sanctioned answer for exactly this: it
 * tells React that this element's text is expected to differ, so the server's
 * value is kept and nothing is regenerated. It only reaches one level deep,
 * which is why the text is a direct child rather than wrapped.
 *
 * The `title` carries the absolute time, so hovering gives the precise value
 * that "in about 2 months" cannot.
 *
 * Not a Client Component: it has no hooks or handlers, so it renders in either
 * tree. Server Components never hydrate and so never had this problem — this
 * exists for the Client Components that do.
 */
export function RelativeTime({
  value,
  className,
}: {
  /** An ISO timestamp, straight from Postgres. */
  value: string;
  className?: string;
}) {
  const date = new Date(value);

  return (
    <time
      dateTime={value}
      title={format(date, "d MMM yyyy, HH:mm")}
      className={className}
      suppressHydrationWarning
    >
      {formatDistanceToNow(date, { addSuffix: true })}
    </time>
  );
}
