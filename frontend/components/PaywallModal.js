/**
 * PaywallModal component
 *
 * Shown when the user tries to access the AI insights feed without a paid
 * session.  Creates a new session on the backend and redirects the user to
 * the Stripe Payment Link with their session token embedded as
 * ``client_reference_id``.
 */

import { useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function PaywallModal({ onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handlePay() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/session/create`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to create session");
      const data = await res.json();

      if (!data.payment_url) {
        throw new Error("Payment URL not configured – contact support.");
      }

      // Persist token so we can poll status after redirect
      localStorage.setItem("genie_f1_token", data.token);

      // Redirect to Stripe
      window.location.href = data.payment_url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-f1dark border border-f1red rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-f1red rounded-full flex items-center justify-center text-white font-black text-lg">
            G
          </div>
          <div>
            <h2 className="text-xl font-black text-white">GenieF1 Pro</h2>
            <p className="text-xs text-gray-400">Live AI Race Engineer</p>
          </div>
        </div>

        {/* Value proposition */}
        <ul className="space-y-3 mb-8">
          {[
            "⚡ Real-time AI insights as every lap unfolds",
            "🏎️  Sector-by-sector performance analysis",
            "📡 Live Discord bot broadcasting",
            "🔓 Pay what you want (minimum $2)",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-gray-300">
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm mb-4 text-center">{error}</p>
        )}

        {/* CTA */}
        <button
          onClick={handlePay}
          disabled={loading}
          className="w-full bg-f1red hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl transition-colors text-lg"
        >
          {loading ? "Redirecting to Stripe…" : "Unlock for $2+"}
        </button>

        <button
          onClick={onClose}
          className="w-full mt-3 text-gray-500 hover:text-gray-300 text-sm py-2 transition-colors"
        >
          Maybe later
        </button>

        <p className="text-center text-xs text-gray-600 mt-4">
          Secure payment via Stripe · One-time unlock
        </p>
      </div>
    </div>
  );
}
