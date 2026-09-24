import React, { useState } from 'react';
import { ChevronDown, ChevronUp, AlertCircle, Award, BarChart3 } from 'lucide-react';

export default function PriorityList({ zonesRanked, selectedZoneId, onSelectZone }) {
  const [expandedZoneId, setExpandedZoneId] = useState(null);

  if (!zonesRanked || zonesRanked.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-500 text-center py-8">
        Run "Generate Plan" to compute transparent priority scores and factor breakdowns.
      </div>
    );
  }

  const toggleExpand = (zid, e) => {
    e.stopPropagation();
    setExpandedZoneId(expandedZoneId === zid ? null : zid);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Prioritized Sectors (0-100 Score)
          </h2>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          Deterministic Weighted Formula
        </span>
      </div>

      <div className="space-y-2">
        {zonesRanked.map((zone) => {
          const isSelected = selectedZoneId === zone.zone_id;
          const isExpanded = expandedZoneId === zone.zone_id;
          const bd = zone.breakdown;

          return (
            <div
              key={zone.zone_id}
              onClick={() => onSelectZone(zone.zone_id)}
              className={`rounded-lg border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-950/30 border-blue-500/60 shadow-md shadow-blue-900/20'
                  : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-6 h-6 rounded flex items-center justify-center font-mono font-bold text-xs ${
                    zone.rank === 1 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                    zone.rank === 2 ? 'bg-slate-700/50 text-slate-200 border border-slate-600' :
                    'bg-slate-800 text-slate-400'
                  }`}>
                    #{zone.rank}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">
                      {zone.zone_name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      ID: {zone.zone_id}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-bold font-mono text-cyan-300">
                      {zone.score.toFixed(1)}
                    </div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider">
                      Index
                    </div>
                  </div>

                  <button
                    onClick={(e) => toggleExpand(zone.zone_id, e)}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                    title="Toggle mathematical breakdown"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Expandable Factor Breakdown */}
              {isExpanded && bd && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-800/80 bg-slate-900/80 text-[11px] space-y-1.5 font-mono">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1 font-sans font-semibold mb-1">
                    <BarChart3 className="w-3 h-3 text-blue-400" />
                    Weighted Factor Breakdown:
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-slate-300">
                    <div className="flex justify-between bg-slate-950/60 p-1.5 rounded">
                      <span>Flood Severity (30%):</span>
                      <span className="text-amber-300 font-bold">{bd.severity_component.toFixed(1)} pts</span>
                    </div>
                    <div className="flex justify-between bg-slate-950/60 p-1.5 rounded">
                      <span>Critical Patients (25%):</span>
                      <span className="text-rose-400 font-bold">{bd.critical_patients_component.toFixed(1)} pts</span>
                    </div>
                    <div className="flex justify-between bg-slate-950/60 p-1.5 rounded">
                      <span>Vulnerable Pop (15%):</span>
                      <span className="text-blue-300 font-bold">{bd.vulnerable_component.toFixed(1)} pts</span>
                    </div>
                    <div className="flex justify-between bg-slate-950/60 p-1.5 rounded">
                      <span>Affected Pop (15%):</span>
                      <span className="text-emerald-300 font-bold">{bd.population_component.toFixed(1)} pts</span>
                    </div>
                    <div className="flex justify-between bg-slate-950/60 p-1.5 rounded col-span-2">
                      <span>Evacuation Demand (15%):</span>
                      <span className="text-purple-300 font-bold">{bd.evac_demand_component.toFixed(1)} pts</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
