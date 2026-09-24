import React, { useState } from 'react';
import { Navigation, AlertOctagon, ShieldAlert, Home, MapPin, Eye } from 'lucide-react';

export default function SvgMap({ scenario, currentPlan, selectedZoneId, onSelectZone }) {
  const [hoveredNode, setHoveredNode] = useState(null);

  if (!scenario) return null;

  const { zones, roads, depot, resource_pool } = scenario;
  const shelters = resource_pool?.shelters || [];

  // Node coordinate lookup
  const nodeCoords = {};
  if (depot) {
    nodeCoords[depot.id] = { x: depot.x, y: depot.y, name: depot.name, type: 'depot' };
  }
  shelters.forEach(s => {
    nodeCoords[s.id] = { x: s.x, y: s.y, name: s.name, type: 'shelter', capacity: s.capacity };
  });
  zones.forEach(z => {
    nodeCoords[z.id] = { 
      x: z.x, 
      y: z.y, 
      name: z.name, 
      type: 'zone', 
      severity: z.flood_severity,
      critical: z.critical_patients,
      injured: z.injured,
      evac: z.evacuation_demand,
    };
  });

  // Extract all active evacuation route paths from current plan
  const activeRouteSegments = new Set();
  if (currentPlan?.allocations) {
    currentPlan.allocations.forEach(za => {
      za.shelter_assignments?.forEach(sa => {
        const path = sa.route_path || [];
        for (let i = 0; i < path.length - 1; i++) {
          const u = path[i];
          const v = path[i + 1];
          activeRouteSegments.add(`${u}__${v}`);
          activeRouteSegments.add(`${v}__${u}`);
        }
      });
    });
  }

  const getSeverityColor = (sev) => {
    switch (sev) {
      case 5: return { fill: '#EF4444', stroke: '#B91C1C', halo: 'rgba(239, 68, 68, 0.4)' };
      case 4: return { fill: '#F97316', stroke: '#C2410C', halo: 'rgba(249, 115, 22, 0.35)' };
      case 3: return { fill: '#F59E0B', stroke: '#B45309', halo: 'rgba(245, 158, 11, 0.25)' };
      case 2: return { fill: '#10B981', stroke: '#047857', halo: 'rgba(16, 185, 129, 0.2)' };
      default: return { fill: '#3B82F6', stroke: '#1D4ED8', halo: 'rgba(59, 130, 246, 0.2)' };
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col h-full">
      {/* Panel Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Operational Vector Cartography
          </h2>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block animate-pulse"></span>
            Severity 4-5 Flood
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-red-500 inline-block border-t border-dashed"></span>
            Blocked Road
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-1 bg-cyan-400 inline-block rounded"></span>
            Active Evac Route
          </span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full aspect-[16/10] bg-slate-950/90 rounded-lg border border-slate-800/80 overflow-hidden flex-1 flex items-center justify-center">
        <svg
          viewBox="0 0 580 430"
          className="w-full h-full select-none"
        >
          {/* Background grid pattern */}
          <defs>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" strokeWidth="0.5" strokeOpacity="0.4" />
            </pattern>
            <linearGradient id="riverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#0c4a6e" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Simulated River Hazard Zone */}
          <path
            d="M 50 150 Q 220 80 340 180 T 560 120"
            fill="none"
            stroke="url(#riverGrad)"
            strokeWidth="45"
            strokeLinecap="round"
            opacity="0.6"
          />

          {/* 1. Draw Road Network */}
          {roads.map((road, idx) => {
            const u = nodeCoords[road.from_node];
            const v = nodeCoords[road.to_node];
            if (!u || !v) return null;

            const isBlocked = road.status === 'blocked';
            const isFlooded = road.status === 'flooded';
            const isActiveEvac = activeRouteSegments.has(`${road.from_node}__${road.to_node}`);

            let strokeColor = '#334155';
            let strokeWidth = 2;
            let strokeDash = 'none';

            if (isBlocked) {
              strokeColor = '#EF4444';
              strokeWidth = 3;
              strokeDash = '6 4';
            } else if (isActiveEvac) {
              strokeColor = '#38BDF8';
              strokeWidth = 3.5;
            } else if (isFlooded) {
              strokeColor = '#F59E0B';
              strokeWidth = 2.5;
              strokeDash = '4 4';
            }

            const midX = (u.x + v.x) / 2;
            const midY = (u.y + v.y) / 2;

            return (
              <g key={`road-${idx}`}>
                {/* Active glow underlay */}
                {isActiveEvac && (
                  <line
                    x1={u.x}
                    y1={u.y}
                    x2={v.x}
                    y2={v.y}
                    stroke="#0284C7"
                    strokeWidth="8"
                    strokeOpacity="0.3"
                    strokeLinecap="round"
                  />
                )}

                {/* Primary road line */}
                <line
                  x1={u.x}
                  y1={u.y}
                  x2={v.x}
                  y2={v.y}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDash}
                  strokeLinecap="round"
                  className={isActiveEvac ? 'animated-route-line' : ''}
                />

                {/* Road label / warning icon */}
                {isBlocked && (
                  <g transform={`translate(${midX - 10}, ${midY - 10})`}>
                    <circle cx="10" cy="10" r="9" fill="#7F1D1D" stroke="#EF4444" strokeWidth="1.5" />
                    <text x="10" y="14" fill="#FFFFFF" fontSize="10" fontWeight="bold" textAnchor="middle">✕</text>
                  </g>
                )}

                {!isBlocked && (
                  <text
                    x={midX}
                    y={midY - 4}
                    fill="#64748B"
                    fontSize="8.5"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {road.travel_minutes}m
                  </text>
                )}
              </g>
            );
          })}

          {/* 2. Draw Shelters */}
          {shelters.map(shelter => {
            const isHovered = hoveredNode === shelter.id;
            return (
              <g
                key={shelter.id}
                transform={`translate(${shelter.x}, ${shelter.y})`}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredNode(shelter.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <circle
                  r={isHovered ? 20 : 16}
                  fill="#065F46"
                  stroke="#34D399"
                  strokeWidth="2"
                  className="transition-all duration-200"
                />
                <rect x="-7" y="-7" width="14" height="14" rx="2" fill="#10B981" />
                <text
                  y="26"
                  fill="#A7F3D0"
                  fontSize="10"
                  fontWeight="bold"
                  textAnchor="middle"
                  className="drop-shadow"
                >
                  {shelter.name.split('(')[0].trim()}
                </text>
                <text
                  y="37"
                  fill="#6EE7B7"
                  fontSize="8.5"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  Cap: {shelter.capacity}
                </text>
              </g>
            );
          })}

          {/* 3. Draw Depot */}
          {depot && (
            <g
              transform={`translate(${depot.x}, ${depot.y})`}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredNode(depot.id)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              <polygon
                points="0,-16 16,10 -16,10"
                fill="#1E3A8A"
                stroke="#60A5FA"
                strokeWidth="2"
              />
              <text
                y="24"
                fill="#93C5FD"
                fontSize="10"
                fontWeight="bold"
                textAnchor="middle"
              >
                COMMAND DEPOT
              </text>
            </g>
          )}

          {/* 4. Draw Zones */}
          {zones.map(zone => {
            const isSelected = selectedZoneId === zone.id;
            const isHovered = hoveredNode === zone.id;
            const colors = getSeverityColor(zone.flood_severity);
            const radius = 18 + zone.flood_severity * 2.5;

            // Find ranking if plan exists
            const rankObj = currentPlan?.zones_ranked?.find(rz => rz.zone_id === zone.id);
            const rankLabel = rankObj ? `#${rankObj.rank}` : '';

            return (
              <g
                key={zone.id}
                transform={`translate(${zone.x}, ${zone.y})`}
                onClick={() => onSelectZone(zone.id)}
                onMouseEnter={() => setHoveredNode(zone.id)}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer group"
              >
                {/* Severity halo */}
                <circle
                  r={radius + 8}
                  fill={colors.halo}
                  className={zone.flood_severity >= 4 ? 'animate-pulse-slow' : ''}
                />

                {/* Primary node circle */}
                <circle
                  r={radius}
                  fill="#0F172A"
                  stroke={isSelected ? '#38BDF8' : colors.stroke}
                  strokeWidth={isSelected ? 3.5 : 2}
                  className="transition-all duration-200"
                />

                {/* Severity fill core */}
                <circle
                  r={radius - 5}
                  fill={colors.fill}
                  opacity="0.85"
                />

                {/* Zone ID / Rank inside circle */}
                <text
                  y="4"
                  fill="#FFFFFF"
                  fontSize="11"
                  fontWeight="bold"
                  textAnchor="middle"
                  fontFamily="sans-serif"
                >
                  {zone.id.split('_')[1].toUpperCase()}
                </text>

                {rankLabel && (
                  <g transform={`translate(${radius - 4}, ${-radius + 4})`}>
                    <circle r="8" fill="#1E293B" stroke="#F59E0B" strokeWidth="1" />
                    <text y="3" fill="#FBBF24" fontSize="8" fontWeight="bold" textAnchor="middle">
                      {rankLabel}
                    </text>
                  </g>
                )}

                {/* Zone Name Label */}
                <text
                  y={radius + 14}
                  fill="#E2E8F0"
                  fontSize="9.5"
                  fontWeight="600"
                  textAnchor="middle"
                  className="drop-shadow"
                >
                  {zone.name.split('-')[0].trim()}
                </text>

                {/* Subtext: Severity & Critical Patients */}
                <text
                  y={radius + 24}
                  fill="#94A3B8"
                  fontSize="8"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  Sev {zone.flood_severity} • {zone.critical_patients} Crit
                </text>
              </g>
            );
          })}
        </svg>

        {/* Selected Zone Quick Inspector Overlay */}
        {selectedZoneId && (
          <div className="absolute top-3 left-3 bg-slate-900/95 border border-slate-700/80 p-2.5 rounded-lg text-xs shadow-2xl backdrop-blur max-w-[210px]">
            {(() => {
              const z = zones.find(item => item.id === selectedZoneId);
              const alloc = currentPlan?.allocations?.find(a => a.zone_id === selectedZoneId);
              if (!z) return null;
              return (
                <div className="space-y-1">
                  <div className="font-bold text-white flex items-center justify-between">
                    <span>{z.name}</span>
                    <span className="text-[10px] text-red-400 bg-red-950 px-1.5 py-0.5 rounded border border-red-800">
                      Sev {z.flood_severity}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    <div>Pop: <span className="font-mono text-white">{z.population}</span> | Evac: <span className="font-mono text-white">{z.evacuation_demand}</span></div>
                    <div>Critical: <span className="font-mono text-rose-400 font-bold">{z.critical_patients}</span> | Injured: <span className="font-mono text-amber-300">{z.injured}</span></div>
                  </div>
                  {alloc && (
                    <div className="pt-1 border-t border-slate-800 text-[10px] space-y-0.5 font-mono text-cyan-300">
                      <div>Ambulances: {alloc.ambulances.allocated}/{alloc.ambulances.requested}</div>
                      <div>Vehicles: {alloc.evacuation_vehicles.allocated}/{alloc.evacuation_vehicles.requested}</div>
                      <div>Sheltered: {alloc.evacuees_sheltered}/{z.evacuation_demand}</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
