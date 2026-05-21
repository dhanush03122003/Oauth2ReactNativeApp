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
      // Step 1: Get registration options from server
      // The server (v13.3.0) now returns challenge and user.id as Base64URL strings
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
      console.log("Registration Options:", options);

      // Step 2: Start registration
      // @simplewebauthn/browser v13+ consumes the server JSON directly
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

      console.log("Attestation Response:", attestation);

      // Step 3: Verify registration
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
      console.error("Registration error:", err);
      setError(err.message || "An error occurred during registration");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="card bg-white p-8 rounded-xl shadow-md">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900">Create Account</h2>
            <p className="mt-2 text-gray-600">
              Register with your biometric device or security key
            </p>
          </div>

          <form onSubmit={handleRegister} className="space-y-6">
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                required
                minLength={3}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !username}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center space-x-2 transition-colors disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Registering...</span>
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
                      d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                    />
                  </svg>
                  <span>Register with Biometrics</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{" "}
              <a
                href="/login"
                className="text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Sign in
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
              <p className="font-medium">Secure Passkeys</p>
              <p className="mt-1">
                Your credentials are never sent to the server. We only store a
                public key to verify your identity later.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Register;
