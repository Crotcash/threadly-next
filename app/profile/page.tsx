
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

type UserProfile = {
  displayName?: string;
  username?: string;
  email?: string;
  bio?: string;
  photoURL?: string;
  role?: string;
};

export default function MyProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      setLoading(true);
      setError("");

      try {
        const profileRef = doc(db, "users", user.uid);
        const profileSnapshot = await getDoc(profileRef);

        if (cancelled) return;

        if (!profileSnapshot.exists()) {
          await signOut(auth);
          router.replace("/login");
          return;
        }

        const profileData = profileSnapshot.data() as UserProfile;

        const accountRole = String(profileData.role ?? "")
          .trim()
          .toLowerCase();

        if (
          accountRole !== "customer" &&
          accountRole !== "creative" &&
          accountRole !== "creator"
        ) {
          router.replace("/login");
          return;
        }

        setProfile({
          ...profileData,
          email: profileData.email || user.email || "",
        });

        setRole(accountRole);
      } catch (err) {
        console.error("Unable to load profile:", err);

        if (!cancelled) {
          setError(
            "Unable to load your profile. Please check your connection and try again."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070B16] text-slate-300">
        Loading your profile...
      </main>
    );
  }

  const isCustomer = role === "customer";

  const displayName =
    profile?.displayName ||
    profile?.username ||
    (isCustomer ? "Threadly Customer" : "Threadly Creative");

  const username = profile?.username
    ? `@${profile.username}`
    : isCustomer
      ? "@threadlycustomer"
      : "@threadlycreator";

  return (
    <main className="min-h-screen bg-[#070B16] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">

        {/* Page heading */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-blue-400">
              {isCustomer ? "Your Threadly space" : "Your creative space"}
            </p>

            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              My Profile
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              View and manage your personal information.
            </p>
          </div>

          <Link
            href={isCustomer ? "/home" : "/dashboard"}
            className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:border-blue-500 hover:text-white"
          >
            Back to {isCustomer ? "Home" : "Dashboard"}
          </Link>
        </div>

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {/* Profile card */}
        <section className="overflow-hidden rounded-2xl border border-blue-900/50 bg-[#0B1224]">

          {/* Cover */}
          <div className="h-32 bg-gradient-to-r from-blue-950 via-blue-700/50 to-[#0B1224] sm:h-44" />

          <div className="px-5 pb-8 sm:px-8">

            {/* Avatar and main details */}
            <div className="-mt-14 flex flex-wrap items-end gap-5">

              {profile?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.photoURL}
                  alt={`${displayName}'s profile`}
                  className="h-28 w-28 rounded-full border-4 border-[#0B1224] bg-[#070B16] object-cover"
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-[#0B1224] bg-blue-600 text-4xl font-bold">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1 pb-2">
                <h2 className="break-words text-2xl font-bold">
                  {displayName}
                </h2>

                <p className="mt-1 text-sm text-blue-300">
                  {username}
                </p>

                <p className="mt-2 text-xs capitalize text-slate-500">
                  {isCustomer ? "Customer Account" : "Creative Account"}
                </p>
              </div>

              <Link
                href="/profile/edit"
                className="mb-2 inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
              >
                Edit Profile
              </Link>
            </div>

            {/* Bio */}
            <div className="mt-8 border-t border-slate-800 pt-6">
              <h3 className="text-sm font-semibold text-slate-300">
                About Me
              </h3>

              <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-7 text-slate-400">
                {profile?.bio?.trim()
                  ? profile.bio
                  : "You haven't added a bio yet. Click Edit Profile to tell the Threadly community a little about yourself."}
              </p>
            </div>

            {/* Account information */}
            <div className="mt-8 border-t border-slate-800 pt-6">
              <h3 className="mb-5 text-lg font-semibold">
                Account Information
              </h3>

              <div className="grid gap-5 sm:grid-cols-2">

                <div className="rounded-xl border border-slate-800 bg-[#070B16] p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Display Name
                  </p>

                  <p className="mt-2 break-words text-sm font-medium text-white">
                    {profile?.displayName || "Not provided"}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#070B16] p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Username
                  </p>

                  <p className="mt-2 break-words text-sm font-medium text-white">
                    {username}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#070B16] p-4 sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Email Address
                  </p>

                  <p className="mt-2 break-all text-sm font-medium text-white">
                    {profile?.email || "No email available"}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#070B16] p-4 sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Account Type
                  </p>

                  <p className="mt-2 text-sm font-medium capitalize text-white">
                    {isCustomer ? "Customer" : "Creative"}
                  </p>
                </div>

              </div>
            </div>

            {/* Edit profile reminder */}
            <div className="mt-8 flex flex-col gap-4 rounded-xl border border-blue-900/50 bg-blue-950/20 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-white">
                  Keep your profile updated
                </h3>

                <p className="mt-1 text-sm text-slate-400">
                  Update your name, username, profile picture and bio.
                </p>
              </div>

              <Link
                href="/profile/edit"
                className="shrink-0 rounded-lg border border-blue-500/50 px-4 py-2.5 text-center text-sm font-semibold text-blue-300 transition hover:bg-blue-500/10"
              >
                Update Information
              </Link>
            </div>

          </div>
        </section>

        {/* Customer shortcut */}
        {isCustomer && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-[#0B1224] p-5">
            <h3 className="font-semibold text-white">
              Discover something you love
            </h3>

            <p className="mt-2 text-sm text-slate-400">
              Explore creative work and discover products from talented creators.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/creations"
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold hover:bg-blue-500"
              >
                Discover Creations
              </Link>

              <Link
                href="/shop"
                className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:border-blue-500 hover:text-white"
              >
                Visit Shop
              </Link>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
