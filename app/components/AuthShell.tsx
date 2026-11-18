import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <Link href="/" className="brand auth-brand">
        <span className="brand-symbol">T</span>
        Threadly
      </Link>

      <section className="auth-card">
        <p className="eyebrow">YOUR CREATIVE SPACE</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
      </section>

      <p className="auth-footer">Where creativity connects.</p>
    </main>
  );
}
