import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Threadly | Where Creativity Connects",
  description:
    "Discover creative people, share your work, and find your community.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
