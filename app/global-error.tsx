"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Log digest for correlation with server-side logs
  if (error.digest) console.error("[GlobalError]", error.digest, error.message);

  const message = sanitizeErrorMessage(error.message);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f7f7f5", color: "#18191b" }}>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div style={{ maxWidth: "24rem", textAlign: "center" }}>
            <h1
              style={{
                fontSize: "1.25rem",
                fontWeight: 500,
                lineHeight: 1.3,
                letterSpacing: "-0.02em",
                marginBottom: "0.5rem",
              }}
            >
              Something went wrong
            </h1>
            <p style={{ fontSize: "0.875rem", color: "#5a6066", marginBottom: "1.5rem" }}>{message}</p>
            {error.digest && (
              <p style={{ fontSize: "0.75rem", color: "#5a6066", marginBottom: "1rem" }}>Error ID: {error.digest}</p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={reset}
                style={{
                  minHeight: "2.75rem",
                  padding: "0.625rem 1rem",
                  borderRadius: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#4a4e7a",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                }}
              >
                Try again
              </button>
              <a
                href="/"
                style={{
                  minHeight: "2.75rem",
                  padding: "0.625rem 1rem",
                  borderRadius: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#fafafa",
                  color: "#18191b",
                  border: "1px solid #e6e6e2",
                  textDecoration: "none",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                }}
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

function sanitizeErrorMessage(raw?: string): string {
  if (!raw) return "An unexpected error occurred.";
  // Strip file paths and internal details
  const cleaned = raw
    .replace(/\/[\w./-]+/g, "")
    .replace(/at .+:\d+:\d+/g, "")
    .trim();
  return cleaned.slice(0, 120) || "An unexpected error occurred.";
}
