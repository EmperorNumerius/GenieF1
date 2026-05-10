'use client';

import React, { useState, useEffect } from 'react';
import { useRaceData, CarState } from '../hooks/useRaceData';
import { fetchApi } from '../lib/api';

import { Header } from '../components/Header';
import { TrackMap } from '../components/TrackMap';
import { SidebarStandings } from '../components/SidebarStandings';
import { GapChart } from '../components/GapChart';
import { WeatherPanel } from '../components/WeatherPanel';
import { LapCounter } from '../components/LapCounter';
import { RaceControlBanner } from '../components/RaceControlBanner';
import { AIInsightsPanel } from '../components/AIInsightsPanel';
import { MonteCarloPanel } from '../components/MonteCarloPanel';
import { DriverCard } from '../components/DriverCard';

export default function DashboardPage() {
  const { data: raceState, status } = useRaceData();
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Check URL for stripe session_id on mount to unlock
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session_id');
    if (sid) {
      setTimeout(() => {
        setSessionId(sid);
        setIsUnlocked(true);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }, 0);
    }
  }, []);

  const handleUnlockClick = async () => {
    try {
      const res = await fetchApi<{ url: string }>('/api/create_checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success_url: window.location.origin + window.location.pathname,
          cancel_url: window.location.origin + window.location.pathname,
        }),
      });
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (e) {
      console.error("Failed to create checkout session", e);
      // Fallback to dev unlock if checkout fails (e.g. if Stripe is mocked)
      const fakeSid = "dev-session-" + Date.now();
      await fetchApi(`/api/unlock_dev?session_id=${fakeSid}`, { method: 'POST' }).catch(() => {});
      setSessionId(fakeSid);
      setIsUnlocked(true);
    }
  };

  const selectedCar = raceState?.cars?.find(c => c.id === selectedDriverId) || null;

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0a0a] text-white font-sans overflow-hidden select-none">
      <Header
        raceState={raceState}
        connected={status === 'connected'}
        isUnlocked={isUnlocked}
        onUnlockClick={handleUnlockClick}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <SidebarStandings
          raceState={raceState}
          selectedDriverId={selectedDriverId}
          onSelectDriver={setSelectedDriverId}
        />

        {/* Main Center Area */}
        <div className="flex-1 flex flex-col relative min-w-0">

          <div className="absolute top-4 left-4 z-10 flex gap-4 pointer-events-auto">
            <WeatherPanel raceState={raceState} />
            <LapCounter raceState={raceState} />
          </div>

          <TrackMap
            trackOutline={raceState?.trackOutline || []}
            cars={raceState?.cars || []}
            positionTrails={{}}
            selectedDriver={selectedDriverId ? parseInt(selectedDriverId) : null}
            onSelectDriver={(n) => setSelectedDriverId(n.toString())}
            circuitName={raceState?.session?.circuit}
          />

          {selectedCar && (
            <div className="absolute bottom-16 left-4 z-20 pointer-events-auto">
               <DriverCard car={selectedCar} onClose={() => setSelectedDriverId(null)} />
            </div>
          )}

          <div className="absolute bottom-4 left-4 right-4 z-10 pointer-events-auto">
             <RaceControlBanner raceState={raceState} />
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-80 bg-black border-l border-white/10 flex flex-col p-4 gap-4 overflow-y-auto custom-scrollbar">
          <div className="h-64 shrink-0">
             <GapChart raceState={raceState} />
          </div>

          <AIInsightsPanel
            raceState={raceState}
            selectedCar={selectedCar}
            isUnlocked={isUnlocked}
            onUnlockClick={handleUnlockClick}
            sessionId={sessionId}
          />

          <MonteCarloPanel isUnlocked={isUnlocked} />
        </div>
      </div>
    </div>
  );
}