import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { alertBox, btnDark, input, label } from "../utils/ui";
import AuthLayout from "./AuthLayout";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong, try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Forgot Password"
      subtitle="Enter your email and we'll send you a link to reset it"
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="font-bold text-ink">
            Sign In
          </Link>
        </>
      }
    >
      {sent ? (
        <div
          role="status"
          className="mt-8 rounded-[10px] bg-green-100 p-4 text-sm text-green-900"
        >
          If an account exists for {email}, a reset link is on its way. The link
          works for 30 minutes. Check your spam folder if you don't see it.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {error && (
            <p role="alert" className={alertBox}>
              {error}
            </p>
          )}
          <div>
            <label htmlFor="email" className={label}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className={`${btnDark} w-full`}
          >
            {submitting ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
