import { useState, useEffect } from "react";
import { startAuthentication } from "@simplewebauthn/browser";

function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  // --- TRIGGER AUTOFILL LISTENER ON MOUNT ---
  useEffect(() => {
    setupConditionalUI();
  }, []);

  const setupConditionalUI = async () => {
    try {
      const isCUIAvailable =
        await window.PublicKeyCredential?.isConditionalMediationAvailable?.();
      if (!isCUIAvailable) return;

      const response = await fetch("/api/auth/generate-conditional-options");
      if (!response.ok) return;
      const options = await response.json();

      const authenticationResult = await startAuthentication({
        optionsJSON: options,
        useConditionalMediation: true,
      });

      setLoading(true);
      const verifyResponse = await fetch("/api/auth/verify-authentication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verification: authenticationResult }),
      });

      if (verifyResponse.ok) {
        const data = await verifyResponse.json();
        localStorage.setItem("webauthn_token", data.token);

        // FIX: Added data.token here
        onLoginSuccess(data.user, data.token);
      } else {
        alert("Autofill login verification rejected.");
      }
    } catch (error) {
      console.log("Conditional UI listener status:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- STANDARD MANUAL USERNAME BUTTON FALLBACK ---
  const handleManualLogin = async (e) => {
    e.preventDefault();
    if (!username.trim()) return alert("Username required.");

    setLoading(true);
    try {
      const response = await fetch(
        `/api/auth/generate-authentication-options?username=${username}`,
      );
      if (!response.ok) throw new Error("User not found.");
      const options = await response.json();

      const authenticationResult = await startAuthentication({
        optionsJSON: options,
      });

      const verifyResponse = await fetch("/api/auth/verify-authentication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, verification: authenticationResult }),
      });

      if (verifyResponse.ok) {
        const data = await verifyResponse.json();
        localStorage.setItem("webauthn_token", data.token);

        // FIX: Added data.token here
        onLoginSuccess(data.user, data.token);
      } else {
        alert("Login failed.");
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <div>
          <h2 className="text-center text-3xl font-bold text-gray-900">
            Sign In
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Click the box to log in with your Passkey autofill
          </p>
        </div>

        <form onSubmit={handleManualLogin} className="mt-8 space-y-6">
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                autoComplete="username webauthn"
                placeholder="Username (or click for saved passkeys)"
                className="appearance-none rounded-xl relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:bg-indigo-400"
            >
              {loading ? "Verifying..." : "Continue with Username"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;
