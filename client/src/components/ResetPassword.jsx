import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { alertBox, btnDark, input, label } from "../utils/ui";
import AuthLayout from "./AuthLayout";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      navigate("/login", {
        replace: true,
        state: { notice: "Password updated. Log in with your new password." },
      });
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong, try again");
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="New Password"
      subtitle="Choose a new password for your account"
      footer={
        <>
          Back to{" "}
          <Link to="/login" className="font-bold text-ink">
            Sign In
          </Link>
        </>
      }
    >
      {!token ? (
        <div role="alert" className={`${alertBox} mt-8`}>
          This reset link is not valid.{" "}
          <Link to="/forgot-password" className="font-semibold underline">
            Request a new one
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {error && (
            <p role="alert" className={alertBox}>
              {error}{" "}
              <Link to="/forgot-password" className="font-semibold underline">
                Request a new link
              </Link>
            </p>
          )}
          <div>
            <label htmlFor="password" className={label}>
              New password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label htmlFor="confirm" className={label}>
              Confirm new password
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              placeholder="Re-enter your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={input}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className={`${btnDark} w-full`}
          >
            {submitting ? "Saving..." : "Update password"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
