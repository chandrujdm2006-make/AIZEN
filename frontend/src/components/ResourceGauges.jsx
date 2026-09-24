import React from 'react';
import { 
  Truck, 
  Ambulance, 
  Stethoscope, 
  Home, 
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertTriangle
} from 'lucide-react';

export default function ResourceGauges({ resourceSummaries, shelterStatuses, pool }) {
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

  const totalShelterCap = shelterStatuses?.reduce((acc, s) => acc + s.capacity, 0) || (pool?.shelters?.reduce((a, s) => a + s.capacity, 0) || 450);
  const totalShelterOcc = shelterStatuses?.reduce((acc, s) => acc + s.allocated_count, 0) || 0;
  const shelterPct = totalShelterCap > 0 ? (totalShelterOcc / totalShelterCap) * 100 : 0;

  const getStatus = (pct, unmet) => {
    if (unmet > 0) return { label: 'CRITICAL DEFICIT', color: 'red', icon: AlertTriangle };
    if (pct >= 100) return { label: 'SATURATED', color: 'amber', icon: AlertCircle };
    if (pct >= 75) return { label: 'HIGH LOAD', color: 'amber', icon: AlertCircle };
    return { label: 'OPTIMAL', color: 'emerald', icon: CheckCircle2 };
  };

  const cards = [
    {
      title: 'AMBULANCE UNITS',
      icon: Ambulance,
      allocated: ambAllocated,
      total: ambTotal,
      unit: 'units',
      unmet: ambUnmet,
      pct: ambPct,
      gradient: 'from-rose-500/10 via-rose-500/5 to-transparent',
      borderColor: 'border-rose-500/30 hover:border-rose-500/60',
      barGradient: 'from-rose-500 to-red-600',
      iconColor: 'text-rose-400 bg-rose-950/60',
    },
    {
      title: 'EVACUATION VEHICLES',
      subtitle: 'CAPACITY 20',
      icon: Truck,
      allocated: vehAllocated,
      total: vehTotal,
      unit: 'buses',
      unmet: vehUnmet,
      pct: vehPct,
      gradient: 'from-blue-500/10 via-blue-500/5 to-transparent',
      borderColor: 'border-blue-500/30 hover:border-blue-500/60',
      barGradient: 'from-blue-500 to-indigo-600',
      iconColor: 'text-blue-400 bg-blue-950/60',
    },
    {
      title: 'FIELD MEDICS',
      icon: Stethoscope,
      allocated: medAllocated,
      total: medTotal,
      unit: 'medics',
      unmet: medUnmet,
      pct: medPct,
      gradient: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
      borderColor: 'border-emerald-500/30 hover:border-emerald-500/60',
      barGradient: 'from-emerald-500 to-teal-600',
      iconColor: 'text-emerald-400 bg-emerald-950/60',
    },
    {
      title: 'SHELTER CAPACITY',
      icon: Home,
      allocated: totalShelterOcc,
      total: totalShelterCap,
      unit: 'beds',
      unmet: 0,
      pct: shelterPct,
      gradient: 'from-cyan-500/10 via-cyan-500/5 to-transparent',
      borderColor: 'border-cyan-500/30 hover:border-cyan-500/60',
      barGradient: 'from-cyan-500 to-blue-600',
      iconColor: 'text-cyan-400 bg-cyan-950/60',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        const status = getStatus(card.pct, card.unmet);
        const StatusIcon = status.icon;

        return (
          <div
            key={idx}
            className={`relative p-4 rounded-xl border bg-gradient-to-b ${card.gradient} bg-[#1E293B]/70 backdrop-blur-md ${card.borderColor} shadow-lg hover:-translate-y-0.5 hover:shadow-xl transition-all duration-200 group`}
          >
            {/* Top row: Title + Icon */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${card.iconColor} border border-white/5 shadow-inner`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold tracking-wider font-mono text-white flex items-center gap-1.5">
                    {card.title}
                  </h3>
                  {card.subtitle && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      {card.subtitle}
                    </span>
                  )}
                </div>
              </div>

              {/* Status Badge */}
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                status.color === 'red'
                  ? 'bg-red-950 text-red-300 border border-red-700/60 animate-pulse'
                  : status.color === 'amber'
                  ? 'bg-amber-950 text-amber-300 border border-amber-700/60'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
              }`}>
                <StatusIcon className="w-2.5 h-2.5" />
                {status.label}
              </span>
            </div>

            {/* Middle: Large stats numbers & percentage */}
            <div className="flex items-baseline justify-between mb-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black font-mono tracking-tight text-white">
                  {card.allocated}
                </span>
                <span className="text-sm font-semibold text-slate-400 font-mono">
                  / {card.total} {card.unit}
                </span>
              </div>
              <span className="text-sm font-bold font-mono text-cyan-300">
                {Math.round(card.pct)}%
              </span>
            </div>

            {/* Smooth Progress Bar with Gradient Fill */}
            <div className="w-full h-2 bg-slate-800/80 rounded-full overflow-hidden mb-3 border border-slate-700/40">
              <div
                className={`h-full bg-gradient-to-r ${card.barGradient} rounded-full transition-all duration-700 ease-out shadow-sm`}
                style={{ width: `${Math.min(100, Math.max(0, card.pct))}%` }}
              />
            </div>

            {/* Bottom info row: Availability & timestamp */}
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
              <span className="flex items-center gap-1 text-slate-300">
                {card.unmet > 0 ? (
                  <span className="text-rose-400 font-bold">
                    ⚠️ {card.unmet} unmet demand
                  </span>
                ) : (
                  <span className="text-emerald-400">
                    ✓ All assigned safely
                  </span>
                )}
              </span>

              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <Clock className="w-2.5 h-2.5" />
                Just now
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
