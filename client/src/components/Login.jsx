import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { homeFor } from "../utils/home";
import { alertBox, btnDark, input, label } from "../utils/ui";
import AuthLayout from "./AuthLayout";
import Icon from "./Icon";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const notice = useLocation().state?.notice;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homeFor(user)} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const signedIn = await login(email, password);
      navigate(homeFor(signedIn));
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong, try again");
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome Back"
      subtitle="Enter your email and password to access your account"
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/register" className="font-bold text-ink">
            Sign Up
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {notice && (
          <p
            role="status"
            className="rounded-[10px] bg-green-100 p-3 text-sm text-green-900"
          >
            {notice}
          </p>
        )}
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
        <div>
          <label htmlFor="password" className={label}>
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${input} pr-12`}
            />
            <button
              type="button"
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow((s) => !s)}
              className="absolute right-1 top-3.5 grid h-11 w-11 place-items-center text-muted"
            >
              <Icon name="eye" />
            </button>
          </div>
          <Link
            to="/forgot-password"
            className="mt-1 inline-flex min-h-11 items-center text-[13px] font-semibold text-ink underline"
          >
            Forgot password?
          </Link>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className={`${btnDark} w-full`}
        >
          {submitting ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </AuthLayout>
  );
}
