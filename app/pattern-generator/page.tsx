
"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";

type PatternSection = {
  section: string;
  steps: string[];
};

type CrochetPattern = {
  isCrochetRequest: boolean;
  message: string;
  title: string;
  description: string;
  difficulty: string;
  estimatedTime: string;
  materials: string[];
  abbreviations: string[];
  gauge: string;
  instructions: PatternSection[];
  finishingNotes: string[];
  tips: string[];
  disclaimer: string;
};

type PatternRequest = {
  description: string;
  difficulty: string;
  yarn: string;
  hookSize: string;
  projectSize: string;
};

const COOLDOWN_SECONDS = 5;

export default function PatternGeneratorPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);

  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState("Beginner");
  const [yarn, setYarn] = useState("Medium weight yarn");
  const [hookSize, setHookSize] = useState("4.0 mm");
  const [projectSize, setProjectSize] = useState("Adult");

  const [pattern, setPattern] = useState<CrochetPattern | null>(null);

  // Remember the inputs that produced the displayed pattern.
  const [patternRequest, setPatternRequest] =
    useState<PatternRequest | null>(null);

  // Remember the most recent request so it can be retried.
  const [lastRequest, setLastRequest] =
    useState<PatternRequest | null>(null);

  const [canRetry, setCanRetry] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Cooldown state.
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // --------------------------------------------------
  // COOLDOWN COUNTDOWN
  // --------------------------------------------------

  useEffect(() => {
    if (!cooldownUntil) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCooldownRemaining(0);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        Math.ceil((cooldownUntil - Date.now()) / 1000)
      );

      setCooldownRemaining(remaining);

      if (remaining === 0) {
        setCooldownUntil(0);
      }
    };

    updateCountdown();

    const interval = window.setInterval(
      updateCountdown,
      250
    );

    return () => window.clearInterval(interval);
  }, [cooldownUntil]);

  // --------------------------------------------------
  // VERIFY AUTHENTICATION AND CREATIVE ROLE
  // --------------------------------------------------

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (!currentUser) {
          router.replace("/login");
          return;
        }

        try {
          const userRef = doc(db, "users", currentUser.uid);
          const userSnapshot = await getDoc(userRef);

          if (!userSnapshot.exists()) {
            router.replace("/login");
            return;
          }

          const role = String(
            userSnapshot.data().role ?? ""
          )
            .trim()
            .toLowerCase();

          if (role !== "creative") {
            router.replace("/home");
            return;
          }

          setUser(currentUser);
          setCheckingRole(false);
        } catch (err) {
          console.error(
            "Pattern Generator access error:",
            err
          );

          setError(
            "Unable to verify your account. Please try again."
          );

          setCheckingRole(false);
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  // --------------------------------------------------
  // GENERATE OR RETRY A CROCHET PATTERN
  // --------------------------------------------------

  async function runGeneration(
    requestData: PatternRequest
  ) {
    if (generating || cooldownUntil > Date.now()) {
      return;
    }

    if (!user) {
      setError(
        "Please sign in before generating a pattern."
      );
      return;
    }

    setGenerating(true);
    setError("");
    setSuccess("");
    setCanRetry(false);

    try {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error(
          "Your login session has expired. Please sign in again."
        );
      }

      // Refresh Firebase authentication token.
      const token = await currentUser.getIdToken(true);

      console.log(
        "Firebase user authenticated:",
        currentUser.uid
      );

      // Send the request to the Next.js API route.
      const response = await fetch("/api/ai/pattern", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestData),
      });

      // Read the response body only once.
      const responseData = await response.json();

      console.log(
        "Pattern API status:",
        response.status
      );

      console.log(
        "Pattern API response:",
        responseData
      );

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            `Pattern generation failed (${response.status}).`
        );
      }

      if (!responseData.pattern) {
        throw new Error(
          "Gemini did not return a valid pattern."
        );
      }

      const generatedPattern =
        responseData.pattern as CrochetPattern;

      // Reject requests unrelated to crochet.
      if (!generatedPattern.isCrochetRequest) {
        setError(
          generatedPattern.message ||
            "Please enter a crochet-related project."
        );
        return;
      }

      // IMPORTANT:
      // Only replace the previous pattern after a new
      // pattern has been successfully generated.
      setPattern(generatedPattern);
      setPatternRequest(requestData);

      setSuccess(
        "Your crochet pattern has been generated successfully!"
      );

      setError("");

      // Scroll to the generated pattern.
      window.setTimeout(() => {
        document
          .getElementById("generated-pattern")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      }, 100);
    } catch (err) {
      console.error(
        "Pattern generation error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );

      // Make the same request available for retry.
      setCanRetry(true);

      // The previous successful pattern is NOT cleared.
    } finally {
      setGenerating(false);

      // Start a 5-second cooldown after each attempt.
      setCooldownUntil(
        Date.now() + COOLDOWN_SECONDS * 1000
      );
    }
  }

  // --------------------------------------------------
  // FORM SUBMISSION
  // --------------------------------------------------

  async function handleGenerate(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");
    setCanRetry(false);

    const trimmedDescription = description.trim();

    if (trimmedDescription.length < 5) {
      setError(
        "Please describe your crochet project in more detail."
      );
      return;
    }

    if (trimmedDescription.length > 500) {
      setError(
        "Your project description cannot exceed 500 characters."
      );
      return;
    }

    if (!user) {
      setError(
        "Please sign in before generating a pattern."
      );
      return;
    }

    const requestData: PatternRequest = {
      description: trimmedDescription,
      difficulty,
      yarn,
      hookSize,
      projectSize,
    };

    // Save the request for the Try Again button.
    setLastRequest(requestData);

    await runGeneration(requestData);
  }

  // --------------------------------------------------
  // RETRY THE PREVIOUS REQUEST
  // --------------------------------------------------

  async function handleRetry() {
    if (!lastRequest || generating) {
      return;
    }

    setCanRetry(false);

    await runGeneration(lastRequest);
  }

  // --------------------------------------------------
  // SAVE GENERATED PATTERN TO FIRESTORE
  // --------------------------------------------------

  async function handleSavePattern() {
    if (!user || !pattern) {
      setError("Generate a pattern before saving.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await addDoc(collection(db, "patterns"), {
        uid: user.uid,
        title: pattern.title,
        description: pattern.description,
        difficulty: pattern.difficulty,
        estimatedTime: pattern.estimatedTime,
        materials: pattern.materials,
        abbreviations: pattern.abbreviations,
        gauge: pattern.gauge,
        instructions: pattern.instructions,
        finishingNotes: pattern.finishingNotes,
        tips: pattern.tips,
        disclaimer: pattern.disclaimer,

        // Save the inputs belonging to this pattern,
        // not any newer form values.
        originalRequest: patternRequest ?? {
          description,
          difficulty,
          yarn,
          hookSize,
          projectSize,
        },

        createdAt: serverTimestamp(),
      });

      setSuccess(
        "Your pattern has been saved successfully!"
      );
    } catch (err) {
      console.error(
        "Saving pattern error:",
        err
      );

      setError(
        "Unable to save your pattern. Check your Firestore security rules."
      );
    } finally {
      setSaving(false);
    }
  }

  // --------------------------------------------------
  // LOADING SCREEN
  // --------------------------------------------------

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

  // --------------------------------------------------
  // MAIN PAGE
  // --------------------------------------------------

  return (
    <main className="min-h-screen bg-[#070B16] px-5 py-8 text-white sm:px-8 lg:px-12">
      <div className="mx-auto max-w-5xl">

        {/* HEADER */}

        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/dashboard"
              className="text-sm text-blue-400 transition hover:text-blue-300"
            >
              Back to Dashboard
            </Link>

            <div className="mt-5 flex items-center gap-3">
              <span className="text-4xl"></span>

              <div>
                <h1 className="text-2xl font-bold sm:text-3xl">
                  Pattern Generator
                </h1>

                <p className="mt-1 text-sm text-slate-400">
                  Powered by Gemini AI
                </p>
              </div>
            </div>
          </div>

          <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-4 py-2 text-xs font-semibold text-blue-300">
            CREATIVE STUDIO
          </span>
        </header>

        {/* INTRODUCTION */}

        <section className="mb-8 rounded-2xl border border-blue-400/20 bg-gradient-to-br from-[#14284B] via-[#101A31] to-[#0D1425] p-6 sm:p-8">
          <p className="text-sm font-semibold text-blue-300">
            YOUR IDEAS, YOUR PATTERNS
          </p>

          <h2 className="mt-3 text-2xl font-bold">
            Bring your crochet ideas to life.
          </h2>

          <p className="mt-3 max-w-2xl leading-7 text-slate-300">
            Describe what you want to create and let Threadly
            help you develop a crochet pattern with materials,
            abbreviations and step-by-step instructions.
          </p>
        </section>

        {/* GENERATOR FORM */}

        <section className="rounded-2xl border border-white/10 bg-[#0D1425] p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold">
              Create a crochet pattern
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Tell Gemini about the project you have in mind.
            </p>
          </div>

          <form
            onSubmit={handleGenerate}
            className="space-y-6"
          >
            {/* PROJECT DESCRIPTION */}

            <div>
              <label
                htmlFor="description"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                What would you like to crochet?
              </label>

              <textarea
                id="description"
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value)
                }
                placeholder="Example: I want to crochet a stylish bucket hat with a flower detail, using cotton yarn..."
                rows={5}
                maxLength={500}
                required
                className="w-full rounded-xl border border-white/10 bg-[#070B16] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400"
              />

              <p className="mt-2 text-right text-xs text-slate-500">
                {description.length}/500 characters
              </p>
            </div>

            {/* DIFFICULTY */}

            <div>
              <label
                htmlFor="difficulty"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Difficulty level
              </label>

              <select
                id="difficulty"
                value={difficulty}
                onChange={(e) =>
                  setDifficulty(e.target.value)
                }
                className="w-full rounded-xl border border-white/10 bg-[#070B16] px-4 py-3 text-sm text-white outline-none focus:border-blue-400"
              >
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </div>

            {/* YARN AND HOOK */}

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="yarn"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Yarn type
                </label>

                <select
                  id="yarn"
                  value={yarn}
                  onChange={(e) =>
                    setYarn(e.target.value)
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#070B16] px-4 py-3 text-sm text-white outline-none focus:border-blue-400"
                >
                  <option>Lightweight yarn</option>
                  <option>Medium weight yarn</option>
                  <option>Bulky yarn</option>
                  <option>Super bulky yarn</option>
                  <option>Cotton yarn</option>
                  <option>Acrylic yarn</option>
                  <option>Wool yarn</option>
                  <option>Other / Mixed yarn</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="hookSize"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Crochet hook size
                </label>

                <select
                  id="hookSize"
                  value={hookSize}
                  onChange={(e) =>
                    setHookSize(e.target.value)
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#070B16] px-4 py-3 text-sm text-white outline-none focus:border-blue-400"
                >
                  <option>2.0 mm</option>
                  <option>2.5 mm</option>
                  <option>3.0 mm</option>
                  <option>3.5 mm</option>
                  <option>4.0 mm</option>
                  <option>4.5 mm</option>
                  <option>5.0 mm</option>
                  <option>5.5 mm</option>
                  <option>6.0 mm</option>
                  <option>8.0 mm</option>
                  <option>10.0 mm</option>
                </select>
              </div>
            </div>

            {/* PROJECT SIZE */}

            <div>
              <label
                htmlFor="projectSize"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Project size
              </label>

              <select
                id="projectSize"
                value={projectSize}
                onChange={(e) =>
                  setProjectSize(e.target.value)
                }
                className="w-full rounded-xl border border-white/10 bg-[#070B16] px-4 py-3 text-sm text-white outline-none focus:border-blue-400"
              >
                <option>Small</option>
                <option>Medium</option>
                <option>Large</option>
                <option>Adult</option>
                <option>Child</option>
                <option>Baby</option>
                <option>
                  Custom size - specify in description
                </option>
              </select>
            </div>

            {/* ERRORS */}

            {error && (
              <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">
                <p>{error}</p>

                {canRetry && lastRequest && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleRetry}
                      disabled={
                        generating ||
                        cooldownRemaining > 0
                      }
                      className="rounded-lg bg-red-400/15 px-5 py-2.5 font-semibold text-red-200 transition hover:bg-red-400/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {generating
                        ? "Retrying..."
                        : cooldownRemaining > 0
                          ? `Try Again in ${cooldownRemaining}s`
                          : "↻ Try Again"}
                    </button>

                    <p className="mt-2 text-xs text-red-200/70">
                      Your previous successful pattern, if any,
                      has been preserved. Your previous request
                      details will be reused.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* SUCCESS */}

            {success && (
              <div className="rounded-xl border border-green-400/20 bg-green-400/10 p-4 text-sm text-green-300">
                {success}
              </div>
            )}

            {/* COOLDOWN NOTICE */}

            {cooldownRemaining > 0 && !generating && (
              <p className="text-center text-xs text-slate-400">
                Please wait {cooldownRemaining} seconds
                before making another generation request.
              </p>
            )}

            {/* GENERATE BUTTON */}

            <button
              type="submit"
              disabled={
                generating ||
                cooldownRemaining > 0
              }
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-blue-500 px-6 py-4 font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? (
                <>
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Generating your pattern...
                </>
              ) : cooldownRemaining > 0 ? (
                `Please wait ${cooldownRemaining}s`
              ) : (
                "Generate Crochet Pattern"
              )}
            </button>
          </form>
        </section>

        {/* GENERATED PATTERN */}

        {pattern && (
          <section
            id="generated-pattern"
            className="mt-8 space-y-6"
          >
            {/* PATTERN HEADER */}

            <div className="rounded-2xl border border-blue-400/20 bg-[#0D1425] p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-300">
                  GENERATED WITH GEMINI AI
                </span>

                <span className="text-sm text-slate-400">
                  {pattern.difficulty}
                </span>
              </div>

              <h2 className="mt-5 text-2xl font-bold sm:text-3xl">
                {pattern.title}
              </h2>

              <p className="mt-3 leading-7 text-slate-400">
                {pattern.description}
              </p>

              <p className="mt-4 text-sm text-blue-300">
                Estimated time: {pattern.estimatedTime}
              </p>
            </div>

            {/* MATERIALS */}

            <div className="rounded-2xl border border-white/10 bg-[#0D1425] p-6">
              <h3 className="text-lg font-bold">
                Materials needed
              </h3>

              <ul className="mt-4 space-y-3">
                {pattern.materials?.map((item, index) => (
                  <li
                    key={index}
                    className="flex gap-3 text-sm leading-6 text-slate-300"
                  >
                    <span className="text-blue-400">✦</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* ABBREVIATIONS */}

            <div className="rounded-2xl border border-white/10 bg-[#0D1425] p-6">
              <h3 className="text-lg font-bold">
                Crochet abbreviations
              </h3>

              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {pattern.abbreviations?.map(
                  (item, index) => (
                    <li
                      key={index}
                      className="rounded-lg bg-[#070B16] p-3 text-sm text-slate-300"
                    >
                      {item}
                    </li>
                  )
                )}
              </ul>
            </div>

            {/* GAUGE */}

            <div className="rounded-2xl border border-white/10 bg-[#0D1425] p-6">
              <h3 className="text-lg font-bold">
                Gauge
              </h3>

              <p className="mt-3 text-sm leading-7 text-slate-300">
                {pattern.gauge}
              </p>
            </div>

            {/* INSTRUCTIONS */}

            <div className="rounded-2xl border border-white/10 bg-[#0D1425] p-6 sm:p-8">
              <h3 className="text-xl font-bold">
                Step-by-step instructions
              </h3>

              <div className="mt-6 space-y-8">
                {pattern.instructions?.map(
                  (section, sectionIndex) => (
                    <div key={sectionIndex}>
                      <h4 className="mb-4 font-semibold text-blue-300">
                        {section.section}
                      </h4>

                      <ol className="space-y-4">
                        {section.steps?.map(
                          (step, stepIndex) => (
                            <li
                              key={stepIndex}
                              className="flex gap-4 text-sm leading-7 text-slate-300"
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-xs font-semibold text-blue-300">
                                {stepIndex + 1}
                              </span>

                              <span>{step}</span>
                            </li>
                          )
                        )}
                      </ol>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* FINISHING NOTES */}

            <div className="rounded-2xl border border-white/10 bg-[#0D1425] p-6">
              <h3 className="text-lg font-bold">
                Finishing notes
              </h3>

              <ul className="mt-4 space-y-3">
                {pattern.finishingNotes?.map(
                  (item, index) => (
                    <li
                      key={index}
                      className="text-sm leading-7 text-slate-300"
                    >
                      • {item}
                    </li>
                  )
                )}
              </ul>
            </div>

            {/* TIPS */}

            <div className="rounded-2xl border border-white/10 bg-[#0D1425] p-6">
              <h3 className="text-lg font-bold">
                Helpful tips
              </h3>

              <ul className="mt-4 space-y-3">
                {pattern.tips?.map((item, index) => (
                  <li
                    key={index}
                    className="text-sm leading-7 text-slate-300"
                  >
                    ✦ {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* DISCLAIMER */}

            <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-5">
              <h3 className="font-semibold text-yellow-300">
                Important pattern notice
              </h3>

              <p className="mt-2 text-sm leading-7 text-slate-300">
                {pattern.disclaimer}
              </p>
            </div>

            {/* SAVE AND CREATE ANOTHER */}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSavePattern}
                disabled={saving}
                className="flex-1 rounded-xl bg-blue-500 px-6 py-4 font-semibold transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? "Saving pattern..."
                  : "♡ Save Pattern"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setDescription("");
                  setDifficulty("Beginner");
                  setYarn("Medium weight yarn");
                  setHookSize("4.0 mm");
                  setProjectSize("Adult");

                  setLastRequest(null);
                  setCanRetry(false);
                  setError("");
                  setSuccess("");

                  window.scrollTo({
                    top: 0,
                    behavior: "smooth",
                  });
                }}
                className="rounded-xl border border-white/15 px-6 py-4 font-semibold transition hover:bg-white/5"
              >
                Create another
              </button>
            </div>
          </section>
        )}

        {/* FOOTER */}

        <footer className="mt-12 border-t border-white/10 py-6 text-center text-xs leading-6 text-slate-500">
          Threadly Pattern Generator · Powered by Gemini AI
          <br />
          AI-generated patterns should be reviewed and tested before use. Happy, happy creating!!
        </footer>
      </div>
    </main>
  );
}
