
"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";

import { auth, db } from "../lib/firebase";

type CustomerOrder = {
  id: string;
  customerId: string;
  creatorName: string;
  productName: string;
  productImageUrl: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  fulfilmentMethod: string;
  deliveryAddress: string;
  collectionInstructions: string;
  paymentStatus: string;
  paymentProofUrl: string;
  status: string;
  createdAt?: Timestamp;
};

const CLOUDINARY_CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

const CLOUDINARY_UPLOAD_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

function formatMaloti(amount: number) {
  return `M ${Number(amount || 0).toLocaleString("en-LS", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function MyOrdersPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setUser(currentUser);
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!user) return;

    const ordersQuery = query(
      collection(db, "orders"),
      where("customerId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const results = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as CustomerOrder[];

        results.sort((a, b) => {
          const dateA = a.createdAt?.toMillis?.() ?? 0;
          const dateB = b.createdAt?.toMillis?.() ?? 0;
          return dateB - dateA;
        });

        setOrders(results);
        setLoading(false);
      },
      (err) => {
        console.error("Orders error:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  async function uploadPaymentProof(
    event: ChangeEvent<HTMLInputElement>,
    order: CustomerOrder
  ) {
    const file = event.target.files?.[0];

    if (!file || !user) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert("Upload a JPG, PNG or WEBP image.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("The image must be smaller than 5 MB.");
      event.target.value = "";
      return;
    }

    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
      alert("Cloudinary environment variables are missing.");
      event.target.value = "";
      return;
    }

    setUploadingId(order.id);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      formData.append("folder", "threadly/payment-confirmations");

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok || !result.secure_url) {
        throw new Error(
          result.error?.message || "Image upload failed."
        );
      }

      await updateDoc(doc(db, "orders", order.id), {
        paymentProofUrl: result.secure_url,
        paymentSubmittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      alert("Payment confirmation submitted successfully.");
    } catch (err) {
      console.error("Payment upload error:", err);
      setError(
        err instanceof Error ? err.message : "Payment upload failed."
      );
    } finally {
      setUploadingId("");
      event.target.value = "";
    }
  }

  if (!user || loading) {
    return (
      <main className="min-h-screen bg-[#050816] text-white flex items-center justify-center">
        Loading your orders...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white px-5 py-10">
      <div className="max-w-5xl mx-auto">

        <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
          <div>
            <p className="text-blue-400 text-sm mb-2">
              CUSTOMER ACCOUNT
            </p>
            <h1 className="text-3xl font-bold">My Orders</h1>
            <p className="text-gray-400 mt-2">
              Track your purchases and submit payment confirmation.
            </p>
          </div>

          <Link
            href="/shop"
            className="bg-blue-600 hover:bg-blue-500 px-5 py-3 rounded-xl"
          >
            Continue Shopping
          </Link>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-4 rounded-xl mb-6">
            {error}
          </div>
        )}

        {orders.length === 0 ? (
          <div className="bg-[#0B1224] border border-white/10 rounded-2xl p-10 text-center">
            <h2 className="text-xl font-bold mb-2">
              No orders yet
            </h2>
            <p className="text-gray-400 mb-5">
              Your purchases will appear here.
            </p>
            <Link
              href="/shop"
              className="bg-blue-600 px-5 py-3 rounded-xl inline-block"
            >
              Explore Shop
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => (
              <article
                key={order.id}
                className="bg-[#0B1224] border border-white/10 rounded-2xl p-5"
              >
                <div className="flex flex-col sm:flex-row gap-5">
                  {order.productImageUrl && (
                    <img
                      src={order.productImageUrl}
                      alt={order.productName}
                      className="w-full sm:w-36 h-36 object-cover rounded-xl"
                    />
                  )}

                  <div className="flex-1">
                    <h2 className="text-xl font-bold">
                      {order.productName}
                    </h2>

                    <p className="text-gray-400 text-sm mt-1">
                      By {order.creatorName}
                    </p>

                    <p className="mt-3 text-sm">
                      Quantity: {order.quantity}
                    </p>

                    <p className="text-blue-400 font-bold mt-2">
                      {formatMaloti(order.totalAmount)}
                    </p>

                    <p className="text-gray-400 text-sm mt-2">
                      Fulfilment: {order.fulfilmentMethod}
                    </p>

                    {order.fulfilmentMethod === "delivery" && (
                      <p className="text-gray-400 text-sm">
                        Address: {order.deliveryAddress}
                      </p>
                    )}

                    {order.fulfilmentMethod === "collection" && (
                      <p className="text-gray-400 text-sm">
                        {order.collectionInstructions}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-3 mt-4 text-sm">
                      <span className="bg-blue-500/10 text-blue-300 px-3 py-1 rounded-full">
                        Order: {order.status?.replaceAll("_", " ")}
                      </span>

                      <span className="bg-yellow-500/10 text-yellow-300 px-3 py-1 rounded-full">
                        Payment: {order.paymentStatus}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/10 mt-5 pt-5">
                  {order.paymentProofUrl ? (
                    <div>
                      <p className="text-green-400 font-semibold">
                        Payment confirmation submitted
                      </p>

                      <a
                        href={order.paymentProofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 underline text-sm mt-2 inline-block"
                      >
                        View confirmation
                      </a>

                      {order.paymentStatus === "unpaid" && (
                        <p className="text-yellow-400 text-sm mt-2">
                          Awaiting creator verification.
                        </p>
                      )}
                    </div>
                  ) : order.paymentStatus === "unpaid" &&
                    order.status === "pending_payment" ? (
                    <div>
                      <h3 className="font-semibold mb-2">
                        Upload payment confirmation
                      </h3>

                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploadingId === order.id}
                        onChange={(event) =>
                          uploadPaymentProof(event, order)
                        }
                        className="block w-full text-sm text-gray-400 file:bg-blue-600 file:text-white file:border-0 file:rounded-lg file:px-4 file:py-2"
                      />

                      {uploadingId === order.id && (
                        <p className="text-blue-400 mt-2 text-sm">
                          Uploading confirmation...
                        </p>
                      )}
                    </div>
                  ) : order.paymentStatus === "paid" ? (
                    <p className="text-green-400">
                      Payment confirmed.
                    </p>
                  ) : order.paymentStatus === "rejected" ? (
                    <p className="text-red-400">
                      Payment confirmation rejected. Please contact the creator.
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
