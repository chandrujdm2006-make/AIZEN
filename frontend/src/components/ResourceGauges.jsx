import React from 'react';
import { Truck, Ambulance, Stethoscope, Home, AlertCircle } from 'lucide-react';

export default function ResourceGauges({ resourceSummaries, shelterStatuses, pool }) {
  // If plan not yet run, show baseline pool counts
  const ambSummary = resourceSummaries?.find(s => s.resource === 'ambulances');
  const vehSummary = resourceSummaries?.find(s => s.resource === 'evacuation_vehicles');
  const medSummary = resourceSummaries?.find(s => s.resource === 'medics');

  const ambAllocated = ambSummary ? ambSummary.total_allocated : 0;
  const ambTotal = ambSummary ? ambSummary.total_pool : (pool?.ambulances || 3);
  const ambUnmet = ambSummary ? ambSummary.total_unmet : 0;
  const ambPct = ambTotal > 0 ? (ambAllocated / ambTotal) * 100 : 0;

  const vehAllocated = vehSummary ? vehSummary.total_allocated : 0;
  const vehTotal = vehSummary ? vehSummary.total_pool : (pool?.evacuation_vehicles || 5);
  const vehUnmet = vehSummary ? vehSummary.total_unmet : 0;
  const vehPct = vehTotal > 0 ? (vehAllocated / vehTotal) * 100 : 0;

  const medAllocated = medSummary ? medSummary.total_allocated : 0;
  const medTotal = medSummary ? medSummary.total_pool : (pool?.medics || 6);
  const medUnmet = medSummary ? medSummary.total_unmet : 0;
  const medPct = medTotal > 0 ? (medAllocated / medTotal) * 100 : 0;

  const totalShelterCap = shelterStatuses?.reduce((acc, s) => acc + s.capacity, 0) || 250;
  const totalShelterOcc = shelterStatuses?.reduce((acc, s) => acc + s.allocated_count, 0) || 0;
  const shelterPct = totalShelterCap > 0 ? (totalShelterOcc / totalShelterCap) * 100 : 0;

  const items = [
    {
      title: 'Ambulance Units',
      icon: Ambulance,
      allocated: ambAllocated,
      total: ambTotal,
      unmet: ambUnmet,
      pct: ambPct,
      accentColor: 'rose',
    },
    {
      title: 'Evac Vehicles (Cap 20)',
      icon: Truck,
      allocated: vehAllocated,
      total: vehTotal,
      unmet: vehUnmet,
      pct: vehPct,
      accentColor: 'blue',
    },
    {
      title: 'Field Medics',
      icon: Stethoscope,
      allocated: medAllocated,
      total: medTotal,
      unmet: medUnmet,
      pct: medPct,
      accentColor: 'emerald',
    },
    {
      title: 'Shelter Capacity',
      icon: Home,
      allocated: totalShelterOcc,
      total: totalShelterCap,
      unmet: 0,
      pct: shelterPct,
      accentColor: 'amber',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((item, idx) => {
        const isSaturated = item.pct >= 100;
        const Icon = item.icon;

        return (
          <div
            key={idx}
            className={`p-3.5 rounded-xl border transition-all ${
              isSaturated
                ? 'bg-red-950/20 border-red-500/40 shadow-sm shadow-red-900/20'
                : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${isSaturated ? 'bg-red-900/40 text-red-400' : 'bg-slate-800 text-slate-300'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-slate-300">
                  {item.title}
                </span>
              </div>
              {item.unmet > 0 && (
                <span className="bg-red-900/60 text-red-300 border border-red-700/50 text-[10px] font-mono px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                  <AlertCircle className="w-2.5 h-2.5" />
                  {item.unmet} unmet
                </span>
              )}
            </div>

            {/* Counts */}
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="flex items-baseline gap-1">
                <span className={`text-xl font-bold font-mono ${isSaturated ? 'text-red-400' : 'text-white'}`}>
                  {item.allocated}
                </span>
                <span className="text-xs text-slate-500 font-mono">/ {item.total}</span>
              </div>
              <span className={`text-xs font-mono font-medium ${isSaturated ? 'text-red-400' : 'text-slate-400'}`}>
                {Math.round(item.pct)}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  isSaturated
                    ? 'bg-red-500 shadow-sm shadow-red-500/50'
                    : item.pct > 70
                    ? 'bg-amber-400'
                    : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(100, item.pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
