
"use client";

import {
  type FormEvent,
  Suspense,
  useEffect,
  useState,
} from "react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { auth, db } from "../../lib/firebase";

// ======================================================
// TYPES
// ======================================================

type ChatMessage = {
  id: string;
  uid: string;
  senderName: string;
  text: string;
  createdAt?: {
    toDate?: () => Date;
  } | null;
};

type Conversation = {
  participants: string[];
  participantNames?: Record<string, string>;
};

// ======================================================
// ERROR HANDLER
// ======================================================

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const firebaseError = error as Error & {
      code?: string;
    };

    return `${firebaseError.code ?? "error"}: ${firebaseError.message}`;
  }

  return "An unexpected error occurred.";
}

// ======================================================
// CONVERSATION PAGE CONTENT
// ======================================================

function ConversationPageContent() {
  const router = useRouter();

  // Read conversation ID from the URL.
  const routeParams = useParams<{
    conversationId: string;
  }>();

  const conversationId =
    typeof routeParams?.conversationId === "string"
      ? routeParams.conversationId
      : "";

  // ======================================================
  // STATE
  // ======================================================

  const [uid, setUid] = useState("");
  const [authReady, setAuthReady] = useState(false);

  const [conversation, setConversation] =
    useState<Conversation | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");

  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [error, setError] = useState("");
  const [messageError, setMessageError] = useState("");

  // A boolean is more stable than depending on the entire
  // conversation object in the messages listener.
  const isConversationParticipant =
    !!uid &&
    !!conversation &&
    Array.isArray(conversation.participants) &&
    conversation.participants.includes(uid);

  // ======================================================
  // 1. AUTHENTICATION
  // ======================================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (!user) {
          setUid("");
          setAuthReady(true);
          setLoading(false);

          router.replace("/login");
          return;
        }

        setUid(user.uid);
        setAuthReady(true);
      },
      (err) => {
        console.error("Authentication error:", err);

        setError(
          `Authentication failed: ${describeError(err)}`
        );

        setAuthReady(true);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [router]);

  // ======================================================
  // 2. LOAD CONVERSATION ONCE
  // ======================================================

  useEffect(() => {
    if (!authReady) return;

    if (!uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    if (!conversationId) {
      setLoading(false);

      setError(
        "Conversation ID is missing from the URL. Return to your inbox and open the conversation again."
      );

      return;
    }

    let cancelled = false;

    async function loadConversation() {
      setLoading(true);
      setError("");
      setConversation(null);
      setMessages([]);
      setMessageError("");

      try {
        const conversationRef = doc(
          db,
          "conversations",
          conversationId
        );

        const snapshot = await getDoc(conversationRef);

        if (cancelled) return;

        if (!snapshot.exists()) {
          setConversation(null);
          setLoading(false);

          setError(
            "This conversation does not exist. Return to your inbox and open it again."
          );

          return;
        }

        const data = snapshot.data() as Conversation;

        if (
          !Array.isArray(data.participants) ||
          !data.participants.includes(uid)
        ) {
          setConversation(null);
          setLoading(false);

          setError(
            "You do not have permission to access this conversation."
          );

          return;
        }

        setConversation(data);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;

        console.error("Unable to load conversation:", err);

        setConversation(null);
        setLoading(false);

        setError(
          `Unable to load conversation: ${describeError(err)}`
        );
      }
    }

    void loadConversation();

    return () => {
      cancelled = true;
    };
  }, [authReady, uid, conversationId]);

  // ======================================================
  // 3. REAL-TIME MESSAGE LISTENER
  // ======================================================

  useEffect(() => {
    if (
      !uid ||
      !isConversationParticipant ||
      !conversationId
    ) {
      return;
    }

    let cancelled = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessagesLoading(true);
    setMessageError("");

    const messagesRef = collection(
      db,
      "conversations",
      conversationId,
      "messages"
    );

    const messagesQuery = query(
      messagesRef,
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        if (cancelled) return;

        const results: ChatMessage[] =
          snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<ChatMessage, "id">),
          }));

        setMessages(results);
        setMessagesLoading(false);

        // Only update the read receipt when the latest
        // message was sent by the other participant.
        const latestMessage = results[results.length - 1];

        if (
          latestMessage &&
          latestMessage.uid !== uid
        ) {
          void updateDoc(
            doc(db, "conversations", conversationId),
            {
              [`lastReadAt.${uid}`]: serverTimestamp(),
            }
          ).catch((err: unknown) => {
            console.error(
              "Unable to update read status:",
              err
            );
          });
        }
      },
      (err) => {
        if (cancelled) return;

        console.error("Unable to load messages:", err);

        setMessagesLoading(false);

        setMessageError(
          `Unable to load messages: ${describeError(err)}`
        );
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [uid, isConversationParticipant, conversationId]);

  // ======================================================
  // 4. SEND MESSAGE
  // ======================================================

  async function handleSend(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const text = messageText.trim();

    if (
      !text ||
      !uid ||
      !conversation ||
      !isConversationParticipant ||
      sending
    ) {
      return;
    }

    if (text.length > 2000) {
      setMessageError(
        "Messages cannot exceed 2,000 characters."
      );
      return;
    }

    setSending(true);
    setMessageError("");

    try {
      // Get the sender's profile.
      const profileSnapshot = await getDoc(
        doc(db, "users", uid)
      );

      const profile = profileSnapshot.exists()
        ? profileSnapshot.data()
        : {};

      const senderName =
        profile.displayName ||
        profile.username ||
        auth.currentUser?.displayName ||
        "Threadly user";

      const conversationRef = doc(
        db,
        "conversations",
        conversationId
      );

      const messagesRef = collection(
        db,
        "conversations",
        conversationId,
        "messages"
      );

      // Save the message and update the conversation
      // preview together in one batch.

      const batch = writeBatch(db);

      const newMessageRef = doc(messagesRef);

      batch.set(newMessageRef, {
        uid,
        senderName,
        text,
        createdAt: serverTimestamp(),
      });

      batch.update(conversationRef, {
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        lastSenderId: uid,
        [`lastReadAt.${uid}`]: serverTimestamp(),
      });

      await batch.commit();

      setMessageText("");
    } catch (err) {
      console.error("Unable to send message:", err);

      setMessageError(
        `Unable to send message: ${describeError(err)}`
      );
    } finally {
      setSending(false);
    }
  }

  // ======================================================
  // 5. IDENTIFY THE OTHER PARTICIPANT
  // ======================================================

  const otherUid =
    conversation?.participants.find(
      (participant) => participant !== uid
    ) ?? "";

  const otherName =
    (otherUid &&
      conversation?.participantNames?.[otherUid]) ||
    "Threadly user";

  // ======================================================
  // 6. PAGE UI
  // ======================================================

  return (
    <main className="min-h-screen bg-[#070b18] px-4 py-6 text-white sm:px-8">
      <div className="mx-auto flex min-h-[85vh] max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1428]">

        {/* HEADER */}

        <header className="flex items-center gap-4 border-b border-white/10 p-5">
          <Link
            href="/messages"
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-blue-300 hover:bg-white/5"
          >
            ← Inbox
          </Link>

          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">
              {otherName}
            </h1>

            <p className="text-xs text-slate-400">
              Threadly conversation
            </p>
          </div>
        </header>

        {/* CONVERSATION ERROR */}

        {error && (
          <div
            role="alert"
            className="mx-4 mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {/* MESSAGE DISPLAY */}

        <section
          aria-label="Messages"
          className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-6"
        >
          {loading ? (
            <p className="m-auto text-sm text-slate-400">
              Loading conversation...
            </p>
          ) : !conversation ? (
            <div className="m-auto text-center">
              <h2 className="text-lg font-semibold">
                Unable to open conversation
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                Check the conversation link or return to your inbox.
              </p>

              <Link
                href="/messages"
                className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
              >
                Return to Inbox
              </Link>
            </div>
          ) : messagesLoading ? (
            <p className="m-auto text-sm text-slate-400">
              Loading messages...
            </p>
          ) : messageError ? (
            <p className="m-auto text-center text-sm text-red-300">
              {messageError}
            </p>
          ) : messages.length === 0 ? (
            <div className="m-auto text-center">
              <h2 className="text-lg font-semibold">
                Say hello!
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                Your conversation starts here.
              </p>
            </div>
          ) : (
            messages.map((message) => {
              const ownMessage = message.uid === uid;

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    ownMessage
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[70%] ${
                      ownMessage
                        ? "bg-blue-600 text-white"
                        : "border border-white/10 bg-[#151e35] text-slate-100"
                    }`}
                  >
                    {!ownMessage && (
                      <p className="mb-1 text-xs font-semibold text-blue-300">
                        {message.senderName}
                      </p>
                    )}

                    <p className="whitespace-pre-wrap break-words text-sm">
                      {message.text}
                    </p>

                    <p className="mt-2 text-right text-[10px] opacity-70">
                      {message.createdAt?.toDate
                        ? message.createdAt.toDate().toLocaleString()
                        : "Sending..."}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </section>

        {/* MESSAGE INPUT */}

        <form
          onSubmit={handleSend}
          className="flex gap-3 border-t border-white/10 p-4 sm:p-5"
        >
          <input
            type="text"
            value={messageText}
            onChange={(event) =>
              setMessageText(event.target.value)
            }
            placeholder={
              loading
                ? "Opening conversation..."
                : "Write a message..."
            }
            maxLength={2000}
            disabled={
              loading ||
              !conversation ||
              sending
            }
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#070b18] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={
              loading ||
              !conversation ||
              sending ||
              !messageText.trim()
            }
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
    </main>
  );
}

// ======================================================
// 7. DEFAULT EXPORT WITH SUSPENSE
// ======================================================

export default function ConversationPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#070b18] text-slate-300">
          <p>Loading conversation...</p>
        </main>
      }
    >
      <ConversationPageContent />
    </Suspense>
  );
}
