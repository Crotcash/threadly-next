
"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";

type AccountRole = "creative" | "creator" | "customer";

type ThreadlyPost = {
  id: string;
  creatorId?: string;
  creatorName?: string;
  caption?: string;
  category?: string;
  imageUrl?: string;
  title?: string;
  productName?: string;
  description?: string;
  price?: string | number;
  createdAt?: {
    toDate?: () => Date;
  };
};

export default function SearchPage() {
  const router = useRouter();

  const [role, setRole] = useState<AccountRole | null>(null);
  const [checking, setChecking] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [searchedKeyword, setSearchedKeyword] = useState("");
  const [posts, setPosts] = useState<ThreadlyPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const profile = await getDoc(doc(db, "users", user.uid));

        if (!profile.exists()) {
          router.replace("/login");
          return;
        }

        const userRole = String(profile.data().role ?? "")
          .trim()
          .toLowerCase();

        if (
          userRole !== "customer" &&
          userRole !== "creative" &&
          userRole !== "creator"
        ) {
          router.replace("/login");
          return;
        }

        setRole(userRole as AccountRole);
      } catch (err) {
        console.error("Unable to verify account:", err);
        setError("Unable to verify your account. Please try again.");
      } finally {
        setChecking(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const term = keyword.trim();

    if (!term) {
      setError("Enter a keyword to search for posts or products.");
      setPosts([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setError("");
    setSearchedKeyword(term);
    setHasSearched(true);

    try {
      // Retrieve community posts and product announcements.
      // Firestore rules still control which documents are readable.
      const snapshot = await getDocs(collection(db, "posts"));

      const allPosts: ThreadlyPost[] = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      })) as ThreadlyPost[];

      const searchTerm = term.toLowerCase();

      const matches = allPosts.filter((post) => {
        const searchableText = [
          post.caption,
          post.creatorName,
          post.category,
          post.title,
          post.productName,
          post.description,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(searchTerm);
      });

      setPosts(matches);
    } catch (err) {
      console.error("Search failed:", err);
      setError(
        "Search could not be completed. Please check your connection and try again."
      );
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }

  if (checking || !role) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070B16] text-slate-300">
        Loading Search...
      </main>
    );
  }

  const isCreative = role === "creative" || role === "creator";

  const isProduct = (post: ThreadlyPost) =>
    ["finished work", "product announcement"].includes(
      (post.category ?? "").toLowerCase()
    );

  const products = posts.filter(isProduct);
  const communityPosts = posts.filter((post) => !isProduct(post));

  function PostCard({ post }: { post: ThreadlyPost }) {
    return (
      <article className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0D1425] transition hover:border-blue-500/60">
        {post.imageUrl && (
          <div className="relative aspect-[4/3] w-full bg-slate-900">
            <Image
              src={post.imageUrl}
              alt={post.productName || post.title || "Threadly creation"}
              fill
              unoptimized
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        )}

        <div className="p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
            {post.category || "Community"}
          </span>

          <h3 className="mt-2 text-lg font-semibold text-white">
            {post.productName || post.title || post.creatorName || "Threadly post"}
          </h3>

          {post.caption && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
              {post.caption}
            </p>
          )}

          {post.description && post.description !== post.caption && (
            <p className="mt-2 text-sm text-slate-400">
              {post.description}
            </p>
          )}

          <p className="mt-3 text-xs text-slate-500">
            By {post.creatorName || "Threadly creator"}
          </p>

          {post.price !== undefined && (
            <p className="mt-2 font-semibold text-blue-300">
              M{post.price}
            </p>
          )}

          <Link
            href={isProduct(post) ? "/creations" : "/community"}
            className="mt-4 inline-flex rounded-lg border border-blue-500/50 px-4 py-2 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/10"
          >
            {isProduct(post) ? "Explore creations" : "View Community"}
          </Link>
        </div>
      </article>
    );
  }

  return (
    <main className="min-h-screen bg-[#070B16] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">
            Threadly
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            Search
          </h1>

          <p className="mt-2 text-slate-400">
            Find creative inspiration, handmade products, and community posts.
          </p>
        </header>

        <form
          onSubmit={handleSearch}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <input
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Search crochet, finished work, tutorials..."
            aria-label="Search posts and products"
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-[#0D1425] px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />

          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-blue-600 px-7 py-3 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </form>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        {hasSearched && !loading && !error && (
          <p className="mt-5 text-sm text-slate-400">
            {posts.length} result{posts.length === 1 ? "" : "s"} for{" "}
            <span className="font-semibold text-blue-300">
              &quot;{searchedKeyword}&quot;
            </span>
          </p>
        )}

        {loading && (
          <p className="mt-8 text-center text-slate-400">
            Searching Threadly...
          </p>
        )}

        {hasSearched && !loading && !error && posts.length === 0 && (
          <div className="mt-8 rounded-2xl border border-slate-800 bg-[#0D1425] p-8 text-center">
            <h2 className="text-xl font-semibold">No results found</h2>
            <p className="mt-2 text-sm text-slate-400">
              Try another keyword, such as a creator name, product category, or
              tutorial topic.
            </p>
          </div>
        )}

        {!loading && !error && hasSearched && products.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-4 text-xl font-bold">Products & Creations</h2>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </section>
        )}

        {!loading && !error && hasSearched && communityPosts.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-4 text-xl font-bold">Community Posts</h2>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {communityPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </section>
        )}

        <footer className="mt-12 flex flex-wrap gap-5 border-t border-slate-800 pt-5 text-sm">
          <Link
            href={isCreative ? "/dashboard" : "/home"}
            className="text-blue-400 hover:text-blue-300"
          >
            Back to {isCreative ? "Dashboard" : "Home"}
          </Link>

          <Link
            href="/community"
            className="text-blue-400 hover:text-blue-300"
          >
            Community
          </Link>

          <Link
            href="/creations"
            className="text-blue-400 hover:text-blue-300"
          >
            Creations
          </Link>
        </footer>
      </div>
    </main>
  );
}
