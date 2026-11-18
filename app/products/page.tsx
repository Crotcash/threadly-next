
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
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";

type Product = {
  id: string;
  creatorId: string;
  creatorName: string;
  name: string;
  description: string;
  category: string;
  price: number;
  imageUrl: string;
  available: boolean;
  createdAt?: string;
};

const emptyForm = {
  name: "",
  description: "",
  category: "Handmade",
  price: "",
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function money(value: number) {
  return `M ${value.toLocaleString("en-LS", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ProductsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState(emptyForm);
  const [image, setImage] = useState<File | null>(null);
  const [editingId, setEditingId] = useState("");
  const [existingImage, setExistingImage] = useState("");

  const [paymentProvider, setPaymentProvider] = useState("");
  const [paymentNumber, setPaymentNumber] = useState("");
  const [paymentName, setPaymentName] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  useEffect(() => {
    let unsubscribeProducts: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setChecking(true);

      if (!currentUser) {
        window.location.href = "/login";
        return;
      }

      try {
        const profileSnapshot = await getDoc(
          doc(db, "users", currentUser.uid)
        );

        if (!profileSnapshot.exists()) {
          window.location.href = "/login";
          return;
        }

        const role = String(profileSnapshot.data().role ?? "")
          .trim()
          .toLowerCase();

        if (role !== "creative" && role !== "creator") {
          window.location.href = "/home";
          return;
        }

        setUser(currentUser);

        const profile = profileSnapshot.data();

        setPaymentProvider(profile.mobileMoneyProvider ?? "");
        setPaymentNumber(profile.mobileMoneyNumber ?? "");
        setPaymentName(profile.mobileMoneyAccountName ?? "");
        setPaymentInstructions(profile.mobileMoneyInstructions ?? "");

        const productsQuery = query(
          collection(db, "products"),
          orderBy("createdAt", "desc")
        );

        unsubscribeProducts = onSnapshot(
          productsQuery,
          (snapshot) => {
            setProducts(
              snapshot.docs
                .map((item) => ({
                  id: item.id,
                  ...item.data(),
                }) as Product)
                .filter((item) => item.creatorId === currentUser.uid)
            );
          },
          (err) => {
            console.error(err);
            setError("Unable to load your products. Check Firestore rules.");
          }
        );
      } catch (err) {
        console.error(err);
        setError("Unable to verify your account.");
      } finally {
        setChecking(false);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProducts?.();
    };
  }, []);

  function handleImageChange(file?: File) {
    setError("");
    setImage(null);

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG or WEBP image.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setError("Product images must be 5 MB or smaller.");
      return;
    }

    setImage(file);
  }

  async function uploadImage(file: File) {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !preset) {
      throw new Error("Cloudinary is not configured in .env.local.");
    }

    const data = new FormData();
    data.append("file", file);
    data.append("upload_preset", preset);
    data.append("folder", "threadly/products");

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
      {
        method: "POST",
        body: data,
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error?.message || "Image upload failed.");
    }

    return result.secure_url as string;
  }

  function startEditing(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      description: product.description,
      category: product.category,
      price: String(product.price),
    });
    setExistingImage(product.imageUrl);
    setImage(null);
    setError("");
    setSuccess("");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId("");
    setForm(emptyForm);
    setExistingImage("");
    setImage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!user) return;

    const price = Number(form.price);

    if (!form.name.trim() || !form.description.trim()) {
      setError("Complete the product name and description.");
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setError("Enter a valid product price greater than zero.");
      return;
    }

    if (!editingId && !image) {
      setError("Please upload a product image.");
      return;
    }

    setLoading(true);

    try {
      let imageUrl = existingImage;

      if (image) {
        imageUrl = await uploadImage(image);
      }

      const profileSnapshot = await getDoc(
        doc(db, "users", user.uid)
      );

      const profile = profileSnapshot.data();

      const productData = {
        creatorId: user.uid,
        creatorName:
          profile?.displayName ||
          user.displayName ||
          "Threadly Creator",
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        price,
        imageUrl,
        available: editingId
          ? products.find((item) => item.id === editingId)?.available ?? true
          : true,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(
          doc(db, "products", editingId),
          productData
        );

        setSuccess("Product updated successfully.");
      } else {
        await addDoc(collection(db, "products"), {
          ...productData,
          createdAt: serverTimestamp(),
        });

        setSuccess("Your product has been published.");
      }

      resetForm();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to save product."
      );
    } finally {
      setLoading(false);
    }
  }

  async function toggleAvailability(product: Product) {
    try {
      await updateDoc(doc(db, "products", product.id), {
        available: !product.available,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
      setError("Unable to update product availability.");
    }
  }

  async function removeProduct(product: Product) {
    const confirmed = window.confirm(
      `Delete "${product.name}"? Existing orders will remain in your order history.`
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "products", product.id));
      setSuccess("Product deleted.");
    } catch (err) {
      console.error(err);
      setError("Unable to delete this product.");
    }
  }

  async function savePaymentDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) return;

    setSavingPayment(true);
    setError("");
    setSuccess("");

    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          mobileMoneyProvider: paymentProvider.trim(),
          mobileMoneyNumber: paymentNumber.trim(),
          mobileMoneyAccountName: paymentName.trim(),
          mobileMoneyInstructions: paymentInstructions.trim(),
        },
        { merge: true }
      );

      setSuccess("Mobile-money payment details saved.");
    } catch (err) {
      console.error(err);
      setError("Unable to save payment details.");
    } finally {
      setSavingPayment(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070B16] text-white">
        Loading products...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070B16] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/dashboard" className="text-sm text-blue-400">
              Creator dashboard
            </Link>
            <h1 className="mt-3 text-3xl font-bold">My products</h1>
            <p className="mt-2 text-slate-400">
              Manage the products customers can purchase from you.
            </p>
          </div>

          <Link
            href="/orders"
            className="rounded-xl border border-blue-500/40 px-5 py-3 text-sm font-semibold text-blue-300 hover:bg-blue-500/10"
          >
            Manage orders 
          </Link>
        </header>

        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            {error}
          </p>
        )}

        {success && (
          <p role="status" className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-green-300">
            {success}
          </p>
        )}

        <section className="mb-8 rounded-2xl border border-white/10 bg-[#0D1425] p-6">
          <h2 className="mb-5 text-xl font-bold">
            {editingId ? "Edit product" : "Add a product"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Product name
              </label>
              <input
                required
                maxLength={100}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-[#070B16] p-3 outline-none focus:border-blue-500"
                placeholder="e.g. Handmade crochet handbag"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Description
              </label>
              <textarea
                required
                maxLength={2000}
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-[#070B16] p-3 outline-none focus:border-blue-500"
                placeholder="Describe your product..."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Category
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-[#070B16] p-3"
                >
                  <option>Handmade</option>
                  <option>Fashion</option>
                  <option>Accessories</option>
                  <option>Art</option>
                  <option>Digital products</option>
                  <option>Home decor</option>
                  <option>Other</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Price (Maloti)
                </label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-[#070B16] p-3"
                  placeholder="250.00"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Product image
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => handleImageChange(e.target.files?.[0])}
                className="w-full rounded-xl border border-slate-700 bg-[#070B16] p-3 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                JPG, PNG or WEBP. Maximum 5 MB.
              </p>

              {(image || existingImage) && (
                <div className="mt-3">
                  {image ? (
                    <p className="text-sm text-blue-300">
                      New image selected: {image.name}
                    </p>
                  ) : (
                    <Image
                      src={existingImage}
                      alt="Current product"
                      width={180}
                      height={130}
                      className="rounded-xl object-cover"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                disabled={loading}
                className="rounded-xl bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50"
              >
                {loading
                  ? "Saving..."
                  : editingId
                    ? "Save changes"
                    : "Publish product"}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-white/15 px-6 py-3"
                >
                  Cancel editing
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="mb-8 rounded-2xl border border-blue-500/20 bg-[#0D1425] p-6">
          <h2 className="text-xl font-bold">Mobile-money payment details</h2>
          <p className="mb-5 mt-2 text-sm text-slate-400">
            Customers will use these details when paying for your products.
          </p>

          <form onSubmit={savePaymentDetails} className="space-y-4">
            <input
              required
              value={paymentProvider}
              onChange={(e) => setPaymentProvider(e.target.value)}
              placeholder="Mobile-money provider"
              className="w-full rounded-xl border border-slate-700 bg-[#070B16] p-3"
            />
            <input
              required
              value={paymentNumber}
              onChange={(e) => setPaymentNumber(e.target.value)}
              placeholder="Mobile-money number"
              className="w-full rounded-xl border border-slate-700 bg-[#070B16] p-3"
            />
            <input
              required
              value={paymentName}
              onChange={(e) => setPaymentName(e.target.value)}
              placeholder="Account holder name"
              className="w-full rounded-xl border border-slate-700 bg-[#070B16] p-3"
            />
            <textarea
              rows={3}
              value={paymentInstructions}
              onChange={(e) => setPaymentInstructions(e.target.value)}
              placeholder="Additional payment instructions (optional)"
              className="w-full rounded-xl border border-slate-700 bg-[#070B16] p-3"
            />
            <button
              disabled={savingPayment}
              className="rounded-xl border border-blue-500/40 px-5 py-3 font-semibold text-blue-300 hover:bg-blue-500/10"
            >
              {savingPayment ? "Saving..." : "Save payment details"}
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-bold">
            Your listings ({products.length})
          </h2>

          {products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-400">
              You haven&apos;t published any products yet.
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <article
                  key={product.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-[#0D1425]"
                >
                  {product.imageUrl && (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      width={600}
                      height={400}
                      className="h-52 w-full object-cover"
                    />
                  )}

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold">{product.name}</h3>
                      <span className={`rounded-full px-2 py-1 text-xs ${
                        product.available
                          ? "bg-green-500/10 text-green-300"
                          : "bg-red-500/10 text-red-300"
                      }`}>
                        {product.available ? "Available" : "Unavailable"}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-slate-400">
                      {product.description}
                    </p>

                    <p className="mt-4 text-xl font-bold text-blue-300">
                      {money(product.price)}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        onClick={() => startEditing(product)}
                        className="rounded-lg border border-white/15 px-3 py-2 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleAvailability(product)}
                        className="rounded-lg border border-blue-500/30 px-3 py-2 text-sm text-blue-300"
                      >
                        {product.available ? "Mark unavailable" : "Make available"}
                      </button>
                      <button
                        onClick={() => removeProduct(product)}
                        className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
