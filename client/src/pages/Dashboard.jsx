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

  // --- DEV TOOLS WIPE DATABASE ---
  const handleWipeDatabase = async () => {
    const confirmFirst = window.confirm(
      "⚠️ WARNING: This will delete ALL users and authenticators in the database.\n\nAre you sure you want to proceed?",
    );

    if (!confirmFirst) return;

    const confirmSecond = window.confirm(
      "Are you ABSOLUTELY sure? You will be logged out and your current passkeys will become invalid.",
    );

    if (!confirmSecond) return;

    try {
      const response = await fetch("/api/auth/dev/wipe-database", {
        method: "POST",
      });

      if (response.ok) {
        alert(
          "Database wiped. Please delete the remaining passkeys from your browser/OS settings manually.",
        );
        // Clear the token and force a hard reload to return to the login screen
        localStorage.removeItem("webauthn_token");
        window.location.reload();
      } else {
        const data = await response.json();
        alert(`Failed to wipe database: ${data.error}`);
      }
    } catch (error) {
      console.error("Error wiping database:", error);
    }
  };

  const fetchAuthenticators = async () => {
    try {
      const token = localStorage.getItem("webauthn_token");
      const response = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAuthenticators(data.authenticators || []);
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
        },
      );

      if (!optionsResponse.ok) {
        const errorData = await optionsResponse.json();
        throw new Error(
          errorData.error || "Failed to generate registration options.",
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
        alert("Success! Your device has been added.");
        await fetchAuthenticators();
      } else {
        throw new Error(
          verifyData.error || "Verification on backend rejected key.",
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
      currentNickname,
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
        },
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
        "Security Block: You cannot delete this device. You must have at least one authentication method active to prevent account lockout.",
      );
      return;
    }

    const confirmWipe = window.confirm(
      `Are you absolutely sure you want to delete "${nickname || "this device"}"? You will no longer be able to log in with this physical device.`,
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
        alert("Device completely removed.");
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

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] py-12 px-4 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Security Dashboard
            </h1>
            <p className="mt-2 text-gray-600">
              Review your registered secure credentials
            </p>
          </div>

          <button
            onClick={handleRegisterNewDevice}
            disabled={registering || loading}
            className="inline-flex items-center justify-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors cursor-pointer"
          >
            {registering
              ? "Configuring Device..."
              : "➕ Add Passkey / Security Key"}
          </button>
        </div>

        <div className="grid gap-6">
          {/* User Profile Card */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {user.username}
                </h2>
                <div className="flex items-center text-green-600 text-sm font-medium mt-0.5">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Authenticated Passwordless Session
                </div>
              </div>
            </div>
          </div>

          {/* Device Keys Container */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Registered Security Keys
              </h3>
              <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full">
                {authenticators.length} Total
              </span>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : authenticators.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                <p className="text-gray-500 text-sm">
                  No verification hardware configured.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {authenticators.map((auth) => {
                  const info = getDeviceInfo(auth);

                  return (
                    <div
                      key={auth.id}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-slate-50 transition-colors border border-gray-200 rounded-xl bg-white gap-4"
                    >
                      <div className="flex items-start sm:items-center space-x-4">
                        <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-gray-50 rounded-lg border border-gray-100 p-2 overflow-hidden">
                          {info.icon ? (
                            <img
                              src={info.icon}
                              alt={info.hardwareName}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <span className="text-2xl">{info.textIcon}</span>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-gray-900 text-base">
                              {auth.nickname || "Unnamed Device"}
                            </p>

                            <button
                              onClick={() =>
                                handleEditNickname(auth.id, auth.nickname)
                              }
                              className="text-gray-400 hover:text-indigo-600 text-xs cursor-pointer p-1"
                              title="Edit Nickname"
                            >
                              ✏️
                            </button>

                            {auth.deviceType === "multiDevice" && (
                              <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                                Sync Passkey
                              </span>
                            )}
                          </div>

                          <p className="text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded width-max mt-0.5 inline-block">
                            Device Model: {info.hardwareName}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {info.subText}
                          </p>

                          <div className="flex gap-3 text-[11px] font-medium text-gray-400 mt-2">
                            <span>
                              Key ID: ...{auth.credentialId.slice(-8)}
                            </span>
                            <span>Sign Counter: {auth.counter}</span>
                            {auth.backedUp && (
                              <span className="text-emerald-600 font-bold">
                                ✓ Cloud Backed Up
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-100">
                        <div className="text-left sm:text-right hidden md:block mb-2">
                          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                            Created
                          </p>
                          <p className="text-xs font-semibold text-gray-700">
                            {formatDate(auth.createdAt)}
                          </p>
                        </div>

                        <button
                          onClick={() =>
                            handleDeleteAuthenticator(auth.id, auth.nickname)
                          }
                          disabled={authenticators.length <= 1}
                          className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 disabled:bg-gray-50 disabled:text-gray-300 text-red-600 text-xs font-semibold rounded-lg border border-red-200 disabled:border-gray-200 transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                          🗑️ Delete Key
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* --- ADDED: DEVELOPER TOOLS --- */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="bg-red-50 p-6 rounded-xl border border-red-200">
            <h3 className="text-red-800 font-bold text-lg mb-2">
              Developer Tools
            </h3>
            <p className="text-red-600 text-sm mb-4">
              Use this to reset the testing environment. This will permanently
              delete all users and passkeys from the PostgreSQL database.
            </p>
            <button
              onClick={handleWipeDatabase}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              ☢️ Wipe Entire Database
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
