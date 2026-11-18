
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../../lib/firebase";

const CATEGORIES = [
  "Finished work",
  "Work in progress",
  "Tutorial",
  "Inspiration",
  "Product announcement",
] as const;

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

type CloudinaryUploadResponse = {
  secure_url: string;
  public_id: string;
  resource_type: string;
};

export default function PostForm() {
  const [caption, setCaption] = useState("");
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]>("Finished work");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const previewUrl = useRef("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    return () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  function clearPreview() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = "";
    setPreview("");
  }

  function handleImageChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFile = event.target.files?.[0];

    setError("");
    setSuccess("");

    if (!selectedFile) {
      clearPreview();
      setImage(null);
      return;
    }

    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      setError("Choose a JPG, PNG, WEBP or GIF image.");
      event.target.value = "";
      clearPreview();
      setImage(null);
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError("Your image must be 5 MB or smaller.");
      event.target.value = "";
      clearPreview();
      setImage(null);
      return;
    }

    clearPreview();
    previewUrl.current = URL.createObjectURL(selectedFile);
    setPreview(previewUrl.current);
    setImage(selectedFile);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const user = auth.currentUser;

    if (!user) {
      setError("Please sign in before creating a post.");
      return;
    }

    if (!image) {
      setError("Please select an image to upload.");
      return;
    }

    if (!caption.trim()) {
      setError("Please write a caption for your post.");
      return;
    }

    if (caption.trim().length > 2000) {
      setError("Your caption cannot exceed 2,000 characters.");
      return;
    }

    const cloudName =
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset =
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      setError(
        "Cloudinary is not configured. Check your .env.local file.",
      );
      return;
    }

    setLoading(true);

    try {
      // Confirm the user's Threadly role in Firestore.
      const profileSnapshot = await getDoc(
        doc(db, "users", user.uid),
      );

      if (!profileSnapshot.exists()) {
        setError("Your Threadly profile was not found.");
        return;
      }

      const profile = profileSnapshot.data();
      const role = String(profile.role ?? "")
        .trim()
        .toLowerCase();

      if (role !== "creator" && role !== "creative") {
        setError("Only creators can publish community posts.");
        return;
      }

      // Upload the selected file directly to Cloudinary.
      const formData = new FormData();
      formData.append("file", image);
      formData.append("upload_preset", uploadPreset);
      formData.append("folder", "threadly/posts");

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(
          cloudName,
        )}/image/upload`,
        {
          method: "POST",
          body: formData,
        },
      );

      const uploadResult = await uploadResponse.json();

      if (!uploadResponse.ok) {
        throw new Error(
          uploadResult.error?.message ||
            "Image upload failed. Check your Cloudinary settings.",
        );
      }

      const uploadedImage =
        uploadResult as CloudinaryUploadResponse;

      // Save the image URL and post details in Firestore.
      await addDoc(collection(db, "posts"), {
        creatorId: user.uid,
        creatorName:
          profile.displayName ||
          profile.name ||
          user.displayName ||
          "Threadly Creator",
        caption: caption.trim(),
        category,
        imageUrl: uploadedImage.secure_url,
        imagePath: uploadedImage.public_id,
        createdAt: serverTimestamp(),
      });

      setCaption("");
      setCategory("Finished work");
      setImage(null);

      const fileInput = document.getElementById(
        "post-image",
      ) as HTMLInputElement | null;

      if (fileInput) fileInput.value = "";

      setSuccess("Your post has been published!");
    } catch (err) {
      console.error("Post creation failed:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while publishing your post.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-8 rounded-2xl border border-blue-900/50 bg-[#0B1224] p-5 text-white shadow-lg">
      <h2 className="mb-1 text-xl font-bold">
        Share your creativity
      </h2>

      <p className="mb-5 text-sm text-slate-400">
        Show the Threadly community what you are creating.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="post-image"
            className="mb-2 block text-sm font-medium"
          >
            Upload a picture
          </label>

          <input
            id="post-image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleImageChange}
            disabled={loading}
            className="block w-full rounded-lg border border-slate-700 bg-[#070B16] p-3 text-sm text-slate-300 file:mr-4 file:rounded-md file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:font-medium file:text-white"
          />

          <p className="mt-1 text-xs text-slate-500">
            JPG, PNG, WEBP or GIF. Maximum size: 5 MB.
          </p>
        </div>

        {preview && (
          <div className="space-y-2">
            <Image
              src={preview}
              alt="Preview of your selected post"
              width={800}
              height={320}
              className="max-h-80 w-full rounded-xl border border-slate-700 object-contain"
            />

            <button
              type="button"
              onClick={() => {
                setImage(null);
                const input = document.getElementById(
                  "post-image",
                ) as HTMLInputElement | null;
                if (input) input.value = "";
              }}
              disabled={loading}
              className="text-sm text-red-400 hover:text-red-300"
            >
              Remove picture
            </button>
          </div>
        )}

        <div>
          <label
            htmlFor="post-caption"
            className="mb-2 block text-sm font-medium"
          >
            Caption
          </label>

          <textarea
            id="post-caption"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Tell us about your creation..."
            maxLength={2000}
            rows={4}
            required
            disabled={loading}
            className="w-full resize-y rounded-lg border border-slate-700 bg-[#070B16] p-3 text-sm text-white outline-none transition focus:border-blue-500"
          />

          <p className="mt-1 text-right text-xs text-slate-500">
            {caption.length}/2000
          </p>
        </div>

        <div>
          <label
            htmlFor="post-category"
            className="mb-2 block text-sm font-medium"
          >
            Category
          </label>

          <select
            id="post-category"
            value={category}
            onChange={(event) =>
              setCategory(
                event.target.value as (typeof CATEGORIES)[number],
              )
            }
            disabled={loading}
            className="w-full rounded-lg border border-slate-700 bg-[#070B16] p-3 text-sm text-white outline-none focus:border-blue-500"
          >
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        {success && (
          <p
            role="status"
            className="rounded-lg border border-green-900 bg-green-950/40 p-3 text-sm text-green-300"
          >
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Uploading and publishing..." : "Publish post"}
        </button>
      </form>
    </section>
  );
}
