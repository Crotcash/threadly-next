
"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
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
  deliveryFee?: number;
  collectionInstructions?: string;
  createdAt?: {
    seconds?: number;
  };
};

type CheckoutDetails = {
  customerName: string;
  phone: string;
  fulfilment: "delivery" | "collection";
  deliveryAddress: string;
  quantity: number;
};

const formatMaloti = (amount: number) =>
  `M ${amount.toLocaleString("en-LS", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function ShopPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [checkout, setCheckout] = useState<CheckoutDetails>({
    customerName: "",
    phone: "",
    fulfilment: "collection",
    deliveryAddress: "",
    quantity: 1,
  });

  // AUTHENTICATION
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        router.replace("/login");
      }
    });

    return () => unsubscribeAuth();
  }, [router]);

  // LOAD CUSTOMER PROFILE AND PRODUCTS
  useEffect(() => {
    if (!user) return;

    let unsubscribeProducts: (() => void) | undefined;
    let cancelled = false;

    const loadProducts = async () => {
      try {
        const profile = await getDoc(doc(db, "users", user.uid));

        if (cancelled) return;

        if (!profile.exists()) {
          router.replace("/login");
          return;
        }

        const role = profile.data().role;

        if (role !== "customer") {
          router.replace(role === "creative" ? "/dashboard" : "/home");
          return;
        }

        unsubscribeProducts = onSnapshot(
          collection(db, "products"),
          (snapshot) => {
            const availableProducts = snapshot.docs
              .map((productDoc) => ({
                id: productDoc.id,
                ...productDoc.data(),
              })) as Product[];

            setProducts(
              availableProducts
                .filter((product) => product.available === true)
                .sort((a, b) => {
                  return (
                    (b.createdAt?.seconds ?? 0) -
                    (a.createdAt?.seconds ?? 0)
                  );
                })
            );

            setLoading(false);
            setError("");
          },
          (snapshotError) => {
            console.error("Shop products error:", snapshotError);
            setError(
              "Unable to load products. Please check your Firestore rules."
            );
            setLoading(false);
          }
        );
      } catch (err) {
        console.error("Shop loading error:", err);
        if (!cancelled) {
          setError("Unable to load the shop.");
          setLoading(false);
        }
      }
    };

    loadProducts();

    return () => {
      cancelled = true;
      unsubscribeProducts?.();
    };
  }, [user, router]);

  // PRODUCT CATEGORIES
  const categories = useMemo(() => {
    return [
      "All",
      ...Array.from(
        new Set(products.map((product) => product.category).filter(Boolean))
      ),
    ];
  }, [products]);

  // PRODUCT SEARCH AND FILTER
  const filteredProducts = useMemo(() => {
    const searchTerm = search.toLowerCase().trim();

    return products.filter((product) => {
      const matchesCategory =
        category === "All" || product.category === category;

      const matchesSearch =
        !searchTerm ||
        product.name?.toLowerCase().includes(searchTerm) ||
        product.description?.toLowerCase().includes(searchTerm) ||
        product.creatorName?.toLowerCase().includes(searchTerm);

      return matchesCategory && matchesSearch;
    });
  }, [products, search, category]);

  // CHECKOUT TOTALS
  const deliveryFee =
    selectedProduct && checkout.fulfilment === "delivery"
      ? Number(selectedProduct.deliveryFee ?? 0)
      : 0;

  const subtotal = selectedProduct
    ? selectedProduct.price * checkout.quantity
    : 0;

  const total = subtotal + deliveryFee;

  // OPEN CHECKOUT
  function openCheckout(product: Product) {
    setSelectedProduct(product);

    setCheckout({
      customerName: user?.displayName ?? "",
      phone: "",
      fulfilment: "collection",
      deliveryAddress: "",
      quantity: 1,
    });

    setCheckoutOpen(true);
  }

  // PLACE ORDER
  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user || !selectedProduct) return;

    if (!checkout.customerName.trim() || !checkout.phone.trim()) {
      alert("Please enter your name and contact number.");
      return;
    }

    if (
      checkout.fulfilment === "delivery" &&
      !checkout.deliveryAddress.trim()
    ) {
      alert("Please enter your delivery address.");
      return;
    }

    if (
      !Number.isInteger(checkout.quantity) ||
      checkout.quantity < 1 ||
      checkout.quantity > 100
    ) {
      alert("Please enter a quantity between 1 and 100.");
      return;
    }

    if (!selectedProduct.available) {
      alert("This product is no longer available.");
      setCheckoutOpen(false);
      return;
    }

    setSubmitting(true);

    let checkoutStage = "Starting checkout";

    try {
      // STEP 1: READ THE LATEST PRODUCT
      checkoutStage = "Reading product";

      const productRef = doc(db, "products", selectedProduct.id);
      const latestProduct = await getDoc(productRef);

      if (!latestProduct.exists()) {
        throw new Error("This product is no longer available.");
      }

      const currentProduct = latestProduct.data();

      if (
        currentProduct.available !== true ||
        currentProduct.creatorId !== selectedProduct.creatorId
      ) {
        throw new Error("This product is no longer available.");
      }

      // STEP 2: CALCULATE THE ORDER TOTAL
      checkoutStage = "Calculating order total";

      const currentPrice = Number(currentProduct.price);
      const currentDeliveryFee = Number(currentProduct.deliveryFee ?? 0);

      const currentFee =
        checkout.fulfilment === "delivery" ? currentDeliveryFee : 0;

      const currentSubtotal = currentPrice * checkout.quantity;
      const currentTotal = currentSubtotal + currentFee;

      if (
        !Number.isFinite(currentPrice) ||
        currentPrice <= 0 ||
        !Number.isFinite(currentDeliveryFee) ||
        currentDeliveryFee < 0 ||
        !Number.isFinite(currentTotal) ||
        currentTotal <= 0
      ) {
        throw new Error("The order total is invalid.");
      }

      // STEP 3: READ THE CUSTOMER PROFILE
      checkoutStage = "Reading customer profile";

      const customerProfile = await getDoc(doc(db, "users", user.uid));

      if (!customerProfile.exists()) {
        throw new Error("Your customer profile could not be found.");
      }

      if (customerProfile.data().role !== "customer") {
        throw new Error("Only customer accounts can place orders.");
      }

      // STEP 4: CREATE THE ORDER
      checkoutStage = "Creating Firestore order";

      const orderData = {
        customerId: user.uid,
        customerName: checkout.customerName.trim(),
        customerEmail: user.email ?? "",
        customerPhone: checkout.phone.trim(),

        creatorId: currentProduct.creatorId,
        creatorName: currentProduct.creatorName ?? "",

        productId: selectedProduct.id,
        productName: currentProduct.name,
        productImageUrl: currentProduct.imageUrl ?? "",
        quantity: checkout.quantity,

        unitPrice: currentPrice,
        subtotal: currentSubtotal,
        deliveryFee: currentFee,
        totalAmount: currentTotal,

        fulfilmentMethod: checkout.fulfilment,

        deliveryAddress:
          checkout.fulfilment === "delivery"
            ? checkout.deliveryAddress.trim()
            : "",

        collectionInstructions:
          checkout.fulfilment === "collection"
            ? currentProduct.collectionInstructions ?? ""
            : "",

        paymentMethod: "mobile_money",
        paymentStatus: "unpaid",
        paymentProofUrl: "",
        paymentSubmittedAt: null,

        status: "pending_payment",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const orderRef = await addDoc(collection(db, "orders"), orderData);

      console.log("Threadly order created:", orderRef.id);

      setCheckoutOpen(false);
      setSelectedProduct(null);

      alert(
        "Your order has been placed successfully! You can now view it and submit your payment confirmation."
      );

      router.push("/my-orders");

    } catch (err) {
      console.error("THREADLY CHECKOUT FAILURE:", {
        stage: checkoutStage,
        error: err,
      });

      const firebaseError = err as {
        code?: string;
        message?: string;
      };

      alert(
        `Checkout failed at: ${checkoutStage}\n\n` +
          `Error code: ${firebaseError.code ?? "Unknown"}\n\n` +
          `Message: ${
            firebaseError.message ?? "Please try again."
          }`
      );

    } finally {
      setSubmitting(false);
    }
  }

  // LOADING SCREEN
  if (!user || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050816] text-white">
        <p className="text-blue-300">Loading Threadly Shop...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      {/* HEADER */}
      <header className="border-b border-white/10 bg-[#070B16]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <div>
            <Link href="/home" className="text-2xl font-bold tracking-tight">
              Threadly<span className="text-blue-400">.</span>
            </Link>

            <p className="mt-1 text-xs text-slate-400">
              Discover products made by creatives
            </p>
          </div>

          <Link
            href="/my-orders"
            className="rounded-xl border border-blue-500/40 px-4 py-2 text-sm text-blue-300 transition hover:bg-blue-500/10"
          >
            My Orders
          </Link>
        </div>
      </header>

      {/* SHOP */}
      <section className="mx-auto max-w-7xl px-5 py-10">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-400">
            Threadly Marketplace
          </p>

          <h1 className="mt-3 text-3xl font-bold md:text-4xl">
            Find something you love.
          </h1>

          <p className="mt-3 max-w-2xl text-slate-400">
            Explore handmade products and creations from talented Threadly
            creators.
          </p>
        </div>

        {/* SEARCH AND CATEGORY */}
        <div className="mb-7 flex flex-col gap-4 md:flex-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products or creators..."
            className="w-full rounded-xl border border-white/10 bg-[#0B1224] px-4 py-3 text-white outline-none focus:border-blue-500"
          />

          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-xl border border-white/10 bg-[#0B1224] px-4 py-3 text-white outline-none focus:border-blue-500"
          >
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* EMPTY STATE */}
        {!error && filteredProducts.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#0B1224] px-6 py-16 text-center">
            <h2 className="text-xl font-semibold">No products found</h2>

            <p className="mt-2 text-sm text-slate-400">
              Try another search or check back later for new products.
            </p>
          </div>
        )}

        {/* PRODUCT GRID */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map((product) => (
            <article
              key={product.id}
              className="overflow-hidden rounded-2xl border border-white/10 bg-[#0B1224] transition hover:border-blue-500/50"
            >
              <div className="aspect-square bg-[#111B31]">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-500">
                    No product image
                  </div>
                )}
              </div>

              <div className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-blue-400">
                  {product.category || "Product"}
                </p>

                <h2 className="mt-2 text-lg font-semibold">
                  {product.name}
                </h2>

                <p className="mt-2 line-clamp-2 min-h-10 text-sm text-slate-400">
                  {product.description}
                </p>

                <p className="mt-4 text-xl font-bold text-white">
                  {formatMaloti(Number(product.price))}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  By {product.creatorName || "Threadly Creator"}
                </p>

                <button
                  type="button"
                  onClick={() => openCheckout(product)}
                  className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
                >
                  Order Product
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* CHECKOUT MODAL */}
      {checkoutOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4">
          <div className="my-6 w-full max-w-xl rounded-2xl border border-white/10 bg-[#0B1224] p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                  Checkout
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  {selectedProduct.name}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="rounded-lg px-3 py-1 text-xl text-slate-400 hover:bg-white/10"
                aria-label="Close checkout"
              >
                ×
              </button>
            </div>

            <form onSubmit={placeOrder} className="space-y-5">
              {/* CUSTOMER DETAILS */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Your name
                  </label>

                  <input
                    required
                    value={checkout.customerName}
                    onChange={(event) =>
                      setCheckout({
                        ...checkout,
                        customerName: event.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-white/10 bg-[#050816] px-4 py-3 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Contact number
                  </label>

                  <input
                    required
                    type="tel"
                    value={checkout.phone}
                    onChange={(event) =>
                      setCheckout({
                        ...checkout,
                        phone: event.target.value,
                      })
                    }
                    placeholder="+266..."
                    className="w-full rounded-xl border border-white/10 bg-[#050816] px-4 py-3 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* QUANTITY */}
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Quantity
                </label>

                <input
                  required
                  type="number"
                  min="1"
                  max="100"
                  value={checkout.quantity}
                  onChange={(event) =>
                    setCheckout({
                      ...checkout,
                      quantity: Math.max(
                        1,
                        Math.min(100, Number(event.target.value) || 1)
                      ),
                    })
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#050816] px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>

              {/* DELIVERY OR COLLECTION */}
              <div>
                <p className="mb-3 text-sm font-semibold text-slate-200">
                  How would you like to receive your order?
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setCheckout({
                        ...checkout,
                        fulfilment: "delivery",
                      })
                    }
                    className={`rounded-xl border p-4 text-left ${
                      checkout.fulfilment === "delivery"
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-white/10 bg-[#050816]"
                    }`}
                  >
                    <span className="block font-semibold">Delivery</span>

                    <span className="mt-1 block text-xs text-slate-400">
                      Have it delivered
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setCheckout({
                        ...checkout,
                        fulfilment: "collection",
                      })
                    }
                    className={`rounded-xl border p-4 text-left ${
                      checkout.fulfilment === "collection"
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-white/10 bg-[#050816]"
                    }`}
                  >
                    <span className="block font-semibold">Collection</span>

                    <span className="mt-1 block text-xs text-slate-400">
                      Collect from the creator
                    </span>
                  </button>
                </div>
              </div>

              {/* DELIVERY ADDRESS */}
              {checkout.fulfilment === "delivery" && (
                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Delivery address
                  </label>

                  <textarea
                    required
                    rows={3}
                    value={checkout.deliveryAddress}
                    onChange={(event) =>
                      setCheckout({
                        ...checkout,
                        deliveryAddress: event.target.value,
                      })
                    }
                    placeholder="Enter your location and delivery address..."
                    className="w-full rounded-xl border border-white/10 bg-[#050816] px-4 py-3 outline-none focus:border-blue-500"
                  />

                  <p className="mt-2 text-xs text-slate-400">
                    Delivery fee:{" "}
                    {formatMaloti(
                      Number(selectedProduct.deliveryFee ?? 0)
                    )}
                  </p>
                </div>
              )}

              {/* COLLECTION INSTRUCTIONS */}
              {checkout.fulfilment === "collection" && (
                <div className="rounded-xl border border-white/10 bg-[#050816] p-4">
                  <p className="text-sm font-semibold">Collection</p>

                  <p className="mt-1 text-sm text-slate-400">
                    {selectedProduct.collectionInstructions ||
                      "The creator will contact you with collection arrangements after your order is placed."}
                  </p>
                </div>
              )}

              {/* ORDER TOTAL */}
              <div className="rounded-xl border border-white/10 bg-[#050816] p-4">
                <div className="flex justify-between text-sm text-slate-400">
                  <span>Subtotal</span>
                  <span>{formatMaloti(subtotal)}</span>
                </div>

                <div className="mt-2 flex justify-between text-sm text-slate-400">
                  <span>Delivery fee</span>
                  <span>{formatMaloti(deliveryFee)}</span>
                </div>

                <div className="mt-4 flex justify-between border-t border-white/10 pt-4">
                  <span className="font-semibold">Total</span>

                  <span className="text-xl font-bold text-blue-300">
                    {formatMaloti(total)}
                  </span>
                </div>
              </div>

              {/* PAYMENT INFORMATION */}
              <p className="text-xs leading-5 text-slate-500">
                Payment will be made through mobile money. After placing your
                order, Threadly will show the creator&apos;s payment instructions.
                You will then upload your payment confirmation for verification.
              </p>

              {/* SUBMIT */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Placing order..." : "Place Order"}
              </button>

              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-300 hover:bg-white/5"
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
