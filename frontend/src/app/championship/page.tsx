'use client';

import React from 'react';
import { Zap, ArrowLeft, Trophy } from 'lucide-react';
import Link from 'next/link';

export default function ChampionshipPage() {
  // Mock data for display
  const drivers = [
    { pos: 1, name: "VER", team: "Red Bull Racing", points: 400, wins: 15 },
    { pos: 2, name: "NOR", team: "McLaren", points: 310, wins: 4 },
    { pos: 3, name: "LEC", team: "Ferrari", points: 290, wins: 3 },
    { pos: 4, name: "HAM", team: "Ferrari", points: 250, wins: 2 },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0a0a] text-white font-sans p-6 overflow-hidden">
      <header className="flex items-center gap-4 mb-8 shrink-0">
        <Link href="/" className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition">
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-red-600 drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]" />
          <span className="text-2xl font-black tracking-wider">
            Genie<span className="text-red-600">F1</span>
          </span>
          <span className="ml-4 text-neutral-500 font-bold uppercase tracking-widest text-sm flex items-center gap-2">
            <Trophy className="w-4 h-4" /> Championship Standings
          </span>
        </div>
      </header>

      <div className="flex-1 bg-neutral-900 border border-white/10 rounded-xl p-8 overflow-y-auto">
        <h2 className="text-xl font-black text-white mb-6 uppercase tracking-widest">2026 Drivers Championship</h2>

        <div className="bg-black border border-white/10 rounded-xl overflow-hidden">
          <div className="grid grid-cols-5 bg-white/5 p-4 text-xs font-bold text-neutral-400 uppercase tracking-widest border-b border-white/10">
            <div>Pos</div>
            <div className="col-span-2">Driver</div>
            <div className="text-right">Wins</div>
            <div className="text-right">Points</div>
          </div>

          <div className="flex flex-col">
            {drivers.map(d => (
              <div key={d.pos} className="grid grid-cols-5 p-4 items-center border-b border-white/5 hover:bg-white/5 transition">
                <div className="font-mono text-xl font-black text-neutral-500">{d.pos}</div>
                <div className="col-span-2 flex flex-col">
                  <span className="font-bold text-lg">{d.name}</span>
                  <span className="text-xs text-neutral-500">{d.team}</span>
                </div>
                <div className="text-right font-mono text-neutral-400">{d.wins}</div>
                <div className="text-right font-mono text-xl font-bold text-white">{d.points}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}