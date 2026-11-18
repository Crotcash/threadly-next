"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  deleteUser,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from ".././lib/firebase";
import { getAuthErrorMessage } from "../lib/auth-errors";
import AuthShell from ".././components/AuthShell";

type Role = "creative" | "customer";

export default function RegisterPage() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>("creative");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const cleanName = displayName.trim();
    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      setMessage("Username must be 3–20 letters, numbers, or underscores.");
      return;
    }

    if (password.length < 8) {
      setMessage("Your password must have at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Your passwords do not match.");
      return;
    }

    if (!acceptedTerms) {
      setMessage("Please accept the terms to continue.");
      return;
    }

    setLoading(true);
    let createdUser: typeof auth.currentUser = null;

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        cleanEmail,
        password,
      );

      createdUser = credential.user;

      await updateProfile(createdUser, { displayName: cleanName });

      await setDoc(doc(db, "users", createdUser.uid), {
        uid: createdUser.uid,
        displayName: cleanName,
        username: cleanUsername,
        email: cleanEmail,
        role,
        bio: "",
        photoURL: "",
        createdAt: serverTimestamp(),
      });

      router.replace("/dashboard");
    } catch (error) {
      let friendlyMessage = getAuthErrorMessage(error);

      if (createdUser) {
        try {
          await deleteUser(createdUser);
        } catch {
          friendlyMessage =
            "Your account may have been created, but saving your profile failed. Check Firestore rules and Firebase Authentication.";
        }
      }

      setMessage(friendlyMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Join Threadly"
      subtitle="Create your account and find your creative community."
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field">
          Full name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            required
          />
        </label>

        <label className="field">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            maxLength={20}
            required
          />
          <span className="field-hint">
            3–20 letters, numbers, or underscores.
          </span>
        </label>

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
          Password
          <div className="password-wrap">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
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

        <label className="field">
          Confirm password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>

        <fieldset className="role-fieldset">
          <legend>Choose your account type</legend>
          <div className="role-options">
            <label
              className={`role-option ${role === "creative" ? "role-selected" : ""}`}
            >
              <input
                type="radio"
                name="role"
                checked={role === "creative"}
                onChange={() => setRole("creative")}
              />
              <span className="role-icon">✦</span>
              <strong>Creative</strong>
              <span className="role-description">
                Share your work and grow your audience.
              </span>
            </label>

            <label
              className={`role-option ${role === "customer" ? "role-selected" : ""}`}
            >
              <input
                type="radio"
                name="role"
                checked={role === "customer"}
                onChange={() => setRole("customer")}
              />
              <span className="role-icon">◇</span>
              <strong>Customer</strong>
              <span className="role-description">
                Discover creators and explore their work.
              </span>
            </label>
          </div>
        </fieldset>

        <label className="terms-label">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
          />
          <span>I agree to the terms and privacy policy.</span>
        </label>

        {message && (
          <p className="form-message error-message" role="alert">
            {message}
          </p>
        )}

        <button className="button button-full" disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </button>

        <p className="form-switch">
          Already registered? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
