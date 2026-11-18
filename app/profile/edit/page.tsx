
"use client";

import {
  useEffect,
  useState,
  type FormEvent,
  type ChangeEvent,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "@/app/lib/firebase";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

type ProfileData = {
  displayName?: string;
  username?: string;
  bio?: string;
  photoURL?: string;
  role?: string;
};

export default function EditProfilePage() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [photoURL, setPhotoURL] = useState("");

  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [removePhoto, setRemovePhoto] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // LOAD PROFILE AND VERIFY ACCOUNT
  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const snapshot = await getDoc(
          doc(db, "users", user.uid)
        );

        if (cancelled) return;

        if (!snapshot.exists()) {
          router.replace("/login");
          return;
        }

        const profile = snapshot.data() as ProfileData;

        const role = String(profile.role ?? "")
          .trim()
          .toLowerCase();

        // Allow both customer and creative accounts.
        if (
          role !== "customer" &&
          role !== "creative" &&
          role !== "creator"
        ) {
          router.replace("/login");
          return;
        }

        setDisplayName(profile.displayName ?? "");
        setUsername(profile.username ?? "");
        setBio(profile.bio ?? "");
        setPhotoURL(profile.photoURL ?? "");

      } catch (err) {
        console.error("Profile loading failed:", err);

        if (!cancelled) {
          setError("Could not load your profile. Please try again.");
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

  // CREATE IMAGE PREVIEW
  useEffect(() => {
    if (!image) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview("");
      return;
    }

    const objectUrl = URL.createObjectURL(image);

    setPreview(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

  // SELECT PROFILE PICTURE
  function handleImageChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const selected = event.target.files?.[0];

    setError("");

    if (!selected) return;

    if (!ALLOWED_TYPES.includes(selected.type)) {
      setError("Choose a JPG, PNG, WEBP or GIF image.");
      event.target.value = "";
      return;
    }

    if (selected.size > MAX_FILE_SIZE) {
      setError("Your profile picture must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }

    setImage(selected);
    setRemovePhoto(false);
  }

  // REMOVE PROFILE PICTURE
  function handleRemovePhoto() {
    setImage(null);
    setPreview("");
    setRemovePhoto(true);

    const input = document.getElementById(
      "profile-picture"
    ) as HTMLInputElement | null;

    if (input) input.value = "";
  }

  // SAVE PROFILE
  async function handleSave(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (saving) return;

    setError("");

    const user = auth.currentUser;

    if (!user) {
      router.replace("/login");
      return;
    }

    const cleanName = displayName.trim();
    const cleanUsername = username.trim().replace(/^@/, "");
    const cleanBio = bio.trim();

    if (!cleanName) {
      setError("Please enter your display name.");
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(cleanUsername)) {
      setError(
        "Username must be 3–20 characters and contain only letters, numbers or underscores."
      );
      return;
    }

    if (cleanBio.length > 300) {
      setError("Your bio cannot exceed 300 characters.");
      return;
    }

    setSaving(true);

    try {
      const profileRef = doc(db, "users", user.uid);
      const snapshot = await getDoc(profileRef);

      if (!snapshot.exists()) {
        throw new Error(
          "Your Threadly profile could not be found."
        );
      }

      const currentProfile = snapshot.data();

      const role = String(currentProfile.role ?? "")
        .trim()
        .toLowerCase();

      // Both account types can edit their own profile.
      if (
        role !== "customer" &&
        role !== "creative" &&
        role !== "creator"
      ) {
        throw new Error(
          "Your account is not authorised to edit this profile."
        );
      }

      let updatedPhotoURL = photoURL;

      // REMOVE EXISTING PROFILE PICTURE
      if (removePhoto) {
        updatedPhotoURL = "";
      }

      // UPLOAD NEW PROFILE PICTURE
      if (image) {
        const cloudName =
          process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

        const uploadPreset =
          process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

        if (!cloudName || !uploadPreset) {
          throw new Error(
            "Cloudinary is not configured. Check your .env.local file."
          );
        }

        const formData = new FormData();

        formData.append("file", image);
        formData.append("upload_preset", uploadPreset);
        formData.append("folder", "threadly/profiles");

        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${encodeURIComponent(
            cloudName
          )}/image/upload`,
          {
            method: "POST",
            body: formData,
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error?.message ||
              "Profile picture upload failed."
          );
        }

        if (!result.secure_url) {
          throw new Error(
            "Cloudinary did not return a valid image URL."
          );
        }

        updatedPhotoURL = result.secure_url;
      }

      // UPDATE FIRESTORE PROFILE
      await updateDoc(profileRef, {
        displayName: cleanName,
        username: cleanUsername,
        bio: cleanBio,
        photoURL: updatedPhotoURL,
      });

      // UPDATE FIREBASE AUTH PROFILE
      await updateProfile(user, {
        displayName: cleanName,
        photoURL: updatedPhotoURL || null,
      });

      setPhotoURL(updatedPhotoURL);
      setImage(null);
      setRemovePhoto(false);

      router.push("/profile");
      router.refresh();

    } catch (err) {
      console.error("Profile update failed:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not save your profile. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  // LOADING SCREEN
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070B16] text-slate-300">
        Loading your profile...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070B16] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-2xl">

        <Link
          href="/profile"
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Back to My Profile
        </Link>

        {/* PAGE HEADER */}
        <div className="mb-8 mt-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">
            Your Threadly profile
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Edit Profile
          </h1>

          <p className="mt-2 text-slate-400">
            Update your personal information and profile picture.
          </p>
        </div>

        {/* EDIT FORM */}
        <form
          onSubmit={handleSave}
          className="space-y-6 rounded-2xl border border-blue-900/50 bg-[#0B1224] p-5 sm:p-8"
        >

          {/* PROFILE PICTURE */}
          <div>
            <label className="mb-3 block text-sm font-medium">
              Profile picture
            </label>

            <div className="flex flex-wrap items-center gap-5">

              {preview || (!removePhoto && photoURL) ? (
                <Image
                  src={preview || photoURL}
                  alt="Profile preview"
                  width={96}
                  height={96}
                  unoptimized
                  className="h-24 w-24 rounded-full border-2 border-blue-500 object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-600 text-3xl font-bold">
                  {displayName.charAt(0).toUpperCase() || "C"}
                </div>
              )}

              <div className="flex-1">

                <input
                  id="profile-picture"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleImageChange}
                  disabled={saving}
                  className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:font-medium file:text-white"
                />

                <p className="mt-2 text-xs text-slate-500">
                  JPG, PNG, WEBP or GIF. Maximum 5 MB.
                </p>

                {(photoURL || image) && !removePhoto && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={saving}
                    className="mt-2 text-sm text-red-400 hover:text-red-300"
                  >
                    Remove profile picture
                  </button>
                )}

                {image && (
                  <button
                    type="button"
                    onClick={() => setImage(null)}
                    disabled={saving}
                    className="ml-4 mt-2 text-sm text-slate-400 hover:text-white"
                  >
                    Cancel image change
                  </button>
                )}

                {removePhoto && (
                  <button
                    type="button"
                    onClick={() => setRemovePhoto(false)}
                    className="mt-2 text-sm text-blue-400 hover:text-blue-300"
                  >
                    Undo removal
                  </button>
                )}

              </div>
            </div>
          </div>

          {/* DISPLAY NAME */}
          <div>
            <label
              htmlFor="displayName"
              className="mb-2 block text-sm font-medium"
            >
              Display name
            </label>

            <input
              id="displayName"
              value={displayName}
              onChange={(event) =>
                setDisplayName(event.target.value)
              }
              maxLength={60}
              required
              disabled={saving}
              placeholder="Your name or creative brand"
              className="w-full rounded-lg border border-slate-700 bg-[#070B16] px-4 py-3 outline-none focus:border-blue-500"
            />
          </div>

          {/* USERNAME */}
          <div>
            <label
              htmlFor="username"
              className="mb-2 block text-sm font-medium"
            >
              Username
            </label>

            <div className="flex items-center rounded-lg border border-slate-700 bg-[#070B16] focus-within:border-blue-500">
              <span className="pl-4 text-slate-400">@</span>

              <input
                id="username"
                value={username}
                onChange={(event) =>
                  setUsername(event.target.value)
                }
                maxLength={20}
                required
                disabled={saving}
                placeholder="yourusername"
                className="w-full bg-transparent px-2 py-3 outline-none"
              />
            </div>

            <p className="mt-2 text-xs text-slate-500">
              3–20 letters, numbers or underscores.
            </p>
          </div>

          {/* BIO */}
          <div>
            <label
              htmlFor="bio"
              className="mb-2 block text-sm font-medium"
            >
              Bio
            </label>

            <textarea
              id="bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              maxLength={300}
              rows={4}
              disabled={saving}
              placeholder="Tell us about yourself, your interests and your creative journey..."
              className="w-full resize-y rounded-lg border border-slate-700 bg-[#070B16] px-4 py-3 outline-none focus:border-blue-500"
            />

            <p className="mt-1 text-right text-xs text-slate-500">
              {bio.length}/300
            </p>
          </div>

          {/* ERROR MESSAGE */}
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
            >
              {error}
            </p>
          )}

          {/* FORM BUTTONS */}
          <div className="flex flex-wrap gap-3 pt-2">

            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-blue-600 px-5 py-3 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving changes..." : "Save Changes"}
            </button>

            <Link
              href="/profile"
              className="rounded-lg border border-slate-700 px-5 py-3 text-center font-medium hover:bg-slate-800"
            >
              Cancel
            </Link>

          </div>
        </form>
      </div>
    </main>
  );
}
