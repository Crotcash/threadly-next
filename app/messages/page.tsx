
"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Timestamp,
} from "firebase/firestore";

import { auth, db } from "../lib/firebase";

type Conversation = {
  id: string;
  participants: string[];
  participantNames?: Record<string, string>;
  lastMessage?: string;
  lastSenderId?: string;
  lastMessageAt?: Timestamp | null;
  createdAt?: Timestamp | null;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const firebaseError = error as Error & { code?: string };
    return `${firebaseError.code ?? "error"}: ${firebaseError.message}`;
  }

  return "An unexpected error occurred.";
}

function MessagesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [uid, setUid] = useState("");
  const [myName, setMyName] = useState("Threadly User");
  const [authReady, setAuthReady] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  const openingRef = useRef(false);
  const processedTargetRef = useRef("");

  const targetId = searchParams.get("to")?.trim() ?? "";
  const targetName =
    searchParams.get("name")?.trim() || "Threadly User";

  // 1. AUTHENTICATION
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) {
          setUid("");
          setAuthReady(true);
          setLoading(false);
          router.replace("/login");
          return;
        }

        setUid(user.uid);
        setMyName(
          user.displayName || user.email || "Threadly User"
        );
        setAuthReady(true);

        try {
          const profileSnapshot = await getDoc(
            doc(db, "users", user.uid)
          );

          if (profileSnapshot.exists()) {
            const profile = profileSnapshot.data();

            setMyName(
              profile.displayName ||
                profile.username ||
                user.displayName ||
                user.email ||
                "Threadly User"
            );
          }
        } catch (err) {
          console.error("Unable to load user profile:", err);
        }
      },
      (err) => {
        console.error("Authentication error:", err);
        setError(`Authentication failed: ${getErrorMessage(err)}`);
        setAuthReady(true);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [router]);

  // 2. LOAD INBOX CONVERSATIONS
  useEffect(() => {
    if (!authReady || !uid) return;

    const conversationsQuery = query(
      collection(db, "conversations"),
      where("participants", "array-contains", uid)
    );

    const unsubscribe = onSnapshot(
      conversationsQuery,
      (snapshot) => {
        const results: Conversation[] = snapshot.docs.map(
          (item) => ({
            id: item.id,
            ...(item.data() as Omit<Conversation, "id">),
          })
        );

        results.sort((a, b) => {
          const aTime =
            a.lastMessageAt?.toDate?.().getTime() ?? 0;

          const bTime =
            b.lastMessageAt?.toDate?.().getTime() ?? 0;

          return bTime - aTime;
        });

        setConversations(results);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Unable to load conversations:", err);
        setError(`Unable to load inbox: ${getErrorMessage(err)}`);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [authReady, uid]);

  // 3. CREATE OR OPEN A CONVERSATION
  const openConversation = useCallback(
    async (recipientId: string, recipientName: string) => {
      if (!uid) {
        setError("Please sign in before messaging someone.");
        return;
      }

      const cleanRecipientId = recipientId.trim();

      if (!cleanRecipientId) {
        setError("The recipient's Firebase UID is missing.");
        return;
      }

      if (cleanRecipientId === uid) {
        setError("You cannot start a conversation with yourself.");
        return;
      }

      if (openingRef.current) return;

      openingRef.current = true;
      setOpening(true);
      setError("");

      try {
        // Both participants must generate the same document ID.
        const participants = [uid, cleanRecipientId].sort();
        const conversationId = participants.join("_");

        const conversationRef = doc(
          db,
          "conversations",
          conversationId
        );

        const existingConversation = await getDoc(
          conversationRef
        );

        if (existingConversation.exists()) {
          const existingData = existingConversation.data();

          const existingParticipants =
            existingData.participants as string[] | undefined;

          if (
            !existingParticipants ||
            existingParticipants.length !== 2 ||
            !participants.every((participant) =>
              existingParticipants.includes(participant)
            )
          ) {
            throw new Error(
              "This conversation does not belong to these participants."
            );
          }
        } else {
          // These fields and values match your Firestore rules.
          const newConversation = {
            participants,

            participantNames: {
              [uid]: myName || "Threadly User",
              [cleanRecipientId]:
                recipientName || "Threadly User",
            },

            lastMessage: "",
            lastSenderId: "",
            lastMessageAt: null,
            lastReadAt: {},
            createdAt: serverTimestamp(),
          };

          try {
            await setDoc(conversationRef, newConversation);
          } catch (creationError) {
            // Check whether another request created it first.
            const retrySnapshot = await getDoc(conversationRef);

            if (!retrySnapshot.exists()) {
              throw creationError;
            }

            const retryParticipants =
              retrySnapshot.data().participants as
                | string[]
                | undefined;

            if (
              !retryParticipants ||
              retryParticipants.length !== 2 ||
              !participants.every((participant) =>
                retryParticipants.includes(participant)
              )
            ) {
              throw creationError;
            }
          }
        }

        // Navigate using the actual Firestore document ID.
        router.push(
          `/messages/${encodeURIComponent(conversationId)}`
        );
      } catch (err) {
        console.error("Unable to open conversation:", err);

        setError(
          `Unable to open conversation: ${getErrorMessage(err)}`
        );
      } finally {
        openingRef.current = false;
        setOpening(false);
      }
    },
    [uid, myName, router]
  );

  // 4. HANDLE MESSAGE CREATOR LINKS
  useEffect(() => {
    if (!authReady || !uid || !targetId) return;

    const targetKey = `${uid}:${targetId}`;

    if (processedTargetRef.current === targetKey) return;

    if (openingRef.current) return;

    processedTargetRef.current = targetKey;

    void openConversation(targetId, targetName);
  }, [authReady, uid, targetId, targetName, openConversation]);

  // 5. CONVERSATION HELPERS
  function getOtherParticipant(
    conversation: Conversation
  ): string {
    return (
      conversation.participants.find(
        (participant) => participant !== uid
      ) ?? ""
    );
  }

  function getConversationName(
    conversation: Conversation
  ): string {
    const otherId = getOtherParticipant(conversation);

    return (
      conversation.participantNames?.[otherId] ||
      "Threadly User"
    );
  }

  function formatConversationDate(
    timestamp?: Timestamp | null
  ): string {
    if (!timestamp?.toDate) return "";

    return timestamp.toDate().toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  // 6. INBOX UI
  return (
    <main className="min-h-screen bg-[#070b18] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-4xl">

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-medium text-blue-400">
              THREADLY MESSAGES
            </p>

            <h1 className="text-3xl font-bold sm:text-4xl">
              Inbox
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              Continue conversations with people on Threadly.
            </p>
          </div>

          <Link
            href="/community"
            className="rounded-xl border border-blue-500/30 px-4 py-2 text-sm text-blue-300 transition hover:bg-blue-500/10"
          >
            Back to Community
          </Link>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {opening && (
          <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-300">
            Opening conversation...
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1428]">
          {!authReady || loading ? (
            <div className="p-6 text-slate-400">
              Loading conversations...
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center">
              <div className="mb-4 text-4xl">💬</div>

              <h2 className="text-xl font-semibold">
                No conversations yet
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                Visit the community and select Message Creator
                to start a conversation.
              </p>

              <Link
                href="/community"
                className="mt-5 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold transition hover:bg-blue-500"
              >
                Explore Community
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-white/10">
              {conversations.map((conversation) => {
                const otherId =
                  getOtherParticipant(conversation);

                return (
                  <li key={conversation.id}>
                    <Link
                      href={`/messages/${encodeURIComponent(
                        conversation.id
                      )}`}
                      className="block p-5 transition hover:bg-blue-500/5"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-lg font-bold text-blue-300">
                            {getConversationName(conversation)
                              .slice(0, 1)
                              .toUpperCase()}
                          </div>

                          <div className="min-w-0">
                            <h2 className="truncate font-semibold">
                              {getConversationName(conversation)}
                            </h2>

                            <p className="mt-1 truncate text-sm text-slate-400">
                              {conversation.lastMessage ||
                                "Start chatting"}
                            </p>

                            <p className="mt-1 truncate text-xs text-slate-500">
                              {otherId}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-xs text-slate-500">
                            {formatConversationDate(
                              conversation.lastMessageAt
                            )}
                          </p>

                          <span className="mt-2 inline-block text-sm text-blue-400">
                            Open →
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

// PAGE EXPORT
export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#070b18] px-4 py-8 text-white sm:px-8">
          <div className="mx-auto max-w-4xl">
            <h1 className="text-3xl font-bold">Inbox</h1>

            <p className="mt-3 text-sm text-slate-400">
              Loading your conversations...
            </p>
          </div>
        </main>
      }
    >
      <MessagesContent />
    </Suspense>
  );
}
