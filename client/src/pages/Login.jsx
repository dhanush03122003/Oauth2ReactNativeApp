import { useState, useEffect } from "react";
import { startAuthentication } from "@simplewebauthn/browser";

function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        onLoginSuccess(data.user, data.token);
      } else {
        setError("Autofill login verification rejected.");
      }
    } catch (error) {
      console.log("Conditional UI listener status:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManualLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (!username.trim()) {
      setError("Username is required.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/auth/generate-authentication-options?username=${username}`,
      );
      if (!response.ok) throw new Error("User not found or unavailable.");
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
        onLoginSuccess(data.user, data.token);
      } else {
        setError("Login failed. Key not recognized.");
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-white border border-gray-200 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm">
            <svg
              className="w-6 h-6 text-slate-800"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h2>
          <p className="mt-2 text-sm text-gray-500">Sign in to your account with a passkey</p>
        </div>

        <div className="card w-full">
          <form onSubmit={handleManualLogin} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Workspace ID or Username
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
                placeholder="Ex. johndoe"
                className="input-field"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-3 py-2 rounded-lg text-sm flex items-start gap-2">
                ⚠️ <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex justify-center items-center h-10"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
                  <span>Verifying...</span>
                </div>
              ) : (
                "Continue with Passkey"
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Don't have an account?{' '}
          <a href="/register" className="font-semibold text-slate-900 hover:underline">
            Register now
          </a>
        </p>

      </div>
    </div>
  );
}

export default Login;
