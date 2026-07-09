"use client";

import React, { useEffect, useState } from 'react';
import { useEngine } from '../lib/store';
import { Trophy, Medal } from 'lucide-react';
import { getLeague } from '../lib/constants';
import { getLeaderboard, type LeaderboardEntry } from '@/app/actions/leaderboard';

const Leaderboard: React.FC = () => {
  const { profile } = useEngine();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getLeaderboard()
      .then(({ entries: data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err);
        else setEntries(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [profile.totalPoints]); // refetch when current user's points change

  const competitors = entries.map((e) => ({
    id: e.id,
    name: e.name,
    points: e.totalPoints,
    league: getLeague(e.totalPoints),
    isMe: e.isCurrentUser,
  }));

  return (
    <div className="bg-white border-2 border-black rounded-[32px] overflow-hidden shadow-sm">
      <div className="bg-[#1a1a1a] p-6 text-white flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
          <Trophy size={16} className="text-[#FFCE00]" /> Nudge Leaderboard
        </h3>
        <span className="text-[10px] font-bold text-gray-400">By total score</span>
      </div>
      {loading ? (
        <div className="p-8 text-center text-slate-500 text-sm font-medium">Loading…</div>
      ) : error ? (
        <div className="p-8 text-center text-red-600 text-sm font-medium">{error}</div>
      ) : competitors.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm font-medium">No rankings yet.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {competitors.map((user, idx) => (
            <div
              key={user.id}
              className={`flex items-center justify-between p-4 transition-colors ${user.isMe ? 'bg-[#fbf6e1]' : 'hover:bg-gray-50'}`}
            >
              <div className="flex items-center gap-4">
                <div className="w-8 text-center font-black text-gray-400">
                  {idx === 0 ? <Medal size={20} className="text-[#FFCE00] mx-auto" /> : idx + 1}
                </div>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 border-black/10 font-bold ${user.isMe ? 'bg-black text-white' : 'bg-gray-100 text-black'}`}>
                  {user.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-black truncate max-w-[120px]">
                    {user.name} {user.isMe && <span className="ml-1 text-[8px] bg-black text-white px-1 rounded uppercase">You</span>}
                  </p>
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">{user.league} League</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black">{user.points}</p>
                <p className="text-[8px] font-bold text-gray-400 uppercase">Effort Pts</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
