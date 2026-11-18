
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from "firebase/firestore";

import { auth, db } from "../../lib/firebase";

type CommunityPost = {
  id: string;
  creatorId: string;
  creatorName?: string;
  caption?: string;
  imageUrl?: string;
  category?: string;
  createdAt?: Timestamp | null;
};

type CommunityComment = {
  id: string;
  uid: string;
  authorName: string;
  text: string;
  createdAt?: Timestamp | null;
};

function PostCard({ post }: { post: CommunityPost }) {
  const [user, setUser] = useState<User | null>(null);

  // Reactions
  const [liked, setLiked] = useState(false);
  const [reactionCount, setReactionCount] = useState(0);

  // Comments
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [sending, setSending] = useState(false);

  // Post deletion
  const [deletingPost, setDeletingPost] = useState(false);

  // General error
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const creatorName = post.creatorName || "Threadly Creator";

  const isPostOwner = !!user && user.uid === post.creatorId;

  const canMessageCreator =
    !!user && user.uid !== post.creatorId && !!post.creatorId;

  // 1. AUTHENTICATION

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
      },
      (err) => {
        console.error("Authentication listener failed:", err);
        setUser(null);
      }
    );

    return () => unsubscribe();
  }, []);

  // 2. LOAD REACTIONS AND COMMENTS

  useEffect(() => {
    const reactionsRef = collection(
      db,
      "posts",
      post.id,
      "reactions"
    );

    const unsubscribeReactions = onSnapshot(
      reactionsRef,
      (snapshot) => {
        setReactionCount(snapshot.size);

        setLiked(
          user
            ? snapshot.docs.some((item) => item.id === user.uid)
            : false
        );
      },
      (err) => {
        console.error("Unable to load reactions:", err);
      }
    );

    const commentsQuery = query(
      collection(db, "posts", post.id, "comments"),
      orderBy("createdAt", "asc")
    );

    const unsubscribeComments = onSnapshot(
      commentsQuery,
      (snapshot) => {
        setComments(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as CommunityComment[]
        );
      },
      (err) => {
        console.error("Unable to load comments:", err);
      }
    );

    return () => {
      unsubscribeReactions();
      unsubscribeComments();
    };
  }, [post.id, user]);

  // 3. LIKE / UNLIKE POST

  async function toggleReaction() {
    if (!user) {
      setError("Please sign in to react to posts.");
      return;
    }

    setError("");
    setSuccess("");

    const reactionRef = doc(
      db,
      "posts",
      post.id,
      "reactions",
      user.uid
    );

    try {
      if (liked) {
        await deleteDoc(reactionRef);
      } else {
        await setDoc(reactionRef, {
          uid: user.uid,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error("Reaction failed:", err);
      setError("Unable to save your reaction. Please try again.");
    }
  }

  // 4. SUBMIT COMMENT

  async function submitComment(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!user) {
      setError("Please sign in to comment.");
      return;
    }

    const text = commentText.trim();

    if (!text) return;

    if (text.length > 1000) {
      setError("Comments cannot exceed 1,000 characters.");
      return;
    }

    setSending(true);
    setError("");
    setSuccess("");

    try {
      await addDoc(
        collection(db, "posts", post.id, "comments"),
        {
          uid: user.uid,
          authorName:
            user.displayName ||
            user.email?.split("@")[0] ||
            "Threadly User",
          text,
          createdAt: serverTimestamp(),
        }
      );

      setCommentText("");
      setCommentsOpen(true);
    } catch (err) {
      console.error("Comment failed:", err);
      setError("Unable to publish your comment. Please try again.");
    } finally {
      setSending(false);
    }
  }

  // 5. DELETE COMMENT

  async function deleteComment(commentId: string) {
    if (!user) return;

    try {
      await deleteDoc(
        doc(db, "posts", post.id, "comments", commentId)
      );
    } catch (err) {
      console.error("Comment deletion failed:", err);
      setError("Unable to delete this comment.");
    }
  }

  // 6. DELETE OWN COMMUNITY POST

  async function deletePost() {
    if (!user || !isPostOwner || deletingPost) {
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to delete this post? This action cannot be undone."
    );

    if (!confirmed) return;

    setDeletingPost(true);
    setError("");
    setSuccess("");

    try {
      await deleteDoc(doc(db, "posts", post.id));

      setSuccess("Your post has been deleted successfully.");
    } catch (err) {
      console.error("Post deletion failed:", err);

      setError(
        "Unable to delete your post. Please check your permissions and try again."
      );
    } finally {
      setDeletingPost(false);
    }
  }

  // 7. POST DISPLAY

  return (
    <article className="overflow-hidden rounded-2xl border border-blue-900/40 bg-[#0B1224] text-white shadow-lg">

      {/* Creator information */}
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 font-bold">
          {creatorName.slice(0, 1).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {creatorName}
          </p>

          <p className="text-xs text-slate-400">
            {post.createdAt?.toDate
              ? post.createdAt.toDate().toLocaleString()
              : "Recently posted"}
          </p>
        </div>

        <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs text-blue-300">
          {post.category || "Creative post"}
        </span>
      </div>

      {/* Post image */}
      {post.imageUrl && (
        <Image
          src={post.imageUrl}
          alt={`Post by ${creatorName}`}
          loading="lazy"
          width={1200}
          height={800}
          sizes="100vw"
          className="max-h-[600px] w-full bg-[#070B16] object-contain"
        />
      )}

      {/* Caption and actions */}
      <div className="p-4">
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">
          {post.caption}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-slate-800 pt-4">

          {/* Reactions */}
          <button
            type="button"
            onClick={toggleReaction}
            aria-pressed={liked}
            className={`inline-flex items-center gap-2 text-sm transition ${
              liked
                ? "font-semibold text-pink-400"
                : "text-slate-300 hover:text-pink-400"
            }`}
          >
            <span className="text-lg">
              {liked ? "♥" : "♡"}
            </span>

            {reactionCount}{" "}
            {reactionCount === 1 ? "Reaction" : "Reactions"}
          </button>

          {/* Comments */}
          <button
            type="button"
            onClick={() => setCommentsOpen((open) => !open)}
            className="text-sm text-slate-300 transition hover:text-blue-400"
          >
            💬 {comments.length}{" "}
            {comments.length === 1 ? "Comment" : "Comments"}
          </button>

          {/* Message creator */}
          {canMessageCreator && (
            <Link
              href={`/messages?to=${encodeURIComponent(
                post.creatorId
              )}&name=${encodeURIComponent(creatorName)}`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              ✉ Message Creator
            </Link>
          )}

          {/* Delete own post */}
          {isPostOwner && (
            <button
              type="button"
              onClick={deletePost}
              disabled={deletingPost}
              className="ml-auto inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deletingPost ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Deleting...
                </>
              ) : (
                <>
                  <span>🗑</span>
                  Delete Post
                </>
              )}
            </button>
          )}
        </div>

        {/* Success message */}
        {success && (
          <p
            role="status"
            className="mt-3 text-sm text-green-400"
          >
            {success}
          </p>
        )}

        {/* Error message */}
        {error && (
          <p
            role="alert"
            className="mt-3 text-sm text-red-400"
          >
            {error}
          </p>
        )}

        {/* Comments section */}
        {commentsOpen && (
          <div className="mt-4 space-y-4 border-t border-slate-800 pt-4">

            <div className="max-h-72 space-y-4 overflow-y-auto">
              {comments.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No comments yet. Start the conversation!
                </p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold">
                      {(comment.authorName || "U")
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1 rounded-xl bg-[#070B16] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">
                          {comment.authorName || "Threadly User"}
                        </p>

                        {user?.uid === comment.uid && (
                          <button
                            type="button"
                            onClick={() => deleteComment(comment.id)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        )}
                      </div>

                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-300">
                        {comment.text}
                      </p>

                      {comment.createdAt?.toDate && (
                        <p className="mt-2 text-xs text-slate-500">
                          {comment.createdAt.toDate().toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add comment */}
            <form
              onSubmit={submitComment}
              className="flex gap-2"
            >
              <input
                value={commentText}
                onChange={(event) =>
                  setCommentText(event.target.value)
                }
                placeholder="Write a comment..."
                maxLength={1000}
                disabled={sending}
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-[#070B16] px-3 py-3 text-sm outline-none focus:border-blue-500"
              />

              <button
                type="submit"
                disabled={sending || !commentText.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
              >
                {sending ? "..." : "Send"}
              </button>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}

// ==================================================
// COMMUNITY FEED
// ==================================================

export default function CommunityFeed() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const postsQuery = query(
      collection(db, "posts"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      postsQuery,
      (snapshot) => {
        setPosts(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as CommunityPost[]
        );

        setError("");
        setLoading(false);
      },
      (err) => {
        console.error("Unable to load community posts:", err);

        setError(
          "We couldn't load posts. Please check your connection and permissions."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <p className="py-10 text-center text-slate-400">
        Loading community posts...
      </p>
    );
  }

  if (error) {
    return (
      <p
        role="alert"
        className="rounded-xl bg-red-950/40 p-4 text-red-300"
      >
        {error}
      </p>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-2xl border border-blue-900/40 bg-[#0B1224] p-8 text-center text-white">
        <p className="text-3xl">🧶</p>

        <h2 className="mt-3 text-xl font-bold">
          Your creative community starts here
        </h2>

        <p className="mt-2 text-sm text-slate-400">
          No posts yet. Check back soon for inspiration!
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-bold text-white">
        Community Feed
      </h2>

      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </section>
  );
}
