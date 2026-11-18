
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import PostForm from "../components/creator/PostForm";
import CommunityFeed from "../components/creator/CommunityFeed";

type AccountRole = "creative" | "creator" | "customer";

export default function CommunityPage() {
  const router = useRouter();

  const [role, setRole] = useState<AccountRole | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setChecking(false);
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

        const userRole = String(snapshot.data().role ?? "")
          .trim()
          .toLowerCase();

        if (
          userRole !== "creative" &&
          userRole !== "creator" &&
          userRole !== "customer"
        ) {
          router.replace("/login");
          return;
        }

        setRole(userRole as AccountRole);
      } catch (error) {
        console.error("Unable to verify account:", error);
        router.replace("/login");
        return;
      } finally {
        setChecking(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  if (checking || !role) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070B16] text-slate-300">
        Loading Community...
      </main>
    );
  }

  const isCreative = role === "creative" || role === "creator";

  return (
    <main className="min-h-screen bg-[#070B16] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">
              Threadly
            </p>

            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Community
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              Discover creations, share inspiration and connect with creatives.
            </p>
          </div>

          {isCreative && (
            <Link
              href="/community/create"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-500"
            >
              <span className="text-xl">+</span>
              <span className="hidden sm:inline">Create Post</span>
              <span className="sm:hidden">Create</span>
            </Link>
          )}
        </header>

        {/* Only creative accounts can see the post creation form. */}
        {isCreative && <PostForm />}

        {/* All authenticated account types can view and interact with posts. */}
        <CommunityFeed />

        <footer className="mt-10 border-t border-slate-800 pt-5">
          <Link
            href={isCreative ? "/dashboard" : "/home"}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            ← Back to {isCreative ? "Dashboard" : "Home"}
          </Link>
        </footer>
      </div>
    </main>
  );
}
