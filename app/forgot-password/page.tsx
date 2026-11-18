"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from ".././lib/firebase";
import { getAuthErrorMessage } from "../lib/auth-errors";
import AuthShell from "../components/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsError(false);
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      setMessage(
        "If an account exists for that email, password reset instructions will be sent.",
      );
    } catch (error) {
      setIsError(true);
      setMessage(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll help you get back into Threadly."
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field">
          Email address
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        {message && (
          <p
            className={`form-message ${isError ? "error-message" : "success-message"}`}
            role={isError ? "alert" : "status"}
          >
            {message}
          </p>
        )}

        <button className="button button-full" disabled={loading}>
          {loading ? "Sending..." : "Send reset instructions"}
        </button>

        <p className="form-switch">
          Remembered your password? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
