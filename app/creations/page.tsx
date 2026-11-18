
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
} from "firebase/firestore";

import { auth, db } from "../lib/firebase";

type Creation = {
  id: string;
  creatorId: string;
  creatorName?: string;
  caption?: string;
  imageUrl?: string;
  category?: string;
  createdAt?: Timestamp | null;
};

const navigation = [
  { label: "Home", href: "/home", icon: "⌂" },
  { label: "Discover", href: "/creations", icon: "⌕" },
  { label: "Community", href: "/community", icon: "◎" },
  { label: "Messages", href: "/messages", icon: "✉" },
  { label: "My Profile", href: "/profile", icon: "○" },
  { label: "Shop", href: "/shop", icon: "🛒" },
];

const categories = [
  "All",
  "Finished work",
  "Work in progress",
  "Tutorial",
  "Inspiration",
  "Product announcement",
  "Crochet patterns",
  "Finished products",
  "Yarn & materials",
  "Tools & accessories",
  "Kits & bundles",
];

const categoryFromUrl: Record<string, string> = {
  patterns: "Crochet patterns",
  products: "Finished products",
  materials: "Yarn & materials",
  kits: "Tools & accessories",
};

export default function CreationsPage() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [creations, setCreations] = useState<Creation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Check URL category after the page has mounted.
  // This avoids using useSearchParams during prerendering.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedCategory = params.get("category");

    if (!requestedCategory) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedCategory("All");
      return;
    }

    setSelectedCategory(
      categoryFromUrl[requestedCategory] || "All"
    );
  }, []);

  // Verify authentication and customer role.
  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (active) {
          router.replace("/login");
        }
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, "users", user.uid));

        if (!active) return;

        if (!snapshot.exists()) {
          await signOut(auth);

          if (active) {
            router.replace("/login");
          }
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

          if (active) {
            router.replace("/login");
          }
          return;
        }

        setCurrentUserId(user.uid);
        setError("");
        setCheckingRole(false);
      } catch (err) {
        console.error("Discover authentication error:", err);

        if (active) {
          setError("We couldn't verify your account. Please try again.");
          setCheckingRole(false);
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  // Load creations from Firestore.
  useEffect(() => {
    if (!currentUserId) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    const postsQuery = query(
      collection(db, "posts"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      postsQuery,
      (snapshot) => {
        const posts = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as Creation[];

        setCreations(posts);
        setError("");
        setLoading(false);
      },
      (err) => {
        console.error("Discover posts error:", err);

        setError(
          "We couldn't load creations. Please check your connection and Firestore permissions."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUserId]);

  // Sign out.
  async function handleLogout() {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (err) {
      console.error("Sign out error:", err);
      setError("Unable to sign out. Please try again.");
    }
  }

  // Filter creations by category.
  const filteredCreations =
    selectedCategory === "All"
      ? creations
      : creations.filter(
          (post) =>
            post.category?.toLowerCase() ===
            selectedCategory.toLowerCase()
        );

  // Authentication loading screen.
  if (checkingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070B16] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-blue-400/20 border-t-blue-400" />

          <p className="text-slate-300">
            Preparing your Threadly Discover page...
          </p>
        </div>
      </main>
    );
  }

  // Authentication error screen.
  if (error && !currentUserId && !loading) {
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

      {/* CUSTOMER SIDEBAR */}
      <aside className="border-b border-white/10 bg-[#0B1120] p-5 md:min-h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r">

        {/* LOGO */}
        <Link
          href="/home"
          className="text-2xl font-bold tracking-wide text-blue-400"
        >
          Threadly<span className="text-white">.</span>
        </Link>

        {/* TAGLINE */}
        <p className="mb-8 mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">
          Your creative world
        </p>

        {/* NAVIGATION */}
        <nav className="space-y-2">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                item.href === "/creations"
                  ? "bg-blue-500/15 font-semibold text-blue-300"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* SIGN OUT */}
        <button
          onClick={handleLogout}
          className="mt-8 w-full rounded-xl border border-white/10 px-4 py-3 text-left text-sm text-slate-400 transition hover:border-red-400/40 hover:text-red-300"
        >
          ↪ Sign out
        </button>
      </aside>

      {/* DISCOVER PAGE */}
      <section className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10">

        {/* PAGE HEADER */}
        <header className="mb-8">
          <p className="text-sm text-slate-400">
            Your Threadly space
          </p>

          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">
            Discover something beautiful.
          </h1>

          <p className="mt-3 max-w-2xl leading-7 text-slate-400">
            Explore handmade creations, discover new ideas and connect
            with the talented creators in our community.
          </p>
        </header>

        {/* DISCOVER BANNER */}
        <section className="relative overflow-hidden rounded-2xl border border-blue-400/20 bg-gradient-to-br from-[#14284B] via-[#101A31] to-[#0D1425] p-6 sm:p-9">

          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />

          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
            MADE BY CREATORS
          </p>

          <h2 className="mt-4 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
            Discover creativity. Find inspiration.
          </h2>

          <p className="mt-4 max-w-xl leading-7 text-slate-300">
            Browse handmade treasures, find beautiful patterns and
            connect with the people behind every creation.
          </p>

          <Link
            href="/shop"
            className="mt-6 inline-flex rounded-xl bg-blue-500 px-6 py-3 font-semibold transition hover:bg-blue-400"
          >
            Explore the shop 
          </Link>
        </section>

        {/* CREATION CATEGORIES */}
        <section className="mt-9">

          <div className="mb-5">
            <h2 className="text-xl font-semibold">
              Explore creations
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Find something that inspires you.
            </p>
          </div>

          {/* CATEGORY FILTERS */}
          <div className="mb-7 flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSelectedCategory(item)}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  selectedCategory === item
                    ? "border-blue-400 bg-blue-500/20 text-blue-300"
                    : "border-white/10 bg-[#0D1425] text-slate-400 hover:border-blue-400/40 hover:text-white"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          {/* ERROR MESSAGE */}
          {error && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-red-500/20 bg-red-950/30 p-4 text-sm text-red-300"
            >
              {error}
            </div>
          )}

          {/* LOADING STATE */}
          {loading && (
            <div className="py-16 text-center">
              <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-2 border-blue-400/20 border-t-blue-400" />

              <p className="text-slate-400">
                Loading creations...
              </p>
            </div>
          )}

          {/* EMPTY STATE */}
          {!loading && !error && filteredCreations.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#0D1425] p-10 text-center">

              <span className="text-5xl">🧶</span>

              <h3 className="mt-5 text-xl font-semibold">
                No creations found
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
                There are no creations in this category yet. Try another
                category or check back later.
              </p>

              {selectedCategory !== "All" && (
                <button
                  onClick={() => setSelectedCategory("All")}
                  className="mt-5 rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold hover:bg-blue-400"
                >
                  View all creations
                </button>
              )}
            </div>
          )}

          {/* CREATIONS GRID */}
          {!loading && !error && filteredCreations.length > 0 && (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">

              {filteredCreations.map((post) => (
                <article
                  key={post.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-[#0D1425] transition hover:-translate-y-1 hover:border-blue-400/40"
                >

                  {/* CREATION IMAGE */}
                  {post.imageUrl ? (
                    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-[#080E1C]">
                      <img
                        src={post.imageUrl}
                        alt={post.caption || "Creator's work"}
                        className="h-full w-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center bg-[#101A31] text-5xl">
                      🧶
                    </div>
                  )}

                  {/* POST DETAILS */}
                  <div className="p-5">

                    <span className="inline-flex rounded-full bg-blue-500/10 px-3 py-1 text-xs text-blue-300">
                      {post.category || "Creative post"}
                    </span>

                    <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">
                      {post.caption || "A new creation shared with Threadly."}
                    </p>

                    {/* CREATOR DETAILS */}
                    <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4">

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/15 font-semibold text-blue-300">
                        {(post.creatorName || "C")
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                          {post.creatorName || "Threadly Creator"}
                        </p>

                        <p className="text-xs text-slate-500">
                          {post.createdAt?.toDate
                            ? post.createdAt.toDate().toLocaleDateString()
                            : "Recently shared"}
                        </p>
                      </div>
                    </div>

                    {/* MESSAGE CREATOR */}
                    {post.creatorId &&
                      post.creatorId !== currentUserId && (
                        <Link
                          href={`/messages?to=${encodeURIComponent(
                            post.creatorId
                          )}&name=${encodeURIComponent(
                            post.creatorName || "Creator"
                          )}`}
                          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold transition hover:bg-blue-400"
                        >
                          ✉ Message Creator
                        </Link>
                      )}

                    {/* OWN CREATION */}
                    {post.creatorId === currentUserId && (
                      <p className="mt-5 rounded-xl border border-white/10 px-4 py-3 text-center text-sm text-slate-400">
                        Your creation
                      </p>
                    )}

                  </div>
                </article>
              ))}

            </div>
          )}
        </section>

        {/* FOOTER */}
        <footer className="mt-10 border-t border-white/10 py-6 text-center text-sm text-slate-500">
          Threadly - discover creativity, support creators.
        </footer>

      </section>
    </main>
  );
}
