
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nudgeable Action Engine",
  description: "A behavioral science platform designed to bridge the 'Knowing-Doing Gap'.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body>
        {/* Warm background + decorative blobs */}
        <div style={{
          position: "fixed",
          inset: 0,
          background: "#FFFDF5",
          zIndex: -10,
          pointerEvents: "none",
        }} />
        <div style={{
          position: "fixed",
          width: 500, height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, #FFE566 0%, transparent 70%)",
          filter: "blur(60px)",
          opacity: 0.35,
          top: -100, right: -100,
          zIndex: -9,
          pointerEvents: "none",
        }} />
        <div style={{
          position: "fixed",
          width: 400, height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, #FFD700 0%, transparent 70%)",
          filter: "blur(60px)",
          opacity: 0.30,
          bottom: -80, left: -80,
          zIndex: -9,
          pointerEvents: "none",
        }} />

        {children}
      </body>
    </html>
  );
}
