/** Third-party offer wall in a sandboxed frame; it cannot reach our cookies or page. */
export function OfferWallFrame({ url, title }: { url: string; title: string }) {
  return (
    <div className="wallframe">
      <iframe
        src={url}
        title={title}
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        allow="clipboard-write"
      />
    </div>
  );
}
