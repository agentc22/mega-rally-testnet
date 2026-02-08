import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "MegaRally",
  description: "Tap-to-win on-chain rally game",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const buildId = basePath.includes("/v/") ? basePath.split("/v/").pop() : undefined;

  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>

        {buildId ? (
          <div
            style={{
              position: "fixed",
              right: 8,
              bottom: 8,
              fontSize: 12,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              opacity: 0.6,
              pointerEvents: "none",
              userSelect: "none",
              zIndex: 9999,
            }}
          >
            build {buildId}
          </div>
        ) : null}
      </body>
    </html>
  );
}
