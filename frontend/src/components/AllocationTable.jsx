import React from 'react';
import { Table, AlertCircle, ArrowUpRight, ArrowDownRight, CheckCircle2 } from 'lucide-react';

export default function AllocationTable({ allocations, diff, selectedZoneId, onSelectZone }) {
  if (!allocations || allocations.length === 0) {
    return (
      <div className="bg-[#0D1322]/85 backdrop-blur-xl border border-[#212C44] rounded-xl p-4 text-xs text-slate-500 text-center py-6">
        No active allocations. Generate a plan to view deterministic resource assignments.
      </div>
    );
  }

  // Find diff per zone if diff is present
  const diffMap = {};
  if (diff?.allocation_diffs) {
    diff.allocation_diffs.forEach(d => {
      diffMap[d.zone_id] = d;
    });
  }

  return (
    <div className="bg-[#0D1322]/85 backdrop-blur-xl border border-[#212C44] rounded-xl p-4 shadow-xl overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Table className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
            Deterministic Resource Allocation Matrix
          </h2>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          Strict Invariant: Σ(Allocated) ≤ Pool
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[#1E2638] text-slate-400 uppercase tracking-wider text-[10px] font-mono bg-[#070A12]">
              <th className="py-2.5 px-3">Zone / Sector</th>
              <th className="py-2.5 px-3">Priority</th>
              <th className="py-2.5 px-3">Ambulances</th>
              <th className="py-2.5 px-3">Evac Vehicles</th>
              <th className="py-2.5 px-3">Field Medics</th>
              <th className="py-2.5 px-3">Shelter Assigned</th>
              <th className="py-2.5 px-3">Unmet Demand</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E2638]/70 font-mono">
            {allocations.map((row) => {
              const isSelected = selectedZoneId === row.zone_id;
              const zoneDiff = diffMap[row.zone_id];
              const isNewlyAdded = diff?.newly_added_zones?.includes(row.zone_id);

              return (
                <tr
                  key={row.zone_id}
                  onClick={() => onSelectZone(row.zone_id)}
                  className={`hover:bg-[#151D30] cursor-pointer transition-colors ${
                    isSelected ? 'bg-violet-950/40 border-l-2 border-violet-500' : ''
                  } ${isNewlyAdded ? 'bg-purple-950/30' : ''}`}
                >
                  {/* Zone Name */}
                  <td className="py-3 px-3 font-sans font-semibold text-white">
                    <div className="flex items-center gap-2">
                      <span>{row.zone_name}</span>
                      {isNewlyAdded && (
                        <span className="bg-purple-600 text-white text-[9px] px-1.5 py-0.2 rounded font-bold uppercase">
                          NEW
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Priority */}
                  <td className="py-3 px-3">
                    <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded text-[11px] font-bold">
                      #{row.priority_rank} ({row.priority_score.toFixed(1)})
                    </span>
                  </td>

                  {/* Ambulances */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-bold ${row.ambulances.unmet > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {row.ambulances.allocated}
                      </span>
                      <span className="text-slate-500">/ {row.ambulances.requested}</span>
                      {zoneDiff && zoneDiff.ambulance_diff !== 0 && (
                        <span className={`text-[10px] px-1 rounded flex items-center ${
                          zoneDiff.ambulance_diff > 0 ? 'text-emerald-400 bg-emerald-950/50' : 'text-rose-400 bg-rose-950/50'
                        }`}>
                          {zoneDiff.ambulance_diff > 0 ? `+${zoneDiff.ambulance_diff}` : zoneDiff.ambulance_diff}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Vehicles */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-bold ${row.evacuation_vehicles.unmet > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {row.evacuation_vehicles.allocated}
                      </span>
                      <span className="text-slate-500">/ {row.evacuation_vehicles.requested}</span>
                      {zoneDiff && zoneDiff.vehicle_diff !== 0 && (
                        <span className={`text-[10px] px-1 rounded flex items-center ${
                          zoneDiff.vehicle_diff > 0 ? 'text-emerald-400 bg-emerald-950/50' : 'text-rose-400 bg-rose-950/50'
                        }`}>
                          {zoneDiff.vehicle_diff > 0 ? `+${zoneDiff.vehicle_diff}` : zoneDiff.vehicle_diff}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Medics */}
                  <td className="py-3 px-3">
                    <span className="text-emerald-400 font-bold">{row.medics.allocated}</span>
                    <span className="text-slate-500"> / {row.medics.requested}</span>
                  </td>

                  {/* Shelters */}
                  <td className="py-3 px-3">
                    <div className="text-[11px] text-slate-300">
                      {row.shelter_assignments && row.shelter_assignments.length > 0 ? (
                        row.shelter_assignments.map((sa, i) => (
                          <div key={i} className="flex items-center gap-1 text-slate-200">
                            <span className="text-emerald-400 font-bold">{sa.evacuees_assigned}</span>
                            <span className="text-slate-400">→ {sa.shelter_name.split('(')[0]}</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-slate-500">No shelter</span>
                      )}
                    </div>
                  </td>

                  {/* Unmet Demand Highlight */}
                  <td className="py-3 px-3">
                    {row.ambulances.unmet > 0 || row.evacuees_unmet > 0 || row.evacuation_vehicles.unmet > 0 ? (
                      <div className="space-y-0.5">
                        {row.ambulances.unmet > 0 && (
                          <span className="bg-red-950/80 text-red-300 border border-red-800/60 text-[10px] px-1.5 py-0.5 rounded font-bold inline-block mr-1">
                            {row.ambulances.unmet} amb unmet
                          </span>
                        )}
                        {row.evacuees_unmet > 0 && (
                          <span className="bg-amber-950/80 text-amber-300 border border-amber-800/60 text-[10px] px-1.5 py-0.5 rounded font-bold inline-block">
                            {row.evacuees_unmet} evac overflow
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-emerald-400/80 text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Demand Met
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
