import React, { useState } from 'react';
import { 
  Award, 
  Users, 
  HeartPulse, 
  Truck, 
  Ambulance, 
  Home, 
  CheckCircle2, 
  AlertTriangle,
  ExternalLink,
  Settings,
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles
} from 'lucide-react';

export default function PriorityList({ 
  zonesRanked, 
  allocations = [], 
  rawZones = [], 
  selectedZoneId, 
  onSelectZone,
  onEditZone 
}) {
  if (!zonesRanked || zonesRanked.length === 0) {
    return (
      <div className="bg-[#0D1322]/80 backdrop-blur-xl border border-[#212C44] rounded-xl p-6 text-center text-xs text-slate-400 font-mono">
        <Award className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        No ranked sectors. Click <strong className="text-violet-400">Generate Plan</strong> to calculate triage scores.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between pb-1 border-b border-[#1E2638]">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-violet-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-white font-mono">
            Zone Priority Ranking (Triage Hierarchy)
          </h2>
        </div>
        <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/80 border border-cyan-700/60 px-2 py-0.5 rounded-full shadow-sm shadow-cyan-900/30">
          {zonesRanked.length} Sectors
        </span>
      </div>

      {/* Cards List */}
      <div className="space-y-3">
        {zonesRanked.map((zone) => {
          const isSelected = selectedZoneId === zone.zone_id;

          const alloc = allocations.find(a => a.zone_id === zone.zone_id);
          const rawZ = rawZones.find(rz => rz.id === zone.zone_id);

          const pop = rawZ?.population || 400;
          const injured = rawZ?.injured || 20;
          const evacDemand = rawZ?.evacuation_demand || 60;
          const critPatients = rawZ?.critical_patients || 5;

          const assignedVehicles = alloc?.evacuation_vehicles?.allocated || 0;
          const evacCap = assignedVehicles * 20;
          const evacCovered = Math.min(evacDemand, evacCap);
          const evacPct = evacDemand > 0 ? Math.round((evacCovered / evacDemand) * 100) : 100;

          const assignedAmb = alloc?.ambulances?.allocated || 0;
          const ambCap = assignedAmb * 2;
          const medCovered = Math.min(critPatients, ambCap);
          const medPct = critPatients > 0 ? Math.round((medCovered / critPatients) * 100) : 100;

          const shelteredCount = alloc?.evacuees_sheltered || evacCovered;
          const shelterPct = evacDemand > 0 ? Math.round((shelteredCount / evacDemand) * 100) : 100;

          const isDeficit = (alloc?.ambulances?.unmet || 0) > 0 || (alloc?.evacuation_vehicles?.unmet || 0) > 0 || evacPct < 100 || medPct < 100;

          const statusBadge = isDeficit
            ? { text: 'CRITICAL DEFICIT', color: 'red', icon: AlertTriangle }
            : { text: 'ON TRACK ✓', color: 'emerald', icon: CheckCircle2 };
          const StatusIcon = statusBadge.icon;

          const rankColors = {
            1: 'bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 border-violet-400 text-white shadow-sm shadow-violet-500/40',
            2: 'bg-indigo-950 border-indigo-700/80 text-cyan-300',
            3: 'bg-slate-900 border-slate-700 text-slate-300',
            4: 'bg-slate-900/60 border-slate-800 text-slate-400',
            5: 'bg-slate-900/40 border-slate-800 text-slate-500',
          };

          return (
            <div
              key={zone.zone_id}
              onClick={() => onSelectZone && onSelectZone(zone.zone_id)}
              className={`p-3.5 rounded-xl border bg-[#0D1322]/85 backdrop-blur-xl transition-all duration-300 cursor-pointer shadow-lg hover:-translate-y-0.5 hover:shadow-2xl ${
                isSelected
                  ? 'border-violet-500 ring-2 ring-violet-500/40 shadow-violet-900/30'
                  : 'border-[#212C44] hover:border-violet-500/50'
              }`}
            >
              {/* Top Row: #Rank and Zone Name */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-lg border font-mono font-bold text-xs flex items-center justify-center ${rankColors[zone.rank] || rankColors[3]}`}>
                    #{zone.rank}
                  </span>
                  <span className="text-xs font-bold text-white tracking-wide">
                    {zone.zone_name}
                  </span>
                </div>

                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  statusBadge.color === 'red'
                    ? 'bg-red-950/80 text-rose-300 border border-red-700/60'
                    : 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                }`}>
                  <StatusIcon className="w-2.5 h-2.5" />
                  {statusBadge.text}
                </span>
              </div>

              {/* Priority Score Bar */}
              <div className="mb-3 space-y-1">
                <div className="flex justify-between items-baseline text-[11px] font-mono">
                  <span className="text-slate-400">Priority Score:</span>
                  <span className="font-bold text-cyan-300 bg-cyan-950/40 px-1.5 py-0.2 rounded border border-cyan-800/40">
                    {zone.score.toFixed(1)} / 100
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-900/90 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      zone.rank === 1
                        ? 'bg-gradient-to-r from-violet-500 via-purple-500 to-cyan-400'
                        : zone.rank === 2
                        ? 'bg-gradient-to-r from-indigo-500 to-cyan-400'
                        : 'bg-gradient-to-r from-emerald-400 to-teal-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, zone.score))}%` }}
                  />
                </div>
              </div>

              {/* Demographics Row */}
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 bg-slate-950/70 p-2 rounded-lg mb-2.5 border border-[#1E2638]">
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3 text-cyan-400" />
                  <span>Pop: <strong>{pop}</strong></span>
                </div>
                <span className="text-slate-700">|</span>
                <div className="flex items-center gap-1">
                  <HeartPulse className="w-3 h-3 text-amber-400" />
                  <span>Injured: <strong>{injured}</strong></span>
                </div>
                <span className="text-slate-700">|</span>
                <div className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  <span>Crit: <strong className="text-rose-300">{critPatients}</strong></span>
                </div>
              </div>

              {/* Resource Coverage Metrics */}
              <div className="space-y-1.5 text-[11px] font-mono text-slate-300 mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-slate-400">
                    <Truck className="w-3 h-3 text-violet-400" />
                    <span>Evacuated:</span>
                  </div>
                  <span className={`font-bold ${evacPct < 100 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {evacCovered}/{evacDemand} ({evacPct}%)
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-slate-400">
                    <Ambulance className="w-3 h-3 text-rose-400" />
                    <span>Medical Transport:</span>
                  </div>
                  <span className={`font-bold ${medPct < 100 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {assignedAmb} amb ({medCovered}/{critPatients} crit)
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-slate-400">
                    <Home className="w-3 h-3 text-cyan-400" />
                    <span>Sheltered:</span>
                  </div>
                  <span className="font-bold text-cyan-300">
                    {shelteredCount}/{evacDemand} ({shelterPct}%)
                  </span>
                </div>
              </div>

              {/* Card Footer: Est. Completion & Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-[#1E2638] text-[11px] font-mono">
                <span className="text-slate-400 flex items-center gap-1 text-[10px]">
                  <Clock className="w-3 h-3 text-slate-500" />
                  Est. Completion: ~15m
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSelectZone) onSelectZone(zone.zone_id);
                    }}
                    className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors text-[10px] border border-slate-800"
                  >
                    <span>View</span>
                    <ExternalLink className="w-2.5 h-2.5 text-cyan-400" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onEditZone) onEditZone(zone.zone_id);
                    }}
                    className="px-2 py-0.5 rounded bg-violet-950/80 hover:bg-violet-900 border border-violet-700/60 text-violet-300 hover:text-violet-200 flex items-center gap-1 cursor-pointer transition-colors text-[10px]"
                  >
                    <Settings className="w-2.5 h-2.5" />
                    <span>Edit</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
