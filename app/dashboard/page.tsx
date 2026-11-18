
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { auth, db } from "../lib/firebase";

// ==========================================
// MONEY FORMAT
// ==========================================

function formatMaloti(amount: number) {
  return `M ${amount.toLocaleString("en-LS", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();

  // ==========================================
  // ACCOUNT STATES
  // ==========================================

  const [checkingRole, setCheckingRole] = useState(true);
  const [creatorName, setCreatorName] = useState("Creator");
  const [userRole, setUserRole] = useState("");
  const [error, setError] = useState("");

  // ==========================================
  // STATISTICS STATES
  // ==========================================

  const [postCount, setPostCount] = useState<number | null>(null);
  const [patternCount, setPatternCount] = useState<number | null>(null);
  const [engagementCount, setEngagementCount] = useState<number | null>(
    null
  );

  // Earnings states
  const [totalEarnings, setTotalEarnings] = useState<number | null>(null);
  const [earningsOrderCount, setEarningsOrderCount] = useState(0);

  const [statsErrors, setStatsErrors] = useState<string[]>([]);

  // ==========================================
  // AUTHENTICATION AND FIRESTORE LISTENERS
  // ==========================================

  useEffect(() => {
    let cancelled = false;

    let statsUnsubscribers: (() => void)[] = [];

    // Each post has two listeners:
    // one for reactions and one for comments.
    const engagementListeners = new Map<
      string,
      (() => void)[]
    >();

    // Stores the latest reaction/comment count for each post.
    const engagementCounts = new Map<string, number>();

    // Tracks listeners that have returned an error.
    const engagementErrors = new Set<string>();

    function updateEngagementTotal() {
      if (cancelled) return;

      // Do not show an incomplete total if a listener failed.
      if (engagementErrors.size > 0) {
        setEngagementCount(null);
        return;
      }

      let total = 0;

      engagementCounts.forEach((count) => {
        total += count;
      });

      setEngagementCount(total);
    }

    function addStatsError(type: string) {
      if (cancelled) return;

      setStatsErrors((previous) =>
        previous.includes(type)
          ? previous
          : [...previous, type]
      );
    }

    function removeStatsError(type: string) {
      if (cancelled) return;

      setStatsErrors((previous) =>
        previous.filter((item) => item !== type)
      );
    }

    function clearEngagementListeners() {
      engagementListeners.forEach((unsubscribers) => {
        unsubscribers.forEach((unsubscribe) => unsubscribe());
      });

      engagementListeners.clear();
      engagementCounts.clear();
      engagementErrors.clear();
    }

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      async (user) => {
        // Clean up listeners from a previous account.
        statsUnsubscribers.forEach((unsubscribe) => unsubscribe());
        statsUnsubscribers = [];

        clearEngagementListeners();

        setCheckingRole(true);
        setError("");

        setPostCount(null);
        setPatternCount(null);
        setEngagementCount(null);
        setTotalEarnings(null);
        setEarningsOrderCount(0);
        setStatsErrors([]);

        if (!user) {
          router.replace("/login");
          return;
        }

        try {
          // =====================================
          // VERIFY USER PROFILE
          // =====================================

          const userRef = doc(db, "users", user.uid);
          const userSnapshot = await getDoc(userRef);

          if (cancelled) return;

          if (!userSnapshot.exists()) {
            await signOut(auth);
            router.replace("/login");
            return;
          }

          const profile = userSnapshot.data();

          const role = String(profile.role ?? "")
            .trim()
            .toLowerCase();

          // Customers must use their own dashboard.
          if (role === "customer") {
            router.replace("/home");
            return;
          }

          if (role !== "creator" && role !== "creative") {
            await signOut(auth);
            router.replace("/login");
            return;
          }

          setUserRole(role);

          setCreatorName(
            profile.displayName ||
              profile.name ||
              user.displayName ||
              user.email?.split("@")[0] ||
              "Creator"
          );

          // =====================================
          // 1. COMMUNITY POSTS
          // Collection: posts
          // Ownership field: creatorId
          // =====================================

          const postsQuery = query(
            collection(db, "posts"),
            where("creatorId", "==", user.uid)
          );

          const unsubscribePosts = onSnapshot(
            postsQuery,
            (snapshot) => {
              if (cancelled) return;

              setPostCount(snapshot.size);
              removeStatsError("posts");

              // Identify the creator's current post IDs.
              const currentPostIds = new Set(
                snapshot.docs.map((post) => post.id)
              );

              // Remove listeners for posts that no longer exist
              // or no longer belong to this creator.
              engagementListeners.forEach(
                (unsubscribers, postId) => {
                  if (!currentPostIds.has(postId)) {
                    unsubscribers.forEach((unsubscribe) =>
                      unsubscribe()
                    );

                    engagementListeners.delete(postId);

                    engagementCounts.delete(
                      `${postId}:reactions`
                    );

                    engagementCounts.delete(
                      `${postId}:comments`
                    );

                    engagementErrors.delete(
                      `${postId}:reactions`
                    );

                    engagementErrors.delete(
                      `${postId}:comments`
                    );
                  }
                }
              );

              // Add listeners for newly discovered posts.
              snapshot.docs.forEach((post) => {
                const postId = post.id;

                // Avoid creating duplicate listeners.
                if (engagementListeners.has(postId)) {
                  return;
                }

                const reactionsKey = `${postId}:reactions`;
                const commentsKey = `${postId}:comments`;

                const postUnsubscribers: (() => void)[] = [];

                // =================================
                // REACTIONS LISTENER
                // =================================

                const unsubscribeReactions = onSnapshot(
                  collection(
                    db,
                    "posts",
                    postId,
                    "reactions"
                  ),
                  (reactionSnapshot) => {
                    if (cancelled) return;

                    engagementCounts.set(
                      reactionsKey,
                      reactionSnapshot.size
                    );

                    engagementErrors.delete(reactionsKey);

                    if (
                      !engagementErrors.has(reactionsKey) &&
                      !engagementErrors.has(commentsKey)
                    ) {
                      removeStatsError("engagements");
                    }

                    updateEngagementTotal();
                  },
                  (err) => {
                    console.error(
                      `Reactions error for post ${postId}:`,
                      err
                    );

                    if (cancelled) return;

                    engagementErrors.add(reactionsKey);

                    addStatsError("engagements");
                    updateEngagementTotal();
                  }
                );

                postUnsubscribers.push(unsubscribeReactions);

                // =================================
                // COMMENTS LISTENER
                // =================================

                const unsubscribeComments = onSnapshot(
                  collection(
                    db,
                    "posts",
                    postId,
                    "comments"
                  ),
                  (commentSnapshot) => {
                    if (cancelled) return;

                    engagementCounts.set(
                      commentsKey,
                      commentSnapshot.size
                    );

                    engagementErrors.delete(commentsKey);

                    if (
                      !engagementErrors.has(reactionsKey) &&
                      !engagementErrors.has(commentsKey)
                    ) {
                      removeStatsError("engagements");
                    }

                    updateEngagementTotal();
                  },
                  (err) => {
                    console.error(
                      `Comments error for post ${postId}:`,
                      err
                    );

                    if (cancelled) return;

                    engagementErrors.add(commentsKey);

                    addStatsError("engagements");
                    updateEngagementTotal();
                  }
                );

                postUnsubscribers.push(unsubscribeComments);

                engagementListeners.set(
                  postId,
                  postUnsubscribers
                );
              });

              // Recalculate after adding/removing posts.
              updateEngagementTotal();

              // No posts means no engagements.
              if (snapshot.empty) {
                setEngagementCount(0);
                removeStatsError("engagements");
              }
            },
            (err) => {
              console.error(
                "Community posts statistics error:",
                err
              );

              if (cancelled) return;

              setPostCount(null);
              setEngagementCount(null);

              addStatsError("posts");

              // Without the post list, engagement totals
              // cannot be calculated reliably.
              clearEngagementListeners();
            }
          );

          statsUnsubscribers.push(unsubscribePosts);

          // =====================================
          // 2. GENERATED AI PATTERNS
          // Collection: patterns
          // Ownership field: uid
          // =====================================

          const patternsQuery = query(
            collection(db, "patterns"),
            where("uid", "==", user.uid)
          );

          const unsubscribePatterns = onSnapshot(
            patternsQuery,
            (snapshot) => {
              if (cancelled) return;

              setPatternCount(snapshot.size);
              removeStatsError("patterns");
            },
            (err) => {
              console.error(
                "Pattern statistics error:",
                err
              );

              if (cancelled) return;

              setPatternCount(null);
              addStatsError("patterns");
            }
          );

          statsUnsubscribers.push(unsubscribePatterns);

          // =====================================
          // 3. TOTAL CREATOR EARNINGS
          // Collection: orders
          // Ownership field: creatorId
          //
          // Only paid AND completed orders count.
          // subtotal excludes delivery fees.
          // =====================================

          const earningsQuery = query(
            collection(db, "orders"),
            where("creatorId", "==", user.uid)
          );

          const unsubscribeEarnings = onSnapshot(
            earningsQuery,
            (snapshot) => {
              if (cancelled) return;

              let earnings = 0;
              let completedCount = 0;

              snapshot.docs.forEach((orderDoc) => {
                const order = orderDoc.data();

                const isPaidAndCompleted =
                  order.paymentStatus === "paid" &&
                  order.status === "completed";

                if (isPaidAndCompleted) {
                  const subtotal = Number(order.subtotal);

                  if (Number.isFinite(subtotal) && subtotal > 0) {
                    earnings += subtotal;
                  }

                  completedCount++;
                }
              });

              setTotalEarnings(earnings);
              setEarningsOrderCount(completedCount);

              removeStatsError("earnings");
            },
            (err) => {
              console.error(
                "Earnings statistics error:",
                err
              );

              if (cancelled) return;

              setTotalEarnings(null);
              setEarningsOrderCount(0);

              addStatsError("earnings");
            }
          );

          statsUnsubscribers.push(unsubscribeEarnings);
        } catch (err) {
          console.error("Dashboard access error:", err);

          if (!cancelled) {
            setError(
              "We couldn't verify your account. Please try again."
            );
          }
        } finally {
          if (!cancelled) {
            setCheckingRole(false);
          }
        }
      }
    );

    return () => {
      cancelled = true;

      unsubscribeAuth();

      statsUnsubscribers.forEach((unsubscribe) =>
        unsubscribe()
      );

      clearEngagementListeners();
    };
  }, [router]);

  // ==========================================
  // SIGN OUT
  // ==========================================

  async function handleLogout() {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (err) {
      console.error("Logout error:", err);
      setError("Unable to sign out. Please try again.");
    }
  }

  // ==========================================
  // LOADING SCREEN
  // ==========================================

  if (checkingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070B16] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-blue-400/20 border-t-blue-400" />

          <p className="text-slate-300">
            Checking your Threadly account...
          </p>
        </div>
      </main>
    );
  }

  // ==========================================
  // ERROR SCREEN
  // ==========================================

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070B16] px-5 text-white">
        <div className="max-w-md text-center">
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

  const isCreative =
    userRole === "creative" || userRole === "creator";

  // ==========================================
  // MY CREATIONS
  // Community posts + generated AI patterns
  // ==========================================

  const totalCreations =
    postCount !== null && patternCount !== null
      ? postCount + patternCount
      : null;

  // ==========================================
  // SIDEBAR NAVIGATION
  // ==========================================

  const navigation = [
    {
      label: "Overview",
      href: "/dashboard",
      icon: "⌂",
    },
    {
      label: "Community",
      href: "/community",
      icon: "◎",
    },
    ...(isCreative
      ? [
          {
            label: "Pattern Generator",
            href: "/pattern-generator",
            icon: "◊",
          },
          {
            label: "Grid Pattern Maker",
            href: "/grid-pattern-maker",
            icon: "▦",
          },
          {
            label: "Pricing Calculator",
            href: "/pricing-calculator",
            icon: "₥",
          },
          {
            label: "Products",
            href: "/products",
            icon: "☰",
          },
          {
            label: "Orders",
            href: "/orders",
            icon: "↔",
          },
        ]
      : []),
    {
      label: "Creations",
      href: "/creations",
      icon: "◇",
    },
    {
      label: "Messages",
      href: "/messages",
      icon: "✉",
    },
    {
      label: "My Profile",
      href: "/profile",
      icon: "○",
    },
  ];

  // ==========================================
  // DASHBOARD STATISTICS
  // ==========================================

  const stats = [
    {
      label: "Total earnings",
      value:
        totalEarnings === null
          ? "—"
          : formatMaloti(totalEarnings),
      description:
        totalEarnings === null
          ? "Unable to load earnings"
          : `From ${earningsOrderCount} paid, completed orders`,
      icon: "M",
    },
    {
      label: "Community posts",
      value:
        postCount === null ? "—" : String(postCount),
      description: "Posts you've shared",
      icon: "✦",
    },
    {
      label: "My creations",
      value:
        totalCreations === null
          ? "—"
          : String(totalCreations),
      description:
        "Community posts and generated patterns",
      icon: "◇",
    },
    {
      label: "Engagements",
      value:
        engagementCount === null
          ? "—"
          : engagementCount.toLocaleString(),
      description:
        "Total reactions and comments on your posts",
      icon: "♡",
    },
  ];

  // ==========================================
  // DASHBOARD UI
  // ==========================================

  return (
    <main className="min-h-screen bg-[#070B16] text-white md:flex">

      {/* SIDEBAR */}

      <aside className="border-b border-white/10 bg-[#0B1120] p-5 md:min-h-screen md:w-64 md:border-b-0 md:border-r">

        <Link
          href="/dashboard"
          className="text-2xl font-bold tracking-wide text-blue-400"
        >
          Threadly<span className="text-white">.</span>
        </Link>

        <p className="mb-8 mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">
          Creator studio
        </p>

        <nav className="space-y-2">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" &&
                pathname.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                  isActive
                    ? "bg-blue-500/15 font-semibold text-blue-300"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="text-lg">{item.icon}</span>

                {item.label}

                {item.href === "/pattern-generator" && (
                  <span className="ml-auto rounded-full bg-blue-500/20 px-2 py-1 text-[10px] font-semibold text-blue-300">
                    AI
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          className="mt-8 w-full rounded-xl border border-white/10 px-4 py-3 text-left text-sm text-slate-400 transition hover:border-red-400/40 hover:text-red-300"
        >
          ↪ Sign out
        </button>
      </aside>

      {/* MAIN DASHBOARD */}

      <section className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10">

        {/* HEADER */}

        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-400">
              Your creative workspace
            </p>

            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              Creator dashboard
            </h1>
          </div>

          <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-4 py-2 text-sm text-blue-300">
            Creator account
          </span>
        </header>

        {/* WELCOME SECTION */}

        <section className="relative overflow-hidden rounded-2xl border border-blue-400/20 bg-gradient-to-br from-[#14284B] via-[#101A31] to-[#0D1425] p-6 sm:p-8">

          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />

          <p className="text-sm font-medium text-blue-300">
            WELCOME BACK
          </p>

          <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
            Hello, {creatorName}!
          </h2>

          <p className="mt-3 max-w-xl leading-7 text-slate-300">
            This is your space to share your work, grow your
            creative community, showcase your products, and
            manage your business.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/community"
              className="rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold transition hover:bg-blue-400"
            >
              Explore community
            </Link>

            <Link
              href="/creations"
              className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold transition hover:bg-white/5"
            >
              Manage creations
            </Link>
          </div>
        </section>

        {/* OVERVIEW STATISTICS */}

        <section className="mt-8">

          <div className="mb-4">
            <h2 className="text-lg font-semibold">
              Your overview
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              A quick look at your creative activity.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <article
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-[#0D1425] p-5 transition hover:border-blue-400/30"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">
                    {stat.label}
                  </span>

                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 font-semibold text-blue-300">
                    {stat.icon}
                  </span>
                </div>

                <p className="mt-5 text-2xl font-bold">
                  {stat.value}
                </p>

                <p className="mt-2 text-xs text-slate-500">
                  {stat.description}
                </p>
              </article>
            ))}
          </div>

          {/* STATISTICS ERRORS */}

          {statsErrors.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-300">
              <p className="font-semibold">
                Some dashboard statistics could not load.
              </p>

              <ul className="mt-2 list-inside list-disc text-amber-200/80">
                {statsErrors.map((item) => (
                  <li key={item}>
                    {item === "posts"
                      ? "Community posts: check the posts collection and its read permissions."
                      : item === "patterns"
                        ? "AI patterns: check the patterns collection, ownership field and read permissions."
                        : item === "earnings"
                          ? "Total earnings: check the orders collection and creator ownership permissions."
                          : "Engagements: check the reactions and comments subcollections and their read permissions."}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* QUICK ACTIONS */}

          <section className="mt-8 rounded-2xl border border-white/10 bg-[#0D1425] p-6">

            <h2 className="text-lg font-semibold">
              Quick actions
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Choose what you want to work on today.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

              <Link
                href="/community"
                className="rounded-xl border border-white/10 p-4 transition hover:border-blue-400/40 hover:bg-blue-400/5"
              >
                <span className="text-xl text-blue-300">✦</span>

                <h3 className="mt-3 font-semibold">
                  Create a post
                </h3>

                <p className="mt-1 text-sm text-slate-400">
                  Share your latest work.
                </p>
              </Link>

              <Link
                href="/creations"
                className="rounded-xl border border-white/10 p-4 transition hover:border-blue-400/40 hover:bg-blue-400/5"
              >
                <span className="text-xl text-blue-300">◇</span>

                <h3 className="mt-3 font-semibold">
                  Add a creation
                </h3>

                <p className="mt-1 text-sm text-slate-400">
                  Showcase a product or pattern.
                </p>
              </Link>

              {isCreative && (
                <Link
                  href="/pattern-generator"
                  className="group rounded-xl border border-blue-400/20 bg-blue-500/5 p-4 transition hover:border-blue-400/50 hover:bg-blue-500/10"
                >
                  <span className="text-xl text-blue-300">◊</span>

                  <div className="mt-3 flex items-center gap-2">
                    <h3 className="font-semibold">
                      Pattern Generator
                    </h3>

                    <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
                      AI
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-slate-400">
                    Generate crochet patterns with Gemini AI.
                  </p>
                </Link>
              )}

              {isCreative && (
                <Link
                  href="/grid-pattern-maker"
                  className="rounded-xl border border-white/10 p-4 transition hover:border-blue-400/40 hover:bg-blue-400/5"
                >
                  <span className="text-xl text-blue-300">▦</span>

                  <h3 className="mt-3 font-semibold">
                    Grid Pattern Maker
                  </h3>

                  <p className="mt-1 text-sm text-slate-400">
                    Turn pictures into crochet grids.
                  </p>
                </Link>
              )}

              <Link
                href="/profile"
                className="rounded-xl border border-white/10 p-4 transition hover:border-blue-400/40 hover:bg-blue-400/5"
              >
                <span className="text-xl text-blue-300">○</span>

                <h3 className="mt-3 font-semibold">
                  Edit your profile
                </h3>

                <p className="mt-1 text-sm text-slate-400">
                  Tell people about your work.
                </p>
              </Link>

            </div>
          </section>

        </section>
      </section>
    </main>
  );
}
