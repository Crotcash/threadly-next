
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";

type SavedPost = {
  id: string;
  uid: string;
  postId: string;
  creatorId: string;
  creatorName?: string;
  caption?: string;
  imageUrl?: string;
  category?: string;
  savedAt?: Timestamp | null;
};

export default function SavedPosts() {
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let unsubscribeSaved: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeSaved?.();
      unsubscribeSaved = undefined;

      if (!user) {
        setPosts([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      const savedQuery = query(
        collection(db, "savedPosts"),
        where("uid", "==", user.uid),
        orderBy("savedAt", "desc")
      );

      unsubscribeSaved = onSnapshot(
        savedQuery,
        (snapshot) => {
          setPosts(
            snapshot.docs.map((savedDoc) => ({
              id: savedDoc.id,
              ...savedDoc.data(),
            })) as SavedPost[]
          );
          setError("");
          setLoading(false);
        },
        (err) => {
          console.error("Unable to load saved posts:", err);
          setError(
            "Unable to load saved posts. Please check your Firestore permissions."
          );
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeSaved?.();
    };
  }, []);

  async function removeSavedPost(savedPost: SavedPost) {
    const user = auth.currentUser;
    if (!user || user.uid !== savedPost.uid) return;

    try {
      await deleteDoc(doc(db, "savedPosts", savedPost.id));
    } catch (err) {
      console.error("Unable to remove saved post:", err);
      setError("Unable to remove this saved post. Please try again.");
    }
  }

  if (loading) {
    return (
      <p className="py-12 text-center text-slate-400">
        Loading your saved posts...
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="rounded-xl bg-red-950/40 p-4 text-red-300">
        {error}
      </p>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-2xl border border-blue-900/40 bg-[#0B1224] px-6 py-16 text-center text-white">
        <p className="text-5xl">♡</p>
        <h2 className="mt-4 text-xl font-semibold">
          Your saved collection is empty
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Save posts from creators to keep their work close.
        </p>
        <Link
          href="/community"
          className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500"
        >
          Explore the community
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <article
          key={post.id}
          className="overflow-hidden rounded-2xl border border-blue-900/40 bg-[#0B1224] text-white"
        >
          {post.imageUrl ? (
            <Image
              src={post.imageUrl}
              alt={post.caption || "Saved creative post"}
              width={900}
              height={900}
              unoptimized
              className="aspect-square w-full bg-[#070B16] object-cover"
            />
          ) : (
            <div className="flex aspect-square items-center justify-center bg-[#101A30] text-slate-500">
              No image
            </div>
          )}

          <div className="p-4">
            <p className="font-semibold">
              {post.creatorName || "Threadly Creator"}
            </p>

            <span className="mt-2 inline-block rounded-full bg-blue-500/15 px-3 py-1 text-xs text-blue-300">
              {post.category || "Creative post"}
            </span>

            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">
              {post.caption}
            </p>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-800 pt-4">
              <Link
                href="/community"
                className="text-sm font-medium text-blue-300 hover:text-blue-200"
              >
                Visit community
              </Link>

              <button
                type="button"
                onClick={() => removeSavedPost(post)}
                className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
              >
                Remove
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
