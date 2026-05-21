import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";

function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const optionsResponse = await fetch(
        `/api/auth/generate-authentication-options?username=${encodeURIComponent(username)}`,
      );

      if (!optionsResponse.ok) {
        const errorData = await optionsResponse.json();
        throw new Error(
          errorData.error || "Failed to get authentication options",
        );
      }

      const options = await optionsResponse.json();
      console.log("Authentication Options:", options);

      let authentication;
      try {
        authentication = await startAuthentication(options);
      } catch (err) {
        if (err.name === "NotAllowedError") {
          throw new Error("Authentication cancelled. Please try again.");
        }
        throw err;
      }

      const verificationResponse = await fetch(
        "/api/auth/verify-authentication",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username,
            verification: authentication,
          }),
        },
      );

      const result = await verificationResponse.json();

      if (!verificationResponse.ok) {
        throw new Error(result.error || "Authentication verification failed");
      }

      if (result.success) {
        onLoginSuccess(result.user, result.token);
      } else {
        throw new Error(result.error || "Authentication failed");
      }
    } catch (err) {
      console.error("Authentication error:", err);
      setError(err.message || "An error occurred during authentication");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 bg-gray-50">
      <div className="max-w-md w-full">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900">Welcome Back</h2>
            <p className="mt-2 text-gray-600">
              Sign in with your biometric device or security key
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !username}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center space-x-2 transition-colors disabled:bg-indigo-300"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <span>Sign in with Biometrics</span>
                </>
              )}
            </button>
          </form>

          {/* NEW: Clean helper text for the cross-device QR code flow */}
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-500">
              Trying to use your phone? Click <strong>"More choices"</strong> or{" "}
              <strong>"Cancel"</strong> on the browser prompt to scan a QR code.
            </p>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Don't have an account?{" "}
              <a
                href="/register"
                className="text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Register
              </a>
            </p>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg
              className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-sm text-blue-800">
              <p className="font-medium">Passwordless Login</p>
              <p className="mt-1">
                Use your fingerprint, face, or security key to authenticate. No
                password to remember or leak!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
