import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";

function Register({ onRegisterSuccess }) {
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");
    setIsLoading(true);

    try {
      const optionsResponse = await fetch(
        `/api/auth/generate-registration-options?username=${encodeURIComponent(
          username,
        )}`,
      );

      if (!optionsResponse.ok) {
        const errorData = await optionsResponse.json();
        throw new Error(
          errorData.error || "Failed to get registration options",
        );
      }

      const options = await optionsResponse.json();

      let attestation;
      try {
        attestation = await startRegistration(options);
      } catch (err) {
        if (err.name === "InvalidStateError") {
          throw new Error("Authenticator already registered. Try logging in.");
        }
        if (err.name === "NotAllowedError") {
          throw new Error("Registration cancelled. Please try again.");
        }
        throw err;
      }

      const verificationResponse = await fetch(
        "/api/auth/verify-registration",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username,
            verification: attestation,
          }),
        },
      );

      const result = await verificationResponse.json();

      if (!verificationResponse.ok) {
        throw new Error(result.error || "Registration verification failed");
      }

      if (result.success) {
        setSuccess("Registration successful! Redirecting...");
        onRegisterSuccess(result.user, result.token);
      } else {
        throw new Error(result.error || "Registration failed");
      }
    } catch (err) {
      setError(err.message || "An error occurred during registration");
    } finally {
      setIsLoading(false);
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
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Create an account</h2>
          <p className="mt-2 text-sm text-gray-500">Register with a biometric device or key</p>
        </div>

        <div className="card w-full">
          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Choose a Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                minLength={3}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                placeholder="Ex. johndoe"
                className="input-field"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-3 py-2 rounded-lg text-sm flex items-start gap-2">
                ⚠️ <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-3 py-2 rounded-lg text-sm flex items-start gap-2">
                ✓ <span>{success}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !username}
              className="btn-primary w-full flex justify-center items-center h-10"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
                  <span>Registering...</span>
                </div>
              ) : (
                "Register Device"
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <a href="/login" className="font-semibold text-slate-900 hover:underline">
            Sign in
          </a>
        </p>

      </div>
    </div>
  );
}

export default Register;
