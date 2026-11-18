import Link from "next/link";

export default function WelcomePage() {
  return (
    <main className="welcome-page">
      <nav className="navbar">
        <Link href="/" className="brand">
          <span className="brand-symbol">T</span>
          Threadly
        </Link>

        <div className="nav-actions">
          <Link href="/login" className="nav-login">
            Sign in
          </Link>
          <Link href="/register" className="button button-small">
            Join Threadly
          </Link>
        </div>
      </nav>

      <section className="hero fade-in">
        <div className="hero-badge">
          <span className="status-dot" />A new space for creative minds
        </div>

        <h1>
          Your creativity.
          <br />
          <span className="gradient-text">Your community.</span>
          <br />
          Your Threadly.
        </h1>

        <p className="hero-description">
          Discover inspiring people, share what you create, and connect with a
          community that values your ideas.
        </p>

        <div className="hero-actions">
          <Link href="/register" className="button">
            Get started <span></span>
          </Link>
          <Link href="/login" className="button button-outline">
            I already have an account
          </Link>
        </div>

        <div className="hero-showcase">
          <div className="showcase-orb">✦</div>
          <p className="eyebrow">CREATE · CONNECT · GROW</p>
          <h2>Make room for ideas.</h2>
          <p className="muted">
            Your next collaboration could start with a simple connection.
          </p>
          <div className="showcase-tags">
            <span>Creative community</span>
            <span>Discover talent</span>
            <span>Share your work</span>
          </div>
        </div>
      </section>
    </main>
  );
}
