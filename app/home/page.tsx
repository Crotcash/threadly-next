
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

const categories = [
  {
    name: "Crochet patterns",
    description: "Find patterns for your next project.",
    icon: "✳",
    href: "/creations?category=patterns",
  },
  {
    name: "Finished products",
    description: "Discover handmade pieces.",
    icon: "◇",
    href: "/creations?category=products",
  },
  {
    name: "Yarn & materials",
    description: "Explore supplies for your craft.",
    icon: "◉",
    href: "/creations?category=materials",
  },
  {
    name: "Tools & kits",
    description: "Get ready for your next creation.",
    icon: "✦",
    href: "/creations?category=kits",
  },
];

const navigation = [
  { label: "Home", href: "/home", icon: "⌂" },
  { label: "Discover", href: "/creations", icon: "⌕" },
  { label: "Community", href: "/community", icon: "◎" },
  {label: "Messages", href: "/messages", icon: "✉"},
  { label: "My Profile", href: "/profile", icon: "○" },
  {label: "Shop", href: "/shop", icon: "🛒"}
];

export default function CustomerHomePage() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [customerName, setCustomerName] = useState("there");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, "users", user.uid));

        if (!snapshot.exists()) {
          await signOut(auth);
          router.replace("/login");
          return;
        }

        const profile = snapshot.data();
        const role = String(profile.role ?? "")
          .trim()
          .toLowerCase();

        if (role === "creator" || role === "creative") {
          router.replace("/dashboard");
          return;
        }

        if (role !== "customer") {
          await signOut(auth);
          router.replace("/login");
          return;
        }

        setCustomerName(
          profile.displayName ||
            profile.name ||
            user.displayName ||
            user.email?.split("@")[0] ||
            "there"
        );

        setError("");
        setCheckingRole(false);
      } catch (err) {
        console.error("Customer dashboard access error:", err);
        setError("We couldn't verify your account. Please try again.");
        setCheckingRole(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  async function handleLogout() {
    await signOut(auth);
    router.replace("/login");
  }

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = search.trim();

    if (!query) {
      setError("Please enter something to search for.");
      return;
    }

    setError("");
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  if (checkingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070B16] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-blue-400/20 border-t-blue-400" />
          <p className="text-slate-300">
            Preparing your Threadly home...
          </p>
        </div>
      </main>
    );
  }

  if (error && !checkingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070B16] px-5 text-white">
        <div className="text-center">
          <p className="mb-4 text-red-300">{error}</p>
          <button
            onClick={() => router.replace("/login")}
            className="rounded-xl bg-blue-500 px-5 py-3 font-semibold hover:bg-blue-400"
          >
            Return to login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070B16] text-white md:flex">
      {/* Customer sidebar */}
      <aside className="border-b border-white/10 bg-[#0B1120] p-5 md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <Link
          href="/home"
          className="text-2xl font-bold tracking-wide text-blue-400"
        >
          Threadly<span className="text-white">.</span>
        </Link>

        <p className="mb-8 mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">
          Your creative world
        </p>

        <nav className="space-y-2">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                item.href === "/home"
                  ? "bg-blue-500/15 font-semibold text-blue-300"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          className="mt-8 w-full rounded-xl border border-white/10 px-4 py-3 text-left text-sm text-slate-400 transition hover:border-red-400/40 hover:text-red-300"
        >
          ↪ Sign out
        </button>
      </aside>

      {/* Main dashboard */}
      <section className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-400">
              Your Threadly space
            </p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              Discover something beautiful.
            </h1>
          </div>

          <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-4 py-2 text-sm text-blue-300">
            Customer account
          </span>
        </header>

        {/* Welcome and search */}
        <section className="relative overflow-hidden rounded-2xl border border-blue-400/20 bg-gradient-to-br from-[#14284B] via-[#101A31] to-[#0D1425] p-6 sm:p-9">
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />

          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
            MADE BY CREATORS
          </p>

          <h2 className="mt-4 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
            Welcome to your creative world, {customerName}.
          </h2>

          <p className="mt-4 max-w-xl leading-7 text-slate-300">
            Discover handmade treasures, find your next crochet pattern,
            and connect with the talented people behind every creation.
          </p>

          <form
            onSubmit={handleSearch}
            className="mt-7 flex max-w-3xl flex-col gap-3 sm:flex-row"
          >
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                if (error) setError("");
              }}
              placeholder="Search patterns, products, creators..."
              aria-label="Search Threadly"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#080E1C]/80 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-400"
            />

            <button
              type="submit"
              className="rounded-xl bg-blue-500 px-6 py-3 font-semibold transition hover:bg-blue-400"
            >
              Search
            </button>
          </form>

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {error}
            </p>
          )}
        </section>

        {/* Explore categories */}
        <section className="mt-9">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">
                Explore categories
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Find something that inspires you.
              </p>
            </div>

            <Link
              href="/creations"
              className="text-sm font-medium text-blue-300 hover:text-blue-200"
            >
              Browse all 
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {categories.map((category) => (
              <Link
                key={category.name}
                href={category.href}
                className="group rounded-2xl border border-white/10 bg-[#0D1425] p-5 transition hover:-translate-y-1 hover:border-blue-400/40 hover:bg-[#111D33]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-2xl text-blue-300 transition group-hover:bg-blue-500/20">
                  {category.icon}
                </span>

                <h3 className="mt-5 font-semibold">
                  {category.name}
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {category.description}
                </p>

                <p className="mt-4 text-sm font-medium text-blue-300">
                  Explore category 
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* Community and saved items */}
        <section className="mt-9 grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-white/10 bg-[#0D1425] p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-xl text-blue-300">
              ◎
            </div>

            <h2 className="mt-4 text-lg font-semibold">
              Meet the community
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Explore ideas, admire other people&apos;s work, and join the
              conversation with Threadly&apos;s creative community.
            </p>

            <Link
              href="/community"
              className="mt-5 inline-flex rounded-xl border border-blue-400/30 px-4 py-2.5 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/10"
            >
              Visit community 
            </Link>
          </article>

          <article className="rounded-2xl border border-white/10 bg-[#0D1425] p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-xl text-blue-300">
              ♡
            </div>

            <h2 className="mt-4 text-lg font-semibold">
              Keep your favourites close
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Build a collection of the patterns and handmade pieces
              you want to revisit.
            </p>

            <Link
              href="/saved"
              className="mt-5 inline-flex rounded-xl border border-blue-400/30 px-4 py-2.5 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/10"
            >
              View saved items 
            </Link>
          </article>
        </section>

        <footer className="mt-10 border-t border-white/10 py-6 text-center text-sm text-slate-500">
          Threadly - discover creativity, support creators.
        </footer>
      </section>
    </main>
  );
}
