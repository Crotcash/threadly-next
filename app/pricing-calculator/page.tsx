
"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
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
} from "firebase/firestore";

import { auth, db } from "../lib/firebase";

type PriceForm = {
  productName: string;
  materialsCost: string;
  labourHours: string;
  hourlyRate: string;
  otherExpenses: string;
  profitMargin: string;
};

type SavedPrice = {
  id: string;
  productName: string;
  materialsCost: number;
  labourHours: number;
  hourlyRate: number;
  otherExpenses: number;
  profitMargin: number;
  labourCost: number;
  totalCost: number;
  sellingPrice: number;
  expectedProfit: number;
  createdAt?: {
    toDate?: () => Date;
  } | null;
};

const initialForm: PriceForm = {
  productName: "",
  materialsCost: "",
  labourHours: "",
  hourlyRate: "",
  otherExpenses: "0",
  profitMargin: "30",
};

function money(value: number) {
  return `M ${value.toFixed(2)}`;
}

export default function PricingCalculatorPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isCreative, setIsCreative] = useState(false);

  const [form, setForm] = useState<PriceForm>(initialForm);
  const [hasCalculated, setHasCalculated] = useState(false);

  const [savedPrices, setSavedPrices] = useState<SavedPrice[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(true);

  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Authenticate user and verify creator role.
  useEffect(() => {
    let unsubscribePrices: (() => void) | null = null;
    let active = true;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (unsubscribePrices) {
        unsubscribePrices();
        unsubscribePrices = null;
      }

      if (!active) return;

      setUser(currentUser);
      setAuthLoading(true);
      setIsCreative(false);
      setSavedPrices([]);

      if (!currentUser) {
        setAuthLoading(false);
        setLoadingPrices(false);
        return;
      }

      try {
        const profileRef = doc(db, "users", currentUser.uid);
        const profileSnap = await getDoc(profileRef);

        if (!active) return;

        const role = profileSnap.exists()
          ? profileSnap.data().role
          : null;

        if (role !== "creative") {
          setIsCreative(false);
          setAuthLoading(false);
          setLoadingPrices(false);
          return;
        }

        setIsCreative(true);

        const pricesRef = collection(
          db,
          "users",
          currentUser.uid,
          "savedPrices"
        );

        const pricesQuery = query(
          pricesRef,
          orderBy("createdAt", "desc")
        );

        unsubscribePrices = onSnapshot(
          pricesQuery,
          (snapshot) => {
            if (!active) return;

            const prices = snapshot.docs.map((priceDoc) => ({
              id: priceDoc.id,
              ...priceDoc.data(),
            })) as SavedPrice[];

            setSavedPrices(prices);
            setLoadingPrices(false);
          },
          (snapshotError) => {
            console.error("Saved prices error:", snapshotError);
            setError("Unable to load your saved prices.");
            setLoadingPrices(false);
          }
        );

        setAuthLoading(false);
      } catch (err) {
        console.error("Profile verification error:", err);
        if (active) {
          setError("Unable to verify your Threadly account.");
          setAuthLoading(false);
          setLoadingPrices(false);
        }
      }
    });

    return () => {
      active = false;
      unsubscribeAuth();
      if (unsubscribePrices) unsubscribePrices();
    };
  }, []);

  // Convert form values into numbers and calculate the price.
  const result = useMemo(() => {
    const materials = Number(form.materialsCost);
    const hours = Number(form.labourHours);
    const rate = Number(form.hourlyRate);
    const expenses = Number(form.otherExpenses);
    const margin = Number(form.profitMargin);

    const validNumbers = [
      materials,
      hours,
      rate,
      expenses,
      margin,
    ].every(Number.isFinite);

    const valid =
      validNumbers &&
      materials >= 0 &&
      hours >= 0 &&
      rate >= 0 &&
      expenses >= 0 &&
      margin >= 0 &&
      margin < 100;

    if (!valid) return null;

    const labourCost = hours * rate;
    const totalCost = materials + labourCost + expenses;

    // True profit margin:
    // Selling price = total cost / (1 - margin).
    const sellingPrice =
      margin === 0 ? totalCost : totalCost / (1 - margin / 100);

    const expectedProfit = sellingPrice - totalCost;

    return {
      materialsCost: materials,
      labourHours: hours,
      hourlyRate: rate,
      otherExpenses: expenses,
      profitMargin: margin,
      labourCost,
      totalCost,
      sellingPrice,
      expectedProfit,
    };
  }, [form]);

  function updateField(field: keyof PriceForm, value: string) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));

    setHasCalculated(false);
    setEditingId(null);
    setMessage("");
    setError("");
  }

  function handleCalculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!form.productName.trim()) {
      setError("Please enter a product or project name.");
      return;
    }

    if (!result) {
      setError(
        "Please enter valid costs and a profit margin between 0% and 99.99%."
      );
      return;
    }

    setHasCalculated(true);
    setMessage("Your price has been calculated successfully.");
  }

  async function handleSave() {
    if (!user || !isCreative || !result || !hasCalculated) return;

    if (!form.productName.trim()) {
      setError("Please enter a product name before saving.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const priceData = {
        productName: form.productName.trim(),
        ...result,
        updatedAt: serverTimestamp(),
      };

      const pricesRef = collection(
        db,
        "users",
        user.uid,
        "savedPrices"
      );

      if (editingId) {
        await updateDoc(
          doc(db, "users", user.uid, "savedPrices", editingId),
          priceData
        );

        setMessage("Your saved price has been updated.");
      } else {
        await addDoc(pricesRef, {
          ...priceData,
          createdAt: serverTimestamp(),
        });

        setMessage("Your price has been saved to Threadly!");
      }

      setEditingId(null);
    } catch (err) {
      console.error("Saving price error:", err);
      setError("Could not save your price. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function revisitPrice(price: SavedPrice) {
    setForm({
      productName: price.productName,
      materialsCost: String(price.materialsCost),
      labourHours: String(price.labourHours),
      hourlyRate: String(price.hourlyRate),
      otherExpenses: String(price.otherExpenses),
      profitMargin: String(price.profitMargin),
    });

    setHasCalculated(true);
    setEditingId(price.id);
    setMessage("Saved calculation loaded. You can edit and update it.");
    setError("");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function renamePrice(id: string) {
    if (!user || !newName.trim()) {
      setError("Please enter a name.");
      return;
    }

    try {
      await updateDoc(
        doc(db, "users", user.uid, "savedPrices", id),
        {
          productName: newName.trim(),
          updatedAt: serverTimestamp(),
        }
      );

      setRenamingId(null);
      setNewName("");
      setMessage("Saved calculation renamed.");
      setError("");
    } catch (err) {
      console.error("Rename error:", err);
      setError("Unable to rename this calculation.");
    }
  }

  async function deletePrice(id: string) {
    if (!user) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this saved calculation?"
    );

    if (!confirmed) return;

    try {
      await deleteDoc(
        doc(db, "users", user.uid, "savedPrices", id)
      );

      if (editingId === id) {
        setEditingId(null);
        setForm(initialForm);
        setHasCalculated(false);
      }

      setMessage("Saved calculation deleted.");
      setError("");
    } catch (err) {
      console.error("Delete error:", err);
      setError("Unable to delete this calculation.");
    }
  }

  if (authLoading) {
    return (
      <main className="page">
        <p className="loading">Loading your pricing calculator...</p>
        <style jsx>{styles}</style>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page">
        <section className="access-card">
          <h1>Creator Pricing Calculator</h1>
          <p>Please log in to access this feature.</p>
          <Link href="/login" className="primary-button">
            Log in
          </Link>
        </section>
        <style jsx>{styles}</style>
      </main>
    );
  }

  if (!isCreative) {
    return (
      <main className="page">
        <section className="access-card">
          <h1>Creator-only feature</h1>
          <p>
            The pricing calculator is available to Threadly creative
            accounts only.
          </p>
          <Link href="/home" className="primary-button">
            Back to Home
          </Link>
        </section>
        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="container">
        <header className="page-header">
          <div>
            <Link href="/dashboard" className="back-link">
              Back to Dashboard
            </Link>
            <p className="eyebrow">THREADLY CREATOR TOOLS</p>
            <h1>Pricing Calculator</h1>
            <p className="subtitle">
              Calculate fair prices for your handmade products,
              creative projects and services.
            </p>
          </div>

          <div className="currency-badge">
            <span>Currency</span>
            <strong>Maloti (M)</strong>
          </div>
        </header>

        {message && <div className="success-message">{message}</div>}
        {error && <div className="error-message">{error}</div>}

        <div className="calculator-layout">
          <section className="panel calculator-panel">
            <div className="section-heading">
              <div>
                <span className="section-label">01 / INPUTS</span>
                <h2>Product details</h2>
              </div>
              {editingId && (
                <span className="editing-badge">Editing saved price</span>
              )}
            </div>

            <form onSubmit={handleCalculate}>
              <div className="field">
                <label htmlFor="productName">Product or project name</label>
                <input
                  id="productName"
                  type="text"
                  placeholder="e.g. Handmade crochet cardigan"
                  value={form.productName}
                  onChange={(e) =>
                    updateField("productName", e.target.value)
                  }
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="materialsCost">Materials cost (M)</label>
                <input
                  id="materialsCost"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 150"
                  value={form.materialsCost}
                  onChange={(e) =>
                    updateField("materialsCost", e.target.value)
                  }
                  required
                />
                <small>Yarn, fabric, beads, packaging materials, etc.</small>
              </div>

              <div className="two-columns">
                <div className="field">
                  <label htmlFor="labourHours">Labour hours</label>
                  <input
                    id="labourHours"
                    type="number"
                    min="0"
                    step="0.25"
                    placeholder="e.g. 5"
                    value={form.labourHours}
                    onChange={(e) =>
                      updateField("labourHours", e.target.value)
                    }
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="hourlyRate">Hourly rate (M)</label>
                  <input
                    id="hourlyRate"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 40"
                    value={form.hourlyRate}
                    onChange={(e) =>
                      updateField("hourlyRate", e.target.value)
                    }
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="otherExpenses">Other expenses (M)</label>
                <input
                  id="otherExpenses"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.otherExpenses}
                  onChange={(e) =>
                    updateField("otherExpenses", e.target.value)
                  }
                />
                <small>
                  Transport, electricity, delivery and other overheads.
                </small>
              </div>

              <div className="field">
                <label htmlFor="profitMargin">
                  Target profit margin (%)
                </label>
                <input
                  id="profitMargin"
                  type="number"
                  min="0"
                  max="99.99"
                  step="0.01"
                  value={form.profitMargin}
                  onChange={(e) =>
                    updateField("profitMargin", e.target.value)
                  }
                  required
                />
                <small>
                  The percentage of the selling price you want to
                  retain as profit.
                </small>
              </div>

              <button type="submit" className="primary-button full-button">
                Calculate Price →
              </button>
            </form>
          </section>

          <section className="panel result-panel">
            <div className="section-heading">
              <div>
                <span className="section-label">02 / RESULTS</span>
                <h2>Your price breakdown</h2>
              </div>
              <span className="result-icon">M</span>
            </div>

            {hasCalculated && result ? (
              <>
                <div className="selling-price">
                  <span>Recommended selling price</span>
                  <strong>{money(result.sellingPrice)}</strong>
                  <small>Based on your selected profit margin</small>
                </div>

                <div className="breakdown">
                  <div>
                    <span>Materials</span>
                    <strong>{money(result.materialsCost)}</strong>
                  </div>
                  <div>
                    <span>Labour ({result.labourHours} hours)</span>
                    <strong>{money(result.labourCost)}</strong>
                  </div>
                  <div>
                    <span>Other expenses</span>
                    <strong>{money(result.otherExpenses)}</strong>
                  </div>
                  <div className="total-row">
                    <span>Total production cost</span>
                    <strong>{money(result.totalCost)}</strong>
                  </div>
                  <div>
                    <span>Expected profit</span>
                    <strong className="profit">
                      {money(result.expectedProfit)}
                    </strong>
                  </div>
                  <div>
                    <span>Target profit margin</span>
                    <strong>{result.profitMargin}%</strong>
                  </div>
                </div>

                <button
                  type="button"
                  className="primary-button full-button"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingId
                    ? "Update Saved Price"
                    : "Save Price to Threadly"}
                </button>

                {editingId && (
                  <button
                    type="button"
                    className="secondary-button full-button"
                    onClick={() => {
                      setEditingId(null);
                      setForm(initialForm);
                      setHasCalculated(false);
                      setMessage("");
                    }}
                  >
                    Start a New Calculation
                  </button>
                )}
              </>
            ) : (
              <div className="empty-result">
                <div className="empty-icon">₥</div>
                <h3>Your results will appear here</h3>
                <p>
                  Enter your costs and profit margin, then select
                  Calculate Price.
                </p>
              </div>
            )}
          </section>
        </div>

        <section className="panel saved-panel">
          <div className="section-heading saved-heading">
            <div>
              <span className="section-label">03 / YOUR LIBRARY</span>
              <h2>My Saved Prices</h2>
              <p className="subtitle">
                Your calculations are saved to your Threadly account.
              </p>
            </div>
            <span className="count-badge">
              {savedPrices.length} saved
            </span>
          </div>

          {loadingPrices ? (
            <p className="loading">Loading saved prices...</p>
          ) : savedPrices.length === 0 ? (
            <div className="empty-saved">
              <div className="empty-icon">▤</div>
              <h3>No saved prices yet</h3>
              <p>
                Once you calculate a price, select Save Price to keep
                it here.
              </p>
            </div>
          ) : (
            <div className="saved-list">
              {savedPrices.map((price) => (
                <article className="saved-item" key={price.id}>
                  <div className="saved-info">
                    <h3>{price.productName}</h3>
                    <p>
                      Production cost: {money(price.totalCost)}
                    </p>
                    <small>
                      {price.createdAt?.toDate
                        ? price.createdAt.toDate().toLocaleDateString()
                        : "Recently saved"}
                    </small>
                  </div>

                  <div className="saved-price">
                    <span>Selling price</span>
                    <strong>{money(price.sellingPrice)}</strong>
                    <small>
                      Profit: {money(price.expectedProfit)}
                    </small>
                  </div>

                  <div className="saved-actions">
                    <button
                      type="button"
                      className="small-button"
                      onClick={() => revisitPrice(price)}
                    >
                      View
                    </button>

                    <button
                      type="button"
                      className="small-button"
                      onClick={() => {
                        setRenamingId(price.id);
                        setNewName(price.productName);
                      }}
                    >
                      Rename
                    </button>

                    <button
                      type="button"
                      className="small-button delete-button"
                      onClick={() => deletePrice(price.id)}
                    >
                      Delete
                    </button>
                  </div>

                  {renamingId === price.id && (
                    <div className="rename-area">
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="New calculation name"
                        aria-label="New calculation name"
                      />
                      <button
                        type="button"
                        className="small-button"
                        onClick={() => renamePrice(price.id)}
                      >
                        Save name
                      </button>
                      <button
                        type="button"
                        className="small-button"
                        onClick={() => setRenamingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <p className="disclaimer">
          Pricing suggestions are estimates. Remember to consider your
          market, customers, business costs and the value of your work
          before setting a final price.
        </p>
      </div>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .page {
    min-height: 100vh;
    padding: 42px 24px 70px;
    background: #050816;
    color: #f4f7ff;
  }

  .container {
    width: 100%;
    max-width: 1120px;
    margin: 0 auto;
  }

  .page-header, .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
  }

  .page-header { margin-bottom: 30px; }

  .back-link {
    display: inline-block;
    color: #8cbdff;
    text-decoration: none;
    margin-bottom: 25px;
    font-size: 13px;
  }

  .eyebrow, .section-label {
    color: #55a4ff;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 2px;
  }

  h1 {
    font-size: clamp(30px, 5vw, 43px);
    margin: 9px 0;
    letter-spacing: -1.5px;
  }

  h2 { font-size: 21px; margin: 8px 0; }
  h3 { margin: 0; }

  .subtitle {
    color: #929db5;
    font-size: 13px;
    line-height: 1.7;
    margin: 6px 0 0;
  }

  .currency-badge, .count-badge {
    background: #101b35;
    border: 1px solid #24385e;
    border-radius: 12px;
    padding: 12px 16px;
    white-space: nowrap;
  }

  .currency-badge span, .currency-badge strong {
    display: block;
  }

  .currency-badge span {
    color: #8e9bb6;
    font-size: 11px;
    margin-bottom: 5px;
  }

  .currency-badge strong { color: #73b5ff; }

  .calculator-layout {
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    gap: 22px;
    align-items: start;
  }

  .panel {
    background: #0b1224;
    border: 1px solid #1b2b4a;
    border-radius: 18px;
    padding: 25px;
  }

  .section-heading { margin-bottom: 25px; }
  .editing-badge {
    color: #78baff;
    font-size: 11px;
    background: #11284a;
    padding: 7px 10px;
    border-radius: 20px;
  }

  .field { margin-bottom: 19px; }

  label {
    display: block;
    color: #dce6f8;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 9px;
  }

  input {
    width: 100%;
    box-sizing: border-box;
    background: #070d1b;
    border: 1px solid #293a5a;
    border-radius: 9px;
    color: white;
    padding: 13px 14px;
    outline: none;
    font: inherit;
  }

  input:focus {
    border-color: #398fff;
    box-shadow: 0 0 0 3px #2879e51c;
  }

  input::placeholder { color: #64718b; }

  .field small {
    display: block;
    color: #7f8ba5;
    margin-top: 7px;
    font-size: 11px;
    line-height: 1.5;
  }

  .two-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  button { cursor: pointer; font: inherit; }

  .primary-button {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    background: #2586ff;
    color: white;
    text-decoration: none;
    border: 0;
    border-radius: 9px;
    padding: 13px 18px;
    font-weight: 700;
    transition: background 0.2s;
  }

  .primary-button:hover { background: #0870ed; }
  .primary-button:disabled { opacity: 0.6; cursor: not-allowed; }
  .full-button { width: 100%; margin-top: 12px; }

  .secondary-button {
    background: transparent;
    color: #a9caff;
    border: 1px solid #2c4a76;
    border-radius: 9px;
    padding: 12px;
    margin-top: 10px;
    width: 100%;
  }

  .result-icon {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: #112c50;
    color: #6bb4ff;
    font-weight: 800;
  }

  .selling-price {
    background: linear-gradient(135deg, #102c50, #102044);
    border: 1px solid #24558c;
    border-radius: 14px;
    padding: 22px;
    margin-bottom: 22px;
  }

  .selling-price span, .selling-price small {
    display: block;
    color: #a9c5e9;
    font-size: 12px;
  }

  .selling-price strong {
    display: block;
    color: #75b9ff;
    font-size: clamp(29px, 4vw, 39px);
    margin: 10px 0;
    overflow-wrap: anywhere;
  }

  .breakdown > div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 0;
    border-bottom: 1px solid #1b2942;
    font-size: 13px;
  }

  .breakdown span { color: #a2aec5; }
  .breakdown strong { text-align: right; }

  .breakdown .total-row {
    border-bottom: 1px solid #345077;
    padding: 17px 0;
    font-weight: 800;
  }

  .profit { color: #60d9a0; }

  .empty-result, .empty-saved {
    text-align: center;
    padding: 50px 15px;
    color: #8f9bb4;
  }

  .empty-result h3, .empty-saved h3 {
    color: #e0e9f8;
    font-size: 16px;
    margin: 16px 0 8px;
  }

  .empty-result p, .empty-saved p {
    font-size: 12px;
    line-height: 1.7;
    max-width: 320px;
    margin: auto;
  }

  .empty-icon {
    width: 54px;
    height: 54px;
    border-radius: 16px;
    display: grid;
    place-items: center;
    background: #122748;
    color: #67adff;
    font-size: 25px;
    margin: auto;
  }

  .saved-panel { margin-top: 24px; }
  .saved-heading { align-items: flex-start; }
  .count-badge { color: #8bc2ff; font-size: 12px; }

  .saved-list {
    display: grid;
    gap: 12px;
  }

  .saved-item {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 20px;
    background: #080f1e;
    border: 1px solid #1c2c49;
    border-radius: 12px;
    padding: 17px;
  }

  .saved-info h3 {
    font-size: 14px;
    margin-bottom: 7px;
    overflow-wrap: anywhere;
  }

  .saved-info p, .saved-info small, .saved-price span,
  .saved-price small {
    display: block;
    color: #8d9bb5;
    font-size: 11px;
    margin: 5px 0;
  }

  .saved-price { text-align: right; }
  .saved-price strong {
    display: block;
    color: #76baff;
    font-size: 17px;
  }

  .saved-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 7px;
  }

  .small-button {
    background: #142747;
    border: 1px solid #29456e;
    color: #b6d7ff;
    padding: 8px 11px;
    border-radius: 7px;
    font-size: 11px;
  }

  .small-button:hover { background: #1b3964; }
  .delete-button { color: #ff929c; border-color: #62313c; }

  .rename-area {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .rename-area input { flex: 1; min-width: 180px; }

  .disclaimer {
    color: #71809c;
    font-size: 11px;
    line-height: 1.7;
    text-align: center;
    margin: 25px auto 0;
    max-width: 650px;
  }

  .success-message, .error-message {
    border-radius: 9px;
    padding: 12px 15px;
    margin-bottom: 18px;
    font-size: 13px;
  }

  .success-message {
    background: #103126;
    color: #7be0ae;
    border: 1px solid #20583f;
  }

  .error-message {
    background: #351a25;
    color: #ff9ba9;
    border: 1px solid #663040;
  }

  .loading { color: #9caac2; padding: 20px 0; }

  .access-card {
    max-width: 500px;
    margin: 100px auto;
    padding: 35px;
    text-align: center;
    background: #0b1224;
    border: 1px solid #1b2b4a;
    border-radius: 18px;
  }

  .access-card p { color: #9ba9c2; line-height: 1.7; }
  .access-card .primary-button { margin-top: 15px; }

  @media (max-width: 800px) {
    .calculator-layout { grid-template-columns: 1fr; }
    .saved-item { grid-template-columns: 1fr 1fr; }
    .saved-actions { grid-column: 1 / -1; justify-content: flex-start; }
  }

  @media (max-width: 520px) {
    .page { padding: 25px 14px 50px; }
    .page-header { align-items: flex-start; flex-direction: column; }
    .panel { padding: 18px; }
    .two-columns { grid-template-columns: 1fr; gap: 0; }
    .saved-item { grid-template-columns: 1fr; }
    .saved-price { text-align: left; }
    .saved-actions { grid-column: auto; }
    .saved-heading { flex-direction: column; }
  }
`;
