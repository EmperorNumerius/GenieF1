'use client';

import { useState, useEffect } from 'react';
import { Activity, Clock, Zap, Lock, Unlock, MessageSquare } from 'lucide-react';

export default function Home() {
  const [telemetry, setTelemetry] = useState<any>(null);
  const [driver, setDriver] = useState<string>('Car 1');
  const [insight, setInsight] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);

  // Fake session ID for testing purposes.
  // In a real app, this might come from next-auth, clerk, or randomly generated per visitor.
  const [sessionId, setSessionId] = useState<string>('user_12345');

  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/telemetry?driver=${driver}`);
        if (response.ok) {
          const data = await response.json();
          setTelemetry(data);
        }
      } catch (error) {
        console.error('Error fetching telemetry:', error);
      }
    };

    const fetchInsight = async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/insights`, {
          headers: {
            'session-id': sessionId
          }
        });
        if (response.ok) {
          const data = await response.json();
          setInsight(data.insight);
          setIsUnlocked(true);
        } else if (response.status === 403) {
          setIsUnlocked(false);
          setInsight(null);
        }
      } catch (error) {
        console.error('Error fetching insight:', error);
      }
    };

    fetchTelemetry();
    if (isUnlocked) fetchInsight();

    const interval = setInterval(() => {
      fetchTelemetry();
      if (isUnlocked) fetchInsight();
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [driver, sessionId, isUnlocked]);

  // Replace with your actual Stripe Payment Link
  const STRIPE_PAYMENT_LINK = `https://buy.stripe.com/test_dummy_link?client_reference_id=${sessionId}`;

  const handleDevUnlock = async () => {
    await fetch(`http://localhost:8000/api/unlock_dev?session_id=${sessionId}`, { method: 'POST' });
    setIsUnlocked(true);
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 font-sans p-8">
      <div className="max-w-6xl mx-auto space-y-8">

        <header className="flex items-center justify-between border-b border-neutral-800 pb-6">
          <div className="flex items-center gap-3">
            <Zap className="text-red-600 w-8 h-8" />
            <h1 className="text-3xl font-bold tracking-tight">GenieF1 <span className="text-neutral-500 font-light text-xl">Race Engineer</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <label className="text-sm text-neutral-400">Select Driver:</label>
            <select
              value={driver}
              onChange={(e) => setDriver(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 text-white rounded px-3 py-1.5 focus:outline-none focus:border-red-600"
            >
              <option value="Car 1">Verstappen (Car 1)</option>
              <option value="Car 16">Leclerc (Car 16)</option>
              <option value="Car 4">Norris (Car 4)</option>
              <option value="Car 44">Hamilton (Car 44)</option>
            </select>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Telemetry Panel */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-neutral-400" />
              Live Telemetry
            </h2>

            {telemetry ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                  <p className="text-neutral-500 text-sm mb-1">Sector 1</p>
                  <p className="text-2xl font-mono">{telemetry.sector1_time?.toFixed(3) || '---'}s</p>
                </div>
                <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                  <p className="text-neutral-500 text-sm mb-1">Sector 2</p>
                  <p className="text-2xl font-mono">{telemetry.sector2_time?.toFixed(3) || '---'}s</p>
                </div>
                <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                  <p className="text-neutral-500 text-sm mb-1">Sector 3</p>
                  <p className="text-2xl font-mono">{telemetry.sector3_time?.toFixed(3) || '---'}s</p>
                </div>
                <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800 border-l-4 border-l-red-600">
                  <p className="text-neutral-500 text-sm mb-1">Lap Time</p>
                  <p className="text-2xl font-mono">{telemetry.lap_time?.toFixed(3) || '---'}s</p>
                </div>
                <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                  <p className="text-neutral-500 text-sm mb-1">Tire Compound</p>
                  <p className="text-xl">{telemetry.compound || '---'}</p>
                </div>
                <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                  <p className="text-neutral-500 text-sm mb-1">Tire Age</p>
                  <p className="text-xl">{telemetry.tire_age || 0} Laps</p>
                </div>
                <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                  <p className="text-neutral-500 text-sm mb-1">DRS</p>
                  <p className={`text-xl ${telemetry.drs_enabled ? 'text-green-500' : 'text-neutral-500'}`}>
                    {telemetry.drs_enabled ? 'ENABLED' : 'DISABLED'}
                  </p>
                </div>
                <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                  <p className="text-neutral-500 text-sm mb-1">Status</p>
                  <p className="text-xl">{telemetry.status || '---'}</p>
                </div>
              </div>
            ) : (
              <div className="bg-neutral-900 h-64 rounded-xl border border-neutral-800 flex items-center justify-center">
                <p className="text-neutral-500 flex items-center gap-2">
                  <Clock className="w-4 h-4 animate-spin" /> Waiting for telemetry...
                </p>
              </div>
            )}
          </div>

          {/* AI Insights & Discord Panel */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Zap className="w-5 h-5 text-red-500" />
              AI Race Engineer
            </h2>

            <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800 relative overflow-hidden">
              {!isUnlocked ? (
                <div className="absolute inset-0 z-10 bg-neutral-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                  <Lock className="w-12 h-12 text-neutral-500 mb-4" />
                  <h3 className="text-lg font-bold mb-2">Premium Insights Locked</h3>
                  <p className="text-sm text-neutral-400 mb-6">
                    Get real-time AI analysis of telemetry data, tire wear predictions, and strategy suggestions.
                  </p>
                  <a
                    href={STRIPE_PAYMENT_LINK}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                  >
                    Unlock Now (Min $2)
                  </a>
                  <button
                    onClick={handleDevUnlock}
                    className="mt-4 text-xs text-neutral-500 underline"
                  >
                    Dev: Bypass Paywall
                  </button>
                </div>
              ) : null}

              <div className={`space-y-4 ${!isUnlocked ? 'opacity-20 blur-sm select-none' : ''}`}>
                <div className="flex items-center gap-2 text-red-500 mb-4">
                  <Unlock className="w-4 h-4" />
                  <span className="text-sm font-medium uppercase tracking-wider">Live Feed Unlocked</span>
                </div>

                <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                  <p className="font-mono text-sm leading-relaxed">
                    {insight || "Analyzing current lap data..."}
                  </p>
                </div>

                <div className="pt-6 mt-6 border-t border-neutral-800">
                  <h4 className="text-sm font-bold flex items-center gap-2 mb-3">
                    <MessageSquare className="w-4 h-4 text-[#5865F2]" />
                    Broadcast to Discord
                  </h4>
                  <p className="text-xs text-neutral-400 mb-4">
                    Add the bot to your server and run this command in your desired channel:
                  </p>
                  <code className="block bg-neutral-950 p-3 rounded text-[#5865F2] text-sm border border-neutral-800 font-mono">
                    !link {sessionId}
                  </code>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
