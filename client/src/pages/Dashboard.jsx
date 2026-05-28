import { useState, useEffect } from "react";
import { startRegistration } from "@simplewebauthn/browser";

function Dashboard({ user }) {
  const [authenticators, setAuthenticators] = useState([]);
  const [aaguidMap, setAaguidMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    Promise.all([fetchAuthenticators(), fetchAaguidMap()]).finally(() => {
      setLoading(false);
    });
  }, []);

  const fetchAuthenticators = async () => {
    try {
      const token = localStorage.getItem("webauthn_token");
      const response = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAuthenticators(data.authenticators || []);
      } else if (response.status === 401 || response.status === 404) {
        console.warn("Session expired or invalid user context. Logging out.");
        localStorage.removeItem("webauthn_token");
        window.location.reload();
      }
    } catch (error) {
      console.error("Error fetching authenticators:", error);
    }
  };

  const fetchAaguidMap = async () => {
    try {
      const response = await fetch(
        "https://raw.githubusercontent.com/passkeydeveloper/passkey-authenticator-aaguids/main/aaguid.json",
      );
      if (response.ok) {
        const data = await response.json();
        setAaguidMap(data);
      }
    } catch (error) {
      console.error("Error fetching AAGUID map:", error);
    }
  };

  const handleRegisterNewDevice = async () => {
    const customName = prompt(
      "Enter a label/nickname for this passkey device:",
      "My Personal Device",
    );
    if (customName === null) return;

    setRegistering(true);
    try {
      const token = localStorage.getItem("webauthn_token");
      const optionsResponse = await fetch(
        "/api/auth/generate-additional-device-options",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!optionsResponse.ok) {
        const errorData = await optionsResponse.json();
        throw new Error(
          errorData.error || "Failed to generate registration options."
        );
      }

      const options = await optionsResponse.json();
      const registrationResult = await startRegistration({
        optionsJSON: options,
      });

      const verifyResponse = await fetch("/api/auth/verify-registration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: user.username,
          verification: registrationResult,
          nickname: customName.trim() || "Unnamed Passkey",
        }),
      });

      const verifyData = await verifyResponse.json();

      if (verifyData.success) {
        await fetchAuthenticators();
      } else {
        throw new Error(
          verifyData.error || "Verification on backend rejected key."
        );
      }
    } catch (error) {
      console.error("Multi-device Registration Exception:", error);
      if (error.name === "NotAllowedError") {
        alert("Registration timed out or cancelled.");
      } else {
        alert(`Configuration Failed: ${error.message}`);
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleEditNickname = async (authId, currentNickname) => {
    const newName = prompt(
      `Edit the nickname for this device:`,
      currentNickname
    );
    if (newName === null || newName.trim() === currentNickname) return;

    try {
      const token = localStorage.getItem("webauthn_token");
      const response = await fetch(
        `/api/auth/authenticator/${authId}/nickname`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ nickname: newName }),
        }
      );

      const data = await response.json();
      if (response.ok) {
        await fetchAuthenticators();
      } else {
        alert(data.error || "Failed to update nickname.");
      }
    } catch (error) {
      console.error("Error editing nickname:", error);
    }
  };

  const handleDeleteAuthenticator = async (authId, nickname) => {
    if (authenticators.length <= 1) {
      alert(
        "Security Block: You cannot delete this device. You must have at least one authentication method active to prevent account lockout."
      );
      return;
    }

    const confirmWipe = window.confirm(
      `Are you absolutely sure you want to delete "${
        nickname || "this device"
      }"? You will no longer be able to log in with this physical device.`
    );
    if (!confirmWipe) return;

    try {
      const token = localStorage.getItem("webauthn_token");
      const response = await fetch(`/api/auth/authenticator/${authId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (response.ok) {
        await fetchAuthenticators();
      } else {
        alert(data.error || "Failed to remove device.");
      }
    } catch (error) {
      console.error("Error deleting authenticator:", error);
    }
  };

  const getDeviceInfo = (auth) => {
    const fallbackIcon = auth.attachmentType === "platform" ? "👤" : "🔑";
    const fallbackName =
      auth.attachmentType === "platform"
        ? "Built-in Biometrics"
        : "Security Key";

    const lookupKey = auth.aaguid?.toLowerCase();
    const brandData = aaguidMap[lookupKey];

    if (
      lookupKey === "00000000-0000-0000-0000-000000000000" ||
      (!brandData &&
        auth.transports?.includes("internal") &&
        /Mac|iPhone|iPad/i.test(navigator.userAgent))
    ) {
      return {
        hardwareName: "Apple iCloud Keychain",
        icon: null,
        textIcon: "🍏",
        subText: "FaceID / TouchID",
      };
    }

    if (brandData) {
      return {
        hardwareName: brandData.name,
        icon: brandData.icon_light || brandData.icon_dark,
        textIcon: null,
        subText:
          auth.attachmentType === "platform"
            ? "Platform Passkey"
            : "Cross-platform Token",
      };
    }

    return {
      hardwareName: fallbackName,
      icon: null,
      textIcon: fallbackIcon,
      subText: "Standard WebAuthn Device",
    };
  };

  const timeAgo = (dateString) => {
    if (!dateString) return "Never used";
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days !== 1 ? "s" : ""} ago`;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Security Details
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your passkeys and active authentication methods.
            </p>
          </div>
          <button
            onClick={handleRegisterNewDevice}
            disabled={registering || loading}
            className="btn-primary"
          >
            {registering ? "Adding..." : "+ Add Passkey"}
          </button>
        </header>

        <section className="card">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Your passkeys</h2>
              <p className="text-sm text-gray-500 mt-1">Passkeys allow you to securely log in without a password.</p>
            </div>
            <span className="bg-gray-100 text-gray-700 text-xs font-semibold px-2 py-1 rounded">
              {authenticators.length}
            </span>
          </div>

          {loading ? (
            <div className="flex flex-col space-y-4">
               {/* Skeleton Loader */}
               <div className="h-20 bg-gray-50 animate-pulse rounded-lg border border-gray-100"></div>
               <div className="h-20 bg-gray-50 animate-pulse rounded-lg border border-gray-100"></div>
            </div>
          ) : authenticators.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 border border-dashed border-gray-200 rounded-lg">
              <p className="text-sm text-gray-500">No passkeys configured.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {authenticators.map((auth) => {
                const info = getDeviceInfo(auth);

                return (
                  <div
                    key={auth.id}
                    className="p-5 flex flex-col justify-between border border-gray-200 rounded-xl bg-white hover:border-gray-300 transition-colors shadow-sm"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center shrink-0">
                           {info.icon ? (
                            <img
                              src={info.icon}
                              alt={info.hardwareName}
                              className="w-6 h-6 object-contain"
                            />
                          ) : (
                            <span className="text-lg">{info.textIcon}</span>
                          )}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 text-sm">
                            {auth.nickname || "Unnamed Passkey"}
                          </h3>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {info.hardwareName}
                          </p>
                          <div className="flex gap-2 items-center mt-3">
                            <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                              Last used: {timeAgo(auth.lastUsedAt)}
                            </span>
                            {auth.location && (
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(auth.location)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] uppercase font-bold text-slate-500 hover:text-slate-800 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 transition-colors inline-block"
                                  title="View on Google Maps"
                                >
                                  📍 {auth.location}
                                </a>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex gap-2 pt-4 border-t border-gray-50">
                      <button
                        onClick={() => handleEditNickname(auth.id, auth.nickname)}
                        className="text-xs font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded transition-colors"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => handleDeleteAuthenticator(auth.id, auth.nickname)}
                        disabled={authenticators.length <= 1}
                        className="text-xs font-medium text-red-600 hover:text-red-700 bg-white border border-gray-200 hover:bg-red-50 hover:border-red-200 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded transition-colors"
                        title={authenticators.length <= 1 ? "Cannot delete the last remaining passkey." : "Delete passkey"}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

export default Dashboard;
