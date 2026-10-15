"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { getSupabase } from "@/lib/supabase";

type Mode = "signin" | "signup" | "reset" | "new-password";

export function AuthPanel({
  onComplete,
  recovery = false,
}: {
  onComplete: () => void;
  recovery?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(recovery ? "new-password" : "signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const currentMode = recovery ? "new-password" : mode;
  const supabase = getSupabase();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    try {
      const redirectTo = `${location.origin}${location.pathname}`;
      if (currentMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name.trim() },
            emailRedirectTo: redirectTo,
          },
        });
        if (error) throw error;
        if (data.session) onComplete();
        else
          setMessage("Check your email to confirm the account, then sign in.");
      } else if (currentMode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        onComplete();
      } else if (currentMode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        });
        if (error) throw error;
        setMessage(
          "If an account exists for this email, a reset link is on its way.",
        );
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMessage("Password updated.");
        onComplete();
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not complete this request.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!supabase)
    return (
      <section className="auth-card panel">
        <LockKeyhole size={30} />
        <h2>Accounts are being connected</h2>
        <p>The account service is not configured on this deployment yet.</p>
      </section>
    );

  return (
    <section className="auth-card panel">
      <span className="overline">YOUR CRAFTWORX ACCOUNT</span>
      <h2>
        {currentMode === "signup"
          ? "Create an account"
          : currentMode === "reset"
            ? "Reset your password"
            : currentMode === "new-password"
              ? "Choose a new password"
              : "Welcome back"}
      </h2>
      <p>
        {currentMode === "signup"
          ? "Save your projects and follow every order."
          : currentMode === "reset"
            ? "We’ll email a link to your account."
            : "Sign in to request a quote and track your projects."}
      </p>
      <form onSubmit={submit} className="auth-form">
        {currentMode === "signup" && (
          <label>
            Full name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </label>
        )}
        {currentMode !== "new-password" && (
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
        )}
        {currentMode !== "reset" && (
          <label>
            Password
            <input
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={
                currentMode === "signin" ? "current-password" : "new-password"
              }
            />
          </label>
        )}
        <button className="btn" type="submit" disabled={busy}>
          {busy
            ? "Working…"
            : currentMode === "signup"
              ? "Create account"
              : currentMode === "reset"
                ? "Send reset link"
                : currentMode === "new-password"
                  ? "Save password"
                  : "Sign in"}
          <ArrowRight size={16} />
        </button>
      </form>
      {message && (
        <p className="auth-message" role="status">
          {message}
        </p>
      )}
      {!recovery && (
        <div className="auth-switch">
          {currentMode === "signin" ? (
            <>
              <button
                onClick={() => {
                  setMode("signup");
                  setMessage("");
                }}
              >
                Create an account
              </button>
              <button
                onClick={() => {
                  setMode("reset");
                  setMessage("");
                }}
              >
                Forgot password?
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setMode("signin");
                setMessage("");
              }}
            >
              Back to sign in
            </button>
          )}
        </div>
      )}
    </section>
  );
}
