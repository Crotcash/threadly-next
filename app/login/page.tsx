"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from ".././lib/firebase";
import { getAuthErrorMessage } from "../lib/auth-errors";
import AuthShell from ".././components/AuthShell";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence,
      );

      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password,
      );

      const snapshot = await getDoc(doc(db, "users", credential.user.uid));

      if (!snapshot.exists()) {
        setMessage(
          "Your account has no Threadly profile. Please contact support.",
        );
        return;
      }

      const role = snapshot.data().role;

      if (role !== "creative" && role !== "customer") {
        setMessage("Your account role is invalid. Please contact support.");
        return;
      }

      router.replace("/dashboard");
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to reconnect with your community."
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

        <label className="field">
          <span className="label-row">
            Password
            <Link href="/forgot-password" className="text-link">
              Forgot password?
            </Link>
          </span>
          <div className="password-wrap">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <label className="terms-label">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          <span>Keep me signed in on this device</span>
        </label>

        {message && (
          <p className="form-message error-message" role="alert">
            {message}
          </p>
        )}

        <button className="button button-full" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <p className="form-switch">
          New to Threadly? <Link href="/register">Create an account</Link>
        </p>
      </form>
    </AuthShell>
  );
}
