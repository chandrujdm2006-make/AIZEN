import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import {
  Sliders,
  SlidersHorizontal,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Activity,
  RefreshCw,
  RotateCcw,
  Users,
  Waves,
  HeartPulse,
  Truck,
  Ambulance,
  Stethoscope,
  Home,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Lock,
  Unlock,
  Layers,
  ChevronRight,
  Info,
  Zap,
  SlidersVertical,
  Check,
  X
} from 'lucide-react';

// Weights matching Coordinator formula
const DEFAULT_WEIGHTS = {
  severity: 0.30,
  critical_patients: 0.25,
  vulnerable_population: 0.15,
  population: 0.15,
  evacuation_demand: 0.15,
};

// Calculate client-side live priority score
function calculatePriorityScore(z) {
  if (z.priority_override !== null && z.priority_override !== undefined && z.priority_override !== '') {
    return Math.min(100, Math.max(0, parseFloat(z.priority_override) || 0));
  }
  const sevScore = Math.min(100, (Number(z.flood_severity || 1) / 10.0) * 100.0);
  const critScore = Math.min(100, (Number(z.critical_patients || 0) / 15.0) * 100.0);
  const vulnScore = Math.min(100, ((Number(z.population || 0) * (Number(z.vulnerable_percent || 0) / 100.0)) / 150.0) * 100.0);
  const popScore = Math.min(100, (Number(z.population || 0) / 800.0) * 100.0);
  const evacScore = Math.min(100, (Number(z.evacuation_demand || 0) / 120.0) * 100.0);

  const total = (
    sevScore * DEFAULT_WEIGHTS.severity +
    critScore * DEFAULT_WEIGHTS.critical_patients +
    vulnScore * DEFAULT_WEIGHTS.vulnerable_population +
    popScore * DEFAULT_WEIGHTS.population +
    evacScore * DEFAULT_WEIGHTS.evacuation_demand
  );
  return Math.round(Math.min(100, Math.max(0, total)) * 10) / 10;
}

export default function DynamicControlPanel({ onPlanUpdated }) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [commanderName, setCommanderName] = useState('Commander Shepard');
  const [autoReplan, setAutoReplan] = useState(false);
  const [allocationMode, setAllocationMode] = useState('auto'); // 'auto' | 'manual'
  const [activeZoneTab, setActiveZoneTab] = useState('zone_a');
  const [toastMessage, setToastMessage] = useState(null);

  // Core State
  const [zones, setZones] = useState([]);
  const [resources, setResources] = useState({
    ambulances: 3,
    evacuation_vehicles: 5,
    medics: 6,
    shelter_capacity: 450,
  });
  const [manualAllocations, setManualAllocations] = useState({});
  const [serverAllocations, setServerAllocations] = useState([]);
  const [previousSnapshot, setPreviousSnapshot] = useState(null);
  const [diffData, setDiffData] = useState(null);
  const [serverConflicts, setServerConflicts] = useState([]);

  const debounceTimerRef = useRef(null);

  // Fetch initial control panel state
  useEffect(() => {
    fetchControlPanelState();
  }, []);

  const fetchControlPanelState = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/control-panel/state');
      const data = res.data;

      const formattedZones = (data.zones || []).map(z => ({
        id: z.id,
        name: z.name,
        population: z.population,
        evacuation_demand: z.evacuation_demand,
        injured: z.injured,
        critical_patients: z.critical_patients,
        flood_severity: z.flood_severity > 5 ? z.flood_severity : (z.flood_severity * 2), // map 1-5 to 1-10 on initial load
        vulnerable_percent: z.vulnerable_percent ?? (z.population > 0 ? Math.round((z.vulnerable_population / z.population) * 100) : 25),
        priority_override: z.priority_override ?? null,
        isOverrideActive: z.priority_override !== null && z.priority_override !== undefined,
      }));

      setZones(formattedZones);
      setResources({
        ambulances: data.resource_pool?.ambulances ?? 3,
        evacuation_vehicles: data.resource_pool?.evacuation_vehicles ?? 5,
        medics: data.resource_pool?.medics ?? 6,
        shelter_capacity: data.total_shelter_capacity ?? 450,
      });

      // Populate manual allocations mapping from current allocations
      const allocMap = {};
      (data.current_allocations || []).forEach(a => {
        allocMap[a.zone_id] = {
          assigned_ambulances: a.ambulances?.allocated || 0,
          assigned_evacuation_vehicles: a.evacuation_vehicles?.allocated || 0,
          assigned_medics: a.medics?.allocated || 0,
          assigned_shelter_spaces: a.evacuees_sheltered || 0,
        };
      });

      // If any zones missing in allocMap, default to 0
      formattedZones.forEach(z => {
        if (!allocMap[z.id]) {
          allocMap[z.id] = {
            assigned_ambulances: 0,
            assigned_evacuation_vehicles: 0,
            assigned_medics: 0,
            assigned_shelter_spaces: 0,
          };
        }
      });

      setManualAllocations(allocMap);
      setServerAllocations(data.current_allocations || []);
      setServerConflicts(data.conflicts || []);

      // Save initial snapshot for Before / After comparison
      if (!previousSnapshot) {
        setPreviousSnapshot({
          zones: JSON.parse(JSON.stringify(formattedZones)),
          resources: { ...data.resource_pool, shelter_capacity: data.total_shelter_capacity },
          allocations: JSON.parse(JSON.stringify(allocMap)),
        });
      }
    } catch (err) {
      console.error('Failed to load control panel state:', err);
    } finally {
      setLoading(false);
    }
  };

  // Live Calculated Priorities & Ranks
  const calculatedZones = useMemo(() => {
    return zones.map(z => {
      const score = calculatePriorityScore(z);
      return {
        ...z,
        currentScore: score,
      };
    }).sort((a, b) => b.currentScore - a.currentScore)
      .map((z, idx) => ({ ...z, currentRank: idx + 1 }));
  }, [zones]);

  // Live Totals for Resource Pool & Assigned
  const assignedTotals = useMemo(() => {
    let amb = 0, veh = 0, med = 0, she = 0;
    Object.values(manualAllocations).forEach(a => {
      amb += Number(a.assigned_ambulances || 0);
      veh += Number(a.assigned_evacuation_vehicles || 0);
      med += Number(a.assigned_medics || 0);
      she += Number(a.assigned_shelter_spaces || 0);
    });
    return { amb, veh, med, she };
  }, [manualAllocations]);

  // Real-time Resource Utilization %
  const utilization = useMemo(() => {
    const ambPct = resources.ambulances > 0 ? (assignedTotals.amb / resources.ambulances) * 100 : 0;
    const vehPct = resources.evacuation_vehicles > 0 ? (assignedTotals.veh / resources.evacuation_vehicles) * 100 : 0;
    const medPct = resources.medics > 0 ? (assignedTotals.med / resources.medics) * 100 : 0;
    const shePct = resources.shelter_capacity > 0 ? (assignedTotals.she / resources.shelter_capacity) * 100 : 0;
    return {
      ambulances: Math.round(ambPct * 10) / 10,
      evacuation_vehicles: Math.round(vehPct * 10) / 10,
      medics: Math.round(medPct * 10) / 10,
      shelter: Math.round(shePct * 10) / 10,
    };
  }, [assignedTotals, resources]);

  // Live Constraint Conflicts & Warnings
  const liveConflicts = useMemo(() => {
    const list = [];
    // 1. Over-allocation hard constraint checks
    if (assignedTotals.amb > resources.ambulances) {
      list.push({
        type: 'error',
        title: 'Ambulance Over-Allocation',
        message: `${assignedTotals.amb} ambulances assigned across zones, but global pool only has ${resources.ambulances} available! (Conflict: +${assignedTotals.amb - resources.ambulances})`,
      });
    }
    if (assignedTotals.veh > resources.evacuation_vehicles) {
      list.push({
        type: 'error',
        title: 'Evacuation Vehicle Over-Allocation',
        message: `${assignedTotals.veh} vehicles assigned, exceeding available fleet of ${resources.evacuation_vehicles}! (Conflict: +${assignedTotals.veh - resources.evacuation_vehicles})`,
      });
    }
    if (assignedTotals.med > resources.medics) {
      list.push({
        type: 'error',
        title: 'Field Medic Over-Allocation',
        message: `${assignedTotals.med} medics assigned, exceeding available team of ${resources.medics}! (Conflict: +${assignedTotals.med - resources.medics})`,
      });
    }
    if (assignedTotals.she > resources.shelter_capacity) {
      list.push({
        type: 'error',
        title: 'Shelter Capacity Exceeded',
        message: `${assignedTotals.she} evacuees assigned to shelters, exceeding maximum capacity of ${resources.shelter_capacity}!`,
      });
    }

    // 2. Zone Unmet Demand Warnings
    zones.forEach(z => {
      const alloc = manualAllocations[z.id] || { assigned_ambulances: 0, assigned_evacuation_vehicles: 0 };
      const ambCap = (alloc.assigned_ambulances || 0) * 2;
      if (z.critical_patients > ambCap) {
        list.push({
          type: 'warning',
          title: `${z.name}: Critical Patient Deficit`,
          message: `${z.critical_patients} critical patients, but assigned ambulances can only transport ${ambCap} (${z.critical_patients - ambCap} at mortality risk).`,
        });
      }
      const vehCap = (alloc.assigned_evacuation_vehicles || 0) * 20;
      if (z.evacuation_demand > vehCap) {
        list.push({
          type: 'warning',
          title: `${z.name}: Evacuation Deficit`,
          message: `Evacuation demand of ${z.evacuation_demand} exceeds vehicle capacity of ${vehCap} (${z.evacuation_demand - vehCap} evacuees stranded).`,
        });
      }
    });

    return list;
  }, [assignedTotals, resources, zones, manualAllocations]);

  const hasHardError = liveConflicts.some(c => c.type === 'error');

  // Handle Zone Param Changes
  const handleZoneChange = (zoneId, field, value) => {
    setZones(prev => prev.map(z => {
      if (z.id !== zoneId) return z;
      return { ...z, [field]: value };
    }));

    if (autoReplan) {
      triggerDebouncedSync();
    }
  };

  // Handle Resource Pool Changes
  const handleResourceChange = (field, value) => {
    const num = Math.max(0, parseInt(value) || 0);
    setResources(prev => ({ ...prev, [field]: num }));

    if (autoReplan) {
      triggerDebouncedSync();
    }
  };

  // Handle Zone Allocation Changes
  const handleAllocationChange = (zoneId, field, value) => {
    const num = Math.max(0, parseInt(value) || 0);
    setManualAllocations(prev => ({
      ...prev,
      [zoneId]: {
        ...(prev[zoneId] || {}),
        [field]: num,
      },
    }));

    if (autoReplan) {
      triggerDebouncedSync();
    }
  };

  // Debounced Sync for Auto-Replan
  const triggerDebouncedSync = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      handleSync();
    }, 700);
  };

  // Perform Synchronization to Coordinator & SQLite
  const handleSync = async () => {
    if (hasHardError && allocationMode === 'manual') {
      showToast('Cannot sync: Resolve over-allocation errors first!', 'error');
      return;
    }

    setSyncing(true);
    try {
      const zonesPayload = zones.map(z => ({
        id: z.id,
        name: z.name,
        population: Number(z.population),
        evacuation_demand: Number(z.evacuation_demand),
        injured: Number(z.injured),
        critical_patients: Number(z.critical_patients),
        flood_severity: Number(z.flood_severity),
        vulnerable_percent: Number(z.vulnerable_percent),
        priority_override: z.isOverrideActive && z.priority_override !== null && z.priority_override !== ''
          ? Number(z.priority_override)
          : null,
      }));

      const manualPayload = allocationMode === 'manual'
        ? Object.entries(manualAllocations).map(([zid, a]) => ({
            zone_id: zid,
            assigned_ambulances: Number(a.assigned_ambulances || 0),
            assigned_evacuation_vehicles: Number(a.assigned_evacuation_vehicles || 0),
            assigned_medics: Number(a.assigned_medics || 0),
            assigned_shelter_spaces: Number(a.assigned_shelter_spaces || 0),
          }))
        : null;

      const res = await axios.post('/api/control-panel/sync', {
        zones: zonesPayload,
        resources: {
          ambulances: Number(resources.ambulances),
          evacuation_vehicles: Number(resources.evacuation_vehicles),
          medics: Number(resources.medics),
          shelter_capacity: Number(resources.shelter_capacity),
        },
        manual_allocations: manualPayload,
        auto_replan: allocationMode === 'auto',
        commander_name: commanderName,
      });

      const data = res.data;
      if (data.status === 'success') {
        showToast('Parameters synced & re-planning executed successfully!', 'success');
        setDiffData(data.diff);
        setServerAllocations(data.plan?.allocations || []);
        setServerConflicts(data.conflicts || []);

        // Update manualAllocations if auto-replan was used so inputs reflect solver results
        if (allocationMode === 'auto' && data.plan?.allocations) {
          const newMap = {};
          data.plan.allocations.forEach(a => {
            newMap[a.zone_id] = {
              assigned_ambulances: a.ambulances?.allocated || 0,
              assigned_evacuation_vehicles: a.evacuation_vehicles?.allocated || 0,
              assigned_medics: a.medics?.allocated || 0,
              assigned_shelter_spaces: a.evacuees_sheltered || 0,
            };
          });
          setManualAllocations(newMap);
        }

        if (onPlanUpdated) {
          onPlanUpdated(data.plan);
        }
      }
    } catch (err) {
      console.error('Sync failed:', err);
      const msg = err.response?.data?.detail || 'Sync failed. Check backend console.';
      showToast(msg, 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Reset to Baseline
  const handleResetBaseline = async () => {
    if (!window.confirm('Reset all disaster zones and resource pools to baseline defaults?')) return;
    setSyncing(true);
    try {
      await axios.post('/api/control-panel/reset');
      await fetchControlPanelState();
      showToast('Scenario parameters reset to baseline.', 'info');
      setDiffData(null);
      if (onPlanUpdated) onPlanUpdated(null);
    } catch (err) {
      console.error('Reset failed:', err);
      showToast('Reset failed.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const showToast = (msg, type = 'info') => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Active Zone Object
  const currentZone = zones.find(z => z.id === activeZoneTab) || zones[0];
  const currentZoneCalculated = calculatedZones.find(z => z.id === activeZoneTab) || calculatedZones[0];

  return (
    <div className="space-y-5 animate-fade-in pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 backdrop-blur-md transition-all ${
          toastMessage.type === 'error'
            ? 'bg-red-950/95 border-red-500 text-rose-200 shadow-red-900/40'
            : toastMessage.type === 'success'
            ? 'bg-emerald-950/95 border-emerald-500 text-emerald-200 shadow-emerald-900/40'
            : 'bg-blue-950/95 border-blue-500 text-cyan-200 shadow-blue-900/40'
        }`}>
          {toastMessage.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          )}
          <span className="text-xs font-semibold">{toastMessage.msg}</span>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white cursor-pointer ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. TOP HEADER & OPERATIONAL CONTROL BAR */}
      <div className="bg-gradient-to-r from-slate-900 via-[#0B1528] to-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/20 border border-blue-500/40 rounded-xl text-blue-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-wide font-mono uppercase">
                  Dynamic Control Panel
                </h1>
                <span className="bg-cyan-950 text-cyan-300 border border-cyan-700/50 text-[10px] font-mono font-bold px-2 py-0.5 rounded">
                  LIVE ARBITRATION
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Adjust disaster parameters, demographic triage loads, and global resource pool limits in real-time.
              </p>
            </div>
          </div>
        </div>

        {/* Operational Action Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Commander Input */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 px-2.5 py-1.5 rounded-xl text-xs">
            <span className="text-slate-400 text-[11px] font-mono">Commander:</span>
            <input
              type="text"
              value={commanderName}
              onChange={e => setCommanderName(e.target.value)}
              className="bg-transparent text-white font-semibold focus:outline-none w-36 text-xs"
              placeholder="Commander Name"
            />
          </div>

          {/* Auto Re-plan Toggle */}
          <button
            onClick={() => setAutoReplan(!autoReplan)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
              autoReplan
                ? 'bg-blue-600/30 border-blue-500 text-blue-300 shadow-sm shadow-blue-500/30'
                : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Automatically trigger re-planning on slider or input changes"
          >
            <Zap className={`w-3.5 h-3.5 ${autoReplan ? 'text-cyan-300 animate-pulse' : ''}`} />
            <span>Auto-Replan: {autoReplan ? 'ON' : 'OFF'}</span>
          </button>

          {/* Reset Baseline Button */}
          <button
            onClick={handleResetBaseline}
            disabled={syncing}
            className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            title="Reset to scenario default numbers"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset</span>
          </button>

          {/* Sync & Re-plan Button */}
          <button
            onClick={handleSync}
            disabled={syncing || (hasHardError && allocationMode === 'manual')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold font-mono tracking-wide flex items-center gap-2 shadow-lg transition-all cursor-pointer ${
              hasHardError && allocationMode === 'manual'
                ? 'bg-red-950 border border-red-700 text-red-400 opacity-60 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-blue-900/50'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'SYNCING...' : 'SYNC & RE-PLAN'}</span>
          </button>
        </div>
      </div>

      {/* 2. GLOBAL RESOURCE POOL MANAGEMENT */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
              Global Resource Pool Management & Live Utilization
            </h2>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Adjust total municipal fleet reserves available to the Coordinator
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Ambulances */}
          <div className={`p-3 rounded-xl border transition-all ${
            utilization.ambulances > 100
              ? 'bg-red-950/40 border-red-500/70 shadow-md shadow-red-950/40'
              : utilization.ambulances >= 75
              ? 'bg-amber-950/20 border-amber-600/40'
              : 'bg-slate-950/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-400">
                <Ambulance className="w-4 h-4" />
                <span className="text-xs font-bold">Ambulance Fleet</span>
              </div>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                utilization.ambulances > 100
                  ? 'bg-red-700 text-white animate-pulse'
                  : utilization.ambulances >= 75
                  ? 'bg-amber-700/80 text-amber-100'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
              }`}>
                {utilization.ambulances}% Used
              </span>
            </div>

            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Total Pool Limit:</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={resources.ambulances}
                  onChange={e => handleResourceChange('ambulances', e.target.value)}
                  className="w-16 bg-slate-900 border border-slate-700 focus:border-rose-500 rounded px-2 py-1 text-xs text-right font-mono font-bold text-white focus:outline-none"
                />
                <span className="text-[11px] text-slate-400 font-mono">units</span>
              </div>
            </div>

            {/* Utilization Bar */}
            <div className="mt-2.5 space-y-1">
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    utilization.ambulances > 100
                      ? 'bg-red-500'
                      : utilization.ambulances >= 75
                      ? 'bg-amber-400'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, utilization.ambulances)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>Assigned: {assignedTotals.amb}</span>
                <span>Remaining: {Math.max(0, resources.ambulances - assignedTotals.amb)}</span>
              </div>
            </div>
          </div>

          {/* Evacuation Vehicles */}
          <div className={`p-3 rounded-xl border transition-all ${
            utilization.evacuation_vehicles > 100
              ? 'bg-red-950/40 border-red-500/70 shadow-md shadow-red-950/40'
              : utilization.evacuation_vehicles >= 75
              ? 'bg-amber-950/20 border-amber-600/40'
              : 'bg-slate-950/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-400">
                <Truck className="w-4 h-4" />
                <span className="text-xs font-bold">Evac Vehicles (Cap 20)</span>
              </div>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                utilization.evacuation_vehicles > 100
                  ? 'bg-red-700 text-white animate-pulse'
                  : utilization.evacuation_vehicles >= 75
                  ? 'bg-amber-700/80 text-amber-100'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
              }`}>
                {utilization.evacuation_vehicles}% Used
              </span>
            </div>

            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Total Pool Limit:</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={resources.evacuation_vehicles}
                  onChange={e => handleResourceChange('evacuation_vehicles', e.target.value)}
                  className="w-16 bg-slate-900 border border-slate-700 focus:border-blue-500 rounded px-2 py-1 text-xs text-right font-mono font-bold text-white focus:outline-none"
                />
                <span className="text-[11px] text-slate-400 font-mono">buses</span>
              </div>
            </div>

            <div className="mt-2.5 space-y-1">
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    utilization.evacuation_vehicles > 100
                      ? 'bg-red-500'
                      : utilization.evacuation_vehicles >= 75
                      ? 'bg-amber-400'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(100, utilization.evacuation_vehicles)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>Assigned: {assignedTotals.veh}</span>
                <span>Seat Cap: {resources.evacuation_vehicles * 20}</span>
              </div>
            </div>
          </div>

          {/* Field Medics */}
          <div className={`p-3 rounded-xl border transition-all ${
            utilization.medics > 100
              ? 'bg-red-950/40 border-red-500/70 shadow-md shadow-red-950/40'
              : utilization.medics >= 75
              ? 'bg-amber-950/20 border-amber-600/40'
              : 'bg-slate-950/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400">
                <Stethoscope className="w-4 h-4" />
                <span className="text-xs font-bold">Field Medics</span>
              </div>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                utilization.medics > 100
                  ? 'bg-red-700 text-white animate-pulse'
                  : utilization.medics >= 75
                  ? 'bg-amber-700/80 text-amber-100'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
              }`}>
                {utilization.medics}% Used
              </span>
            </div>

            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Total Pool Limit:</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={resources.medics}
                  onChange={e => handleResourceChange('medics', e.target.value)}
                  className="w-16 bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded px-2 py-1 text-xs text-right font-mono font-bold text-white focus:outline-none"
                />
                <span className="text-[11px] text-slate-400 font-mono">medics</span>
              </div>
            </div>

            <div className="mt-2.5 space-y-1">
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    utilization.medics > 100
                      ? 'bg-red-500'
                      : utilization.medics >= 75
                      ? 'bg-amber-400'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, utilization.medics)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>Assigned: {assignedTotals.med}</span>
                <span>Remaining: {Math.max(0, resources.medics - assignedTotals.med)}</span>
              </div>
            </div>
          </div>

          {/* Shelter Capacity */}
          <div className={`p-3 rounded-xl border transition-all ${
            utilization.shelter > 100
              ? 'bg-red-950/40 border-red-500/70 shadow-md shadow-red-950/40'
              : utilization.shelter >= 75
              ? 'bg-amber-950/20 border-amber-600/40'
              : 'bg-slate-950/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-cyan-400">
                <Home className="w-4 h-4" />
                <span className="text-xs font-bold">Shelter Spaces</span>
              </div>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                utilization.shelter > 100
                  ? 'bg-red-700 text-white animate-pulse'
                  : utilization.shelter >= 75
                  ? 'bg-amber-700/80 text-amber-100'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
              }`}>
                {utilization.shelter}% Used
              </span>
            </div>

            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Total Shelter Limit:</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="2000"
                  value={resources.shelter_capacity}
                  onChange={e => handleResourceChange('shelter_capacity', e.target.value)}
                  className="w-16 bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded px-2 py-1 text-xs text-right font-mono font-bold text-white focus:outline-none"
                />
                <span className="text-[11px] text-slate-400 font-mono">beds</span>
              </div>
            </div>

            <div className="mt-2.5 space-y-1">
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    utilization.shelter > 100
                      ? 'bg-red-500'
                      : utilization.shelter >= 75
                      ? 'bg-amber-400'
                      : 'bg-cyan-500'
                  }`}
                  style={{ width: `${Math.min(100, utilization.shelter)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>Sheltered: {assignedTotals.she}</span>
                <span>Free: {Math.max(0, resources.shelter_capacity - assignedTotals.she)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. CONSTRAINT CONFLICTS & WARNINGS BANNER */}
      {liveConflicts.length > 0 && (
        <div className="space-y-2">
          {liveConflicts.map((conf, i) => (
            <div
              key={i}
              className={`p-3 rounded-xl border flex items-start gap-3 backdrop-blur-md shadow-md ${
                conf.type === 'error'
                  ? 'bg-red-950/80 border-red-500/80 text-rose-200 shadow-red-950/40'
                  : 'bg-amber-950/60 border-amber-500/70 text-amber-200 shadow-amber-950/30'
              }`}
            >
              <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                conf.type === 'error' ? 'bg-red-600/30 text-red-400' : 'bg-amber-600/30 text-amber-400'
              }`}>
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.2 rounded ${
                    conf.type === 'error' ? 'bg-red-700 text-white' : 'bg-amber-700 text-amber-100'
                  }`}>
                    {conf.type === 'error' ? 'HARD CONSTRAINT VIOLATION' : 'DEMAND DEFICIT WARNING'}
                  </span>
                  <span className="text-xs font-bold text-white">{conf.title}</span>
                </div>
                <p className="text-xs mt-1 text-slate-300">{conf.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. ZONE MANAGEMENT INTERFACE (ZONES A, B, C, D, E) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
              Zone Management Interface (Zones A, B, C, D, E)
            </h2>
          </div>

          {/* Zone Selector Tabs with Live Rank Badges */}
          <div className="flex items-center gap-1.5 bg-slate-950/90 p-1 rounded-xl border border-slate-800 text-xs">
            {zones.map(z => {
              const calc = calculatedZones.find(cz => cz.id === z.id);
              const isActive = activeZoneTab === z.id;
              return (
                <button
                  key={z.id}
                  onClick={() => setActiveZoneTab(z.id)}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer font-mono ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40 font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <span>{z.id.toUpperCase().replace('_', ' ')}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                    isActive
                      ? 'bg-blue-950 text-cyan-200'
                      : 'bg-slate-800 text-slate-300'
                  }`}>
                    #{calc?.currentRank || '-'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Zone Editor Card */}
        {currentZone && (
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 space-y-4">
            {/* Zone Header Meta */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl font-mono text-sm font-bold ${
                  currentZone.id === 'zone_e'
                    ? 'bg-red-600/20 border border-red-500/40 text-red-400'
                    : 'bg-blue-600/20 border border-blue-500/40 text-blue-400'
                }`}>
                  {currentZone.id.toUpperCase().replace('_', ' ')}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={currentZone.name}
                      onChange={e => handleZoneChange(currentZone.id, 'name', e.target.value)}
                      className="bg-transparent text-sm font-bold text-white focus:outline-none border-b border-transparent focus:border-blue-500 px-1"
                    />
                    <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                      Rank #{currentZoneCalculated?.currentRank}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 px-1 font-mono">
                    Calculated Priority Score: <strong className="text-cyan-300">{currentZoneCalculated?.currentScore} / 100</strong>
                    {currentZone.isOverrideActive && (
                      <span className="text-amber-400 ml-1.5 font-bold">(Manual Override Active)</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Priority Index Override Section */}
              <div className="flex items-center gap-2 bg-slate-950/90 border border-slate-800 p-2 rounded-xl">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      const nextState = !currentZone.isOverrideActive;
                      handleZoneChange(currentZone.id, 'isOverrideActive', nextState);
                      if (!nextState) {
                        handleZoneChange(currentZone.id, 'priority_override', null);
                      } else {
                        handleZoneChange(currentZone.id, 'priority_override', currentZoneCalculated.currentScore);
                      }
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-all ${
                      currentZone.isOverrideActive
                        ? 'bg-amber-600/30 border border-amber-500 text-amber-300'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {currentZone.isOverrideActive ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    <span>{currentZone.isOverrideActive ? 'Manual Override ON' : 'Auto Formula'}</span>
                  </button>

                  {currentZone.isOverrideActive && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={currentZone.priority_override ?? ''}
                        onChange={e => handleZoneChange(currentZone.id, 'priority_override', e.target.value)}
                        className="w-16 bg-slate-900 border border-amber-500/80 rounded px-1.5 py-0.5 text-xs text-amber-300 font-mono font-bold text-right focus:outline-none"
                        placeholder="0-100"
                      />
                      <span className="text-[11px] text-amber-400 font-mono">pts</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Zone Demographics Number Inputs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Population */}
              <div className="bg-slate-900/90 border border-slate-800/80 p-2.5 rounded-xl">
                <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 mb-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                  <span>Total Population</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={currentZone.population}
                  onChange={e => handleZoneChange(currentZone.id, 'population', Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-2.5 py-1 text-sm font-mono font-bold text-white focus:outline-none"
                />
              </div>

              {/* Evacuation Demand */}
              <div className="bg-slate-900/90 border border-slate-800/80 p-2.5 rounded-xl">
                <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 mb-1.5">
                  <Truck className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Evacuation Demand</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="5000"
                  value={currentZone.evacuation_demand}
                  onChange={e => handleZoneChange(currentZone.id, 'evacuation_demand', Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-lg px-2.5 py-1 text-sm font-mono font-bold text-white focus:outline-none"
                />
              </div>

              {/* Injured Count */}
              <div className="bg-slate-900/90 border border-slate-800/80 p-2.5 rounded-xl">
                <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 mb-1.5">
                  <HeartPulse className="w-3.5 h-3.5 text-amber-400" />
                  <span>Injured Count</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="500"
                  value={currentZone.injured}
                  onChange={e => handleZoneChange(currentZone.id, 'injured', Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-lg px-2.5 py-1 text-sm font-mono font-bold text-white focus:outline-none"
                />
              </div>

              {/* Critical Patients */}
              <div className="bg-slate-900/90 border border-slate-800/80 p-2.5 rounded-xl">
                <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 mb-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Critical Patients</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={currentZone.critical_patients}
                  onChange={e => handleZoneChange(currentZone.id, 'critical_patients', Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 rounded-lg px-2.5 py-1 text-sm font-mono font-bold text-rose-300 focus:outline-none"
                />
              </div>
            </div>

            {/* Sliders: Flood Severity (1-10) and Vulnerable Population % (0-100) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Flood Severity Slider (1 - 10) */}
              <div className="bg-slate-900/90 border border-slate-800/80 p-3.5 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Waves className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-white">Flood Severity Index</span>
                  </div>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                    currentZone.flood_severity >= 8
                      ? 'bg-red-700 text-white animate-pulse'
                      : currentZone.flood_severity >= 5
                      ? 'bg-amber-600 text-white'
                      : 'bg-blue-600 text-white'
                  }`}>
                    Level {currentZone.flood_severity} / 10
                  </span>
                </div>

                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={currentZone.flood_severity}
                  onChange={e => handleZoneChange(currentZone.id, 'flood_severity', parseInt(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg appearance-none"
                />

                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>1 (Low)</span>
                  <span>4 (Moderate)</span>
                  <span>7 (Severe)</span>
                  <span>10 (Catastrophic Breach)</span>
                </div>
              </div>

              {/* Vulnerable Population % Slider (0 - 100) */}
              <div className="bg-slate-900/90 border border-slate-800/80 p-3.5 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold text-white">Vulnerable Population %</span>
                  </div>
                  <span className="text-xs font-mono font-bold bg-purple-950 text-purple-200 border border-purple-800/50 px-2 py-0.5 rounded">
                    {currentZone.vulnerable_percent}% (~{Math.round(currentZone.population * (currentZone.vulnerable_percent / 100))} persons)
                  </span>
                </div>

                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={currentZone.vulnerable_percent}
                  onChange={e => handleZoneChange(currentZone.id, 'vulnerable_percent', parseInt(e.target.value))}
                  className="w-full accent-purple-400 cursor-pointer h-2 bg-slate-800 rounded-lg appearance-none"
                />

                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>0% (Minimal)</span>
                  <span>50% (Substantial)</span>
                  <span>100% (High Density Nursing/Daycares)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. ZONE-SPECIFIC RESOURCE ALLOCATION & MANUAL ADJUSTMENT */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
              Zone-Specific Resource Allocation Matrix
            </h2>
          </div>

          {/* Allocation Mode Switch */}
          <div className="flex items-center gap-1.5 bg-slate-950/90 p-1 rounded-xl border border-slate-800 text-xs font-mono">
            <button
              onClick={() => setAllocationMode('auto')}
              className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                allocationMode === 'auto'
                  ? 'bg-blue-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
              <span>AI Deterministic Solver</span>
            </button>
            <button
              onClick={() => setAllocationMode('manual')}
              className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                allocationMode === 'manual'
                  ? 'bg-amber-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <SlidersVertical className="w-3.5 h-3.5 text-amber-200" />
              <span>Manual Commander Override</span>
            </button>
          </div>
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                <th className="py-2.5 px-3">Zone & Priority</th>
                <th className="py-2.5 px-3">Assigned Ambulances</th>
                <th className="py-2.5 px-3">Assigned Vehicles</th>
                <th className="py-2.5 px-3">Assigned Medics</th>
                <th className="py-2.5 px-3">Assigned Shelter</th>
                <th className="py-2.5 px-3">Demand Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {zones.map(z => {
                const alloc = manualAllocations[z.id] || {
                  assigned_ambulances: 0,
                  assigned_evacuation_vehicles: 0,
                  assigned_medics: 0,
                  assigned_shelter_spaces: 0,
                };
                const calc = calculatedZones.find(cz => cz.id === z.id);
                const ambCap = (alloc.assigned_ambulances || 0) * 2;
                const vehCap = (alloc.assigned_evacuation_vehicles || 0) * 20;
                const isCritUnmet = z.critical_patients > ambCap;
                const isEvacUnmet = z.evacuation_demand > vehCap;

                return (
                  <tr key={z.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Zone info */}
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <span className="text-cyan-400">#{calc?.currentRank}</span>
                        <span>{z.name}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {z.critical_patients} crit | {z.evacuation_demand} evac demand
                      </div>
                    </td>

                    {/* Ambulances */}
                    <td className="py-2.5 px-3">
                      {allocationMode === 'manual' ? (
                        <input
                          type="number"
                          min="0"
                          max={resources.ambulances + 5}
                          value={alloc.assigned_ambulances}
                          onChange={e => handleAllocationChange(z.id, 'assigned_ambulances', e.target.value)}
                          className={`w-16 rounded px-2 py-1 bg-slate-900 border text-center font-bold focus:outline-none ${
                            assignedTotals.amb > resources.ambulances
                              ? 'border-red-500 text-red-300 bg-red-950/40'
                              : 'border-slate-700 text-rose-300 focus:border-rose-500'
                          }`}
                        />
                      ) : (
                        <span className="font-bold text-rose-300 px-2 py-1 bg-rose-950/40 border border-rose-800/40 rounded">
                          {alloc.assigned_ambulances} units
                        </span>
                      )}
                    </td>

                    {/* Evacuation Vehicles */}
                    <td className="py-2.5 px-3">
                      {allocationMode === 'manual' ? (
                        <input
                          type="number"
                          min="0"
                          max={resources.evacuation_vehicles + 5}
                          value={alloc.assigned_evacuation_vehicles}
                          onChange={e => handleAllocationChange(z.id, 'assigned_evacuation_vehicles', e.target.value)}
                          className={`w-16 rounded px-2 py-1 bg-slate-900 border text-center font-bold focus:outline-none ${
                            assignedTotals.veh > resources.evacuation_vehicles
                              ? 'border-red-500 text-red-300 bg-red-950/40'
                              : 'border-slate-700 text-blue-300 focus:border-blue-500'
                          }`}
                        />
                      ) : (
                        <span className="font-bold text-blue-300 px-2 py-1 bg-blue-950/40 border border-blue-800/40 rounded">
                          {alloc.assigned_evacuation_vehicles} buses
                        </span>
                      )}
                    </td>

                    {/* Field Medics */}
                    <td className="py-2.5 px-3">
                      {allocationMode === 'manual' ? (
                        <input
                          type="number"
                          min="0"
                          max={resources.medics + 5}
                          value={alloc.assigned_medics}
                          onChange={e => handleAllocationChange(z.id, 'assigned_medics', e.target.value)}
                          className={`w-16 rounded px-2 py-1 bg-slate-900 border text-center font-bold focus:outline-none ${
                            assignedTotals.med > resources.medics
                              ? 'border-red-500 text-red-300 bg-red-950/40'
                              : 'border-slate-700 text-emerald-300 focus:border-emerald-500'
                          }`}
                        />
                      ) : (
                        <span className="font-bold text-emerald-300 px-2 py-1 bg-emerald-950/40 border border-emerald-800/40 rounded">
                          {alloc.assigned_medics} medics
                        </span>
                      )}
                    </td>

                    {/* Assigned Shelter */}
                    <td className="py-2.5 px-3">
                      {allocationMode === 'manual' ? (
                        <input
                          type="number"
                          min="0"
                          max={resources.shelter_capacity + 100}
                          value={alloc.assigned_shelter_spaces}
                          onChange={e => handleAllocationChange(z.id, 'assigned_shelter_spaces', e.target.value)}
                          className={`w-20 rounded px-2 py-1 bg-slate-900 border text-center font-bold focus:outline-none ${
                            assignedTotals.she > resources.shelter_capacity
                              ? 'border-red-500 text-red-300 bg-red-950/40'
                              : 'border-slate-700 text-cyan-300 focus:border-cyan-500'
                          }`}
                        />
                      ) : (
                        <span className="font-bold text-cyan-300 px-2 py-1 bg-cyan-950/40 border border-cyan-800/40 rounded">
                          {alloc.assigned_shelter_spaces} beds
                        </span>
                      )}
                    </td>

                    {/* Demand Coverage Status */}
                    <td className="py-2.5 px-3">
                      {isCritUnmet || isEvacUnmet ? (
                        <div className="flex items-center gap-1.5 text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                          <span className="text-[10px]">
                            {isCritUnmet ? `-${z.critical_patients - ambCap} crit amb` : ''}
                            {isCritUnmet && isEvacUnmet ? ' | ' : ''}
                            {isEvacUnmet ? `-${z.evacuation_demand - vehCap} evac` : ''}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                          <span className="text-[10px]">Demands Covered</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. BEFORE / AFTER COMPARISON & IMPACT ANALYSIS */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
              Live Impact & Before/After Re-plan Comparison
            </h2>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {diffData ? `Re-plan Diff (v${diffData.old_version} ➔ v${diffData.new_version})` : 'Showing Baseline Comparison'}
          </span>
        </div>

        {/* Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                <th className="py-2 px-3">Zone</th>
                <th className="py-2 px-3">Priority Shift</th>
                <th className="py-2 px-3">Rank Shift</th>
                <th className="py-2 px-3">Ambulance Delta</th>
                <th className="py-2 px-3">Vehicle Delta</th>
                <th className="py-2 px-3">Medic Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {calculatedZones.map(z => {
                const prevZ = previousSnapshot?.zones?.find(pz => pz.id === z.id);
                const prevScore = prevZ ? calculatePriorityScore(prevZ) : z.currentScore;
                const scoreDiff = Math.round((z.currentScore - prevScore) * 10) / 10;

                const prevAlloc = previousSnapshot?.allocations?.[z.id] || { assigned_ambulances: 0, assigned_evacuation_vehicles: 0, assigned_medics: 0 };
                const currentAlloc = manualAllocations[z.id] || { assigned_ambulances: 0, assigned_evacuation_vehicles: 0, assigned_medics: 0 };

                const ambDiff = (currentAlloc.assigned_ambulances || 0) - (prevAlloc.assigned_ambulances || 0);
                const vehDiff = (currentAlloc.assigned_evacuation_vehicles || 0) - (prevAlloc.assigned_evacuation_vehicles || 0);
                const medDiff = (currentAlloc.assigned_medics || 0) - (prevAlloc.assigned_medics || 0);

                return (
                  <tr key={z.id} className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 font-bold text-white">
                      {z.name}
                    </td>

                    {/* Priority score shift */}
                    <td className="py-2 px-3">
                      <span className="text-slate-400">{prevScore}</span>
                      <span className="mx-1 text-slate-500">➔</span>
                      <span className="font-bold text-cyan-300">{z.currentScore}</span>
                      {scoreDiff !== 0 && (
                        <span className={`ml-2 text-[10px] font-bold ${scoreDiff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ({scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff})
                        </span>
                      )}
                    </td>

                    {/* Rank shift */}
                    <td className="py-2 px-3">
                      <span className="font-bold text-white bg-slate-800 px-1.5 py-0.5 rounded">
                        #{z.currentRank}
                      </span>
                    </td>

                    {/* Ambulance Delta */}
                    <td className="py-2 px-3">
                      <span className="font-bold text-rose-300">{currentAlloc.assigned_ambulances || 0}</span>
                      {ambDiff !== 0 && (
                        <span className={`ml-1.5 text-[10px] font-bold ${ambDiff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ({ambDiff > 0 ? `+${ambDiff}` : ambDiff})
                        </span>
                      )}
                    </td>

                    {/* Vehicle Delta */}
                    <td className="py-2 px-3">
                      <span className="font-bold text-blue-300">{currentAlloc.assigned_evacuation_vehicles || 0}</span>
                      {vehDiff !== 0 && (
                        <span className={`ml-1.5 text-[10px] font-bold ${vehDiff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ({vehDiff > 0 ? `+${vehDiff}` : vehDiff})
                        </span>
                      )}
                    </td>

                    {/* Medic Delta */}
                    <td className="py-2 px-3">
                      <span className="font-bold text-emerald-300">{currentAlloc.assigned_medics || 0}</span>
                      {medDiff !== 0 && (
                        <span className={`ml-1.5 text-[10px] font-bold ${medDiff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ({medDiff > 0 ? `+${medDiff}` : medDiff})
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
    </div>
  );
}
