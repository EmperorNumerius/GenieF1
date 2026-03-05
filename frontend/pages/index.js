/**
 * GenieF1 Dashboard – main page
 *
 * Layout:
 *   - Header (branding + session status)
 *   - Driver selector grid
 *   - Live timing table
 *   - AI insights feed (paywalled) + Discord link panel
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Head from "next/head";
import DriverSelector from "../components/DriverSelector";
import LiveTiming from "../components/LiveTiming";
import AIInsightsFeed from "../components/AIInsightsFeed";
import PaywallModal from "../components/PaywallModal";
import DiscordLinkPanel from "../components/DiscordLinkPanel";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const POLLING_INTERVAL_MS = 2000;

export default function Home() {
  // ---------------------------------------------------------------------------
  // Timing data state
  // ---------------------------------------------------------------------------
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const pollingRef = useRef(null);

  // ---------------------------------------------------------------------------
  // Session / paywall state
  // ---------------------------------------------------------------------------
  const [sessionToken, setSessionToken] = useState(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  // ---------------------------------------------------------------------------
  // Restore session token from localStorage and check status
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const saved = localStorage.getItem("genie_f1_token");
    if (saved) {
      setSessionToken(saved);
      checkSessionStatus(saved);
    }
  }, []);

  async function checkSessionStatus(token) {
    try {
      const res = await fetch(`${API_URL}/session/${token}/status`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.unlocked) {
        setIsUnlocked(true);
      }
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Live timing polling
  // ---------------------------------------------------------------------------
  const fetchTiming = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/timing`);
      if (!res.ok) return;
      const data = await res.json();
      const driverList = Object.values(data.drivers || {});
      setDrivers(driverList);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchTiming();
    pollingRef.current = setInterval(fetchTiming, POLLING_INTERVAL_MS);
    return () => clearInterval(pollingRef.current);
  }, [fetchTiming]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function handleInsightRequest() {
    if (!isUnlocked) setShowPaywall(true);
  }

  function handlePaywallClose() {
    setShowPaywall(false);
    // Re-check session in case the user paid in another tab
    const saved = localStorage.getItem("genie_f1_token");
    if (saved) checkSessionStatus(saved);
  }

  const selectedDriverData = drivers.find(
    (d) => d.driver_number === selectedDriver
  );

  return (
    <>
      <Head>
        <title>GenieF1 – Live AI Race Engineer</title>
        <meta
          name="description"
          content="Real-time F1 telemetry dashboard with AI race-engineer insights"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* Paywall modal */}
      {showPaywall && <PaywallModal onClose={handlePaywallClose} />}

      <div className="min-h-screen bg-f1dark text-white">
        {/* ------------------------------------------------------------------ */}
        {/* Header                                                              */}
        {/* ------------------------------------------------------------------ */}
        <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-f1red rounded flex items-center justify-center font-black text-sm">
              G
            </div>
            <span className="font-black text-xl tracking-tight">
              Genie<span className="text-f1red">F1</span>
            </span>
            <span className="hidden sm:inline text-xs text-gray-500 ml-2">
              Live AI Race Engineer
            </span>
          </div>

          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-gray-500 hidden sm:inline">
                Updated {lastUpdated}
              </span>
            )}
            {isUnlocked ? (
              <span className="flex items-center gap-1 text-green-400 text-xs font-semibold">
                <span className="w-2 h-2 bg-green-400 rounded-full inline-block" />
                Pro
              </span>
            ) : (
              <button
                onClick={() => setShowPaywall(true)}
                className="bg-f1red hover:bg-red-700 text-white text-xs font-bold py-1 px-3 rounded-lg transition-colors"
              >
                Unlock Pro
              </button>
            )}
          </div>
        </header>

        {/* ------------------------------------------------------------------ */}
        {/* Main content                                                        */}
        {/* ------------------------------------------------------------------ */}
        <main className="max-w-screen-2xl mx-auto px-4 py-6 space-y-6">
          {/* Driver selector */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
              Select Driver
            </h2>
            <DriverSelector
              drivers={drivers}
              selected={selectedDriver}
              onSelect={setSelectedDriver}
            />
          </section>

          {/* Two-column layout: timing + insights */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Live timing table */}
            <section className="xl:col-span-2 bg-f1gray rounded-2xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Live Timing
                </h2>
                <span className="flex items-center gap-1 text-green-400 text-xs">
                  <span className="w-2 h-2 bg-green-400 rounded-full inline-block animate-pulse" />
                  LIVE
                </span>
              </div>
              <LiveTiming drivers={drivers} />
            </section>

            {/* AI Insights + Discord panel */}
            <section className="xl:col-span-1 flex flex-col gap-4">
              {/* AI feed (paywalled) */}
              <div className="bg-f1gray rounded-2xl p-4 flex flex-col h-96 relative">
                {isUnlocked ? (
                  <AIInsightsFeed
                    token={sessionToken}
                    onUnlockRequired={() => setShowPaywall(true)}
                  />
                ) : (
                  /* Locked overlay */
                  <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center bg-f1gray/95 backdrop-blur-sm z-10">
                    <div className="text-4xl mb-3">🔒</div>
                    <p className="text-sm text-gray-300 mb-4 text-center px-4">
                      Live AI insights are a{" "}
                      <span className="text-f1red font-bold">Pro</span> feature
                    </p>
                    <button
                      onClick={handleInsightRequest}
                      className="bg-f1red hover:bg-red-700 text-white font-bold py-2 px-6 rounded-xl text-sm transition-colors"
                    >
                      Unlock for $2+
                    </button>
                  </div>
                )}
              </div>

              {/* Discord link panel (only visible to Pro users) */}
              {isUnlocked && sessionToken && (
                <DiscordLinkPanel token={sessionToken} />
              )}
            </section>
          </div>
        </main>
      </div>
    </>
  );
}
