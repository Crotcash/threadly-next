"use client";

import { useEffect, useState } from "react";
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
} from "firebase/firestore";

import { auth, db } from "../lib/firebase";

type CreatorOrder = {
  id: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  productName?: string;
  productImageUrl?: string;
  quantity?: number;
  unitPrice?: number;
  subtotal?: number;
  deliveryFee?: number;
  totalAmount?: number;
  fulfilmentMethod?: string;
  deliveryAddress?: string;
  collectionInstructions?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  paymentProofUrl?: string;
  status?: string;
  createdAt?: {
    toDate?: () => Date;
  };
};

export default function CreatorOrdersPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<CreatorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setUser(currentUser);
    });

    return () => unsubscribeAuth();
  }, [router]);

  useEffect(() => {
    if (!user) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");

    const ordersQuery = query(
      collection(db, "orders"),
      where("creatorId", "==", user.uid)
    );

    const unsubscribeOrders = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const fetchedOrders = snapshot.docs.map((orderDoc) => ({
          id: orderDoc.id,
          ...orderDoc.data(),
        })) as CreatorOrder[];

        fetchedOrders.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.()?.getTime() || 0;
          const dateB = b.createdAt?.toDate?.()?.getTime() || 0;
          return dateB - dateA;
        });

        setOrders(fetchedOrders);
        setLoading(false);
      },
      (snapshotError) => {
        console.error("Orders loading error:", snapshotError);
        setError(snapshotError.message);
        setLoading(false);
      }
    );

    return () => unsubscribeOrders();
  }, [user]);

  async function updateOrder(
    orderId: string,
    changes: {
      paymentStatus?: string;
      status?: string;
    }
  ) {
    if (!user || updatingId) return;

    try {
      setUpdatingId(orderId);
      setError("");

      await updateDoc(doc(db, "orders", orderId), {
        ...changes,
        updatedAt: serverTimestamp(),
      });
    } catch (updateError) {
      console.error("Order update error:", updateError);
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update this order."
      );
    } finally {
      setUpdatingId("");
    }
  }

  function formatMoney(value?: number) {
    return `M ${(Number(value) || 0).toLocaleString("en-LS", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatDate(order: CreatorOrder) {
    const date = order.createdAt?.toDate?.();
    return date ? date.toLocaleString() : "Date unavailable";
  }

  const awaitingPayment = orders.filter(
    (order) => order.paymentStatus === "unpaid"
  ).length;

  const processingOrders = orders.filter(
    (order) => order.status === "processing"
  ).length;

  const completedOrders = orders.filter(
    (order) => order.status === "completed"
  ).length;

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-sm text-blue-400">Creator dashboard</p>
            <h1 className="text-3xl font-bold">Orders</h1>
            <p className="mt-2 text-sm text-gray-400">
              Manage customer orders and mobile payment confirmations.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="rounded-lg border border-blue-500/40 px-4 py-2 text-sm text-blue-300 transition hover:bg-blue-500/10"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total orders", value: orders.length },
            { label: "Awaiting payment", value: awaitingPayment },
            { label: "Processing", value: processingOrders },
            { label: "Completed", value: completedOrders },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-white/10 bg-[#0B1224] p-5"
            >
              <p className="text-sm text-gray-400">{item.label}</p>
              <p className="mt-2 text-3xl font-bold text-blue-400">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-white/10 bg-[#0B1224] p-8 text-center text-gray-400">
            Loading orders...
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#0B1224] p-10 text-center">
            <h2 className="text-xl font-semibold">No orders yet</h2>
            <p className="mt-2 text-sm text-gray-400">
              Customer orders for your products will appear here.
            </p>
            <Link
              href="/products"
              className="mt-5 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold hover:bg-blue-500"
            >
              Manage products
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {orders.map((order) => (
              <section
                key={order.id}
                className="rounded-xl border border-white/10 bg-[#0B1224] p-5"
              >
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {order.productName || "Product"}
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                      Order ID: {order.id}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatDate(order)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-blue-500/10 px-3 py-1 text-blue-300">
                      {order.status || "pending_payment"}
                    </span>
                    <span className="rounded-full bg-purple-500/10 px-3 py-1 text-purple-300">
                      Payment: {order.paymentStatus || "unpaid"}
                    </span>
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    {order.productImageUrl && (
                      <img
                        src={order.productImageUrl}
                        alt={order.productName || "Product"}
                        className="mb-4 h-48 w-full rounded-lg object-cover"
                      />
                    )}

                    <h3 className="mb-2 font-semibold">Order details</h3>
                    <div className="space-y-1 text-sm text-gray-300">
                      <p>Quantity: {order.quantity || 1}</p>
                      <p>Unit price: {formatMoney(order.unitPrice)}</p>
                      <p>Subtotal: {formatMoney(order.subtotal)}</p>
                      <p>Delivery fee: {formatMoney(order.deliveryFee)}</p>
                      <p className="font-semibold text-white">
                        Total: {formatMoney(order.totalAmount)}
                      </p>
                    </div>

                    <div className="mt-4 text-sm text-gray-300">
                      <p>
                        Fulfilment:{" "}
                        <span className="capitalize">
                          {order.fulfilmentMethod || "Not specified"}
                        </span>
                      </p>
                      {order.fulfilmentMethod === "delivery" && (
                        <p className="mt-1">
                          Delivery address: {order.deliveryAddress || "Not provided"}
                        </p>
                      )}
                      {order.fulfilmentMethod === "collection" && (
                        <p className="mt-1">
                          Collection: {order.collectionInstructions || "Contact customer"}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 font-semibold">Customer</h3>
                    <div className="space-y-1 text-sm text-gray-300">
                      <p>{order.customerName || "Customer"}</p>
                      <p>{order.customerEmail || "No email provided"}</p>
                      <p>{order.customerPhone || "No phone provided"}</p>
                    </div>

                    <div className="mt-5">
                      <h3 className="mb-2 font-semibold">
                        Mobile payment confirmation
                      </h3>

                      {order.paymentProofUrl ? (
                        <a
                          href={order.paymentProofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block rounded-lg border border-blue-500/40 px-4 py-2 text-sm text-blue-300 hover:bg-blue-500/10"
                        >
                          View payment proof
                        </a>
                      ) : (
                        <p className="text-sm text-gray-500">
                          Customer has not uploaded payment proof.
                        </p>
                      )}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {order.paymentStatus === "unpaid" &&
                        order.paymentProofUrl && (
                          <>
                            <button
                              disabled={updatingId === order.id}
                              onClick={() =>
                                updateOrder(order.id, {
                                  paymentStatus: "paid",
                                })
                              }
                              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold hover:bg-green-500 disabled:opacity-50"
                            >
                              {updatingId === order.id
                                ? "Updating..."
                                : "Confirm payment"}
                            </button>

                            <button
                              disabled={updatingId === order.id}
                              onClick={() =>
                                updateOrder(order.id, {
                                  paymentStatus: "rejected",
                                })
                              }
                              className="rounded-lg bg-red-600/80 px-4 py-2 text-sm font-semibold hover:bg-red-500 disabled:opacity-50"
                            >
                              Reject payment
                            </button>
                          </>
                        )}

                      {order.paymentStatus === "paid" &&
                        order.status !== "completed" && (
                          <>
                            {order.status !== "processing" && (
                              <button
                                disabled={updatingId === order.id}
                                onClick={() =>
                                  updateOrder(order.id, {
                                    status: "processing",
                                  })
                                }
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
                              >
                                Start processing
                              </button>
                            )}

                            <button
                              disabled={updatingId === order.id}
                              onClick={() =>
                                updateOrder(order.id, {
                                  status: "completed",
                                })
                              }
                              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold hover:bg-green-500 disabled:opacity-50"
                            >
                              Mark completed
                            </button>
                          </>
                        )}
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}