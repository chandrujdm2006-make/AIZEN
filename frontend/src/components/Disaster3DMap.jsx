import React, { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Float, Html } from '@react-three/drei';
import * as THREE from 'three';

// --- 3D MOVING VEHICLE COMPONENTS ---

function Ambulance3D({ routeWaypoints, speed = 0.25, color = '#ffffff', label = 'AMB-1' }) {
  const meshRef = useRef();
  const beaconRef = useRef();
  const [progress, setProgress] = useState(0);

  // Compute curve path from waypoints
  const curve = useMemo(() => {
    if (!routeWaypoints || routeWaypoints.length < 2) return null;
    const points = routeWaypoints.map(p => new THREE.Vector3(p[0], 0.4, p[2]));
    return new THREE.CatmullRomCurve3(points, true); // loop path
  }, [routeWaypoints]);

  useFrame((state, delta) => {
    if (!curve || !meshRef.current) return;
    const newProgress = (progress + delta * speed * 0.15) % 1;
    setProgress(newProgress);

    const position = curve.getPointAt(newProgress);
    const tangent = curve.getTangentAt(newProgress);

    meshRef.current.position.copy(position);
    meshRef.current.lookAt(position.clone().add(tangent));

    // Flash emergency beacon
    if (beaconRef.current) {
      beaconRef.current.intensity = Math.sin(state.clock.elapsedTime * 12) > 0 ? 3.0 : 0.2;
    }
  });

  if (!curve) return null;

  return (
    <group ref={meshRef}>
      {/* Ambulance Van Body */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.9, 0.7, 1.8]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />
      </mesh>
      {/* Red cross stripe */}
      <mesh position={[0.46, 0.4, 0]}>
        <boxGeometry args={[0.02, 0.2, 0.6]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      <mesh position={[-0.46, 0.4, 0]}>
        <boxGeometry args={[0.02, 0.2, 0.6]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      {/* Cab Windshield */}
      <mesh position={[0, 0.5, 0.65]}>
        <boxGeometry args={[0.75, 0.35, 0.4]} />
        <meshStandardMaterial color="#1e293b" roughness={0.1} />
      </mesh>
      {/* Wheels */}
      <mesh position={[0.45, 0.15, 0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.2, 0.2, 0.15, 12]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[-0.45, 0.15, 0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.2, 0.2, 0.15, 12]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0.45, 0.15, -0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.2, 0.2, 0.15, 12]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[-0.45, 0.15, -0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.2, 0.2, 0.15, 12]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      {/* Flashing Beacon */}
      <mesh position={[0, 0.8, 0.1]}>
        <boxGeometry args={[0.25, 0.15, 0.25]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} />
      </mesh>
      <pointLight ref={beaconRef} position={[0, 1.2, 0.1]} color="#ef4444" distance={5} intensity={2} />
    </group>
  );
}

function EvacBus3D({ routeWaypoints, speed = 0.18, label = 'BUS-1' }) {
  const meshRef = useRef();
  const [progress, setProgress] = useState(0.2);

  const curve = useMemo(() => {
    if (!routeWaypoints || routeWaypoints.length < 2) return null;
    const points = routeWaypoints.map(p => new THREE.Vector3(p[0], 0.5, p[2]));
    return new THREE.CatmullRomCurve3(points, true);
  }, [routeWaypoints]);

  useFrame((state, delta) => {
    if (!curve || !meshRef.current) return;
    const newProgress = (progress + delta * speed * 0.12) % 1;
    setProgress(newProgress);

    const position = curve.getPointAt(newProgress);
    const tangent = curve.getTangentAt(newProgress);

    meshRef.current.position.copy(position);
    meshRef.current.lookAt(position.clone().add(tangent));
  });

  if (!curve) return null;

  return (
    <group ref={meshRef}>
      {/* Bus Body */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[1.2, 0.9, 3.2]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.3} metalness={0.1} />
      </mesh>
      {/* Bus Windows Band */}
      <mesh position={[0, 0.75, 0]}>
        <boxGeometry args={[1.25, 0.35, 2.9]} />
        <meshStandardMaterial color="#0f172a" roughness={0.1} />
      </mesh>
      {/* Headlights */}
      <mesh position={[0.4, 0.35, 1.62]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={2} />
      </mesh>
      <mesh position={[-0.4, 0.35, 1.62]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={2} />
      </mesh>
    </group>
  );
}

function RescueBoat3D({ position, areaRadius = 3 }) {
  const boatRef = useRef();

  useFrame((state) => {
    if (!boatRef.current) return;
    const t = state.clock.elapsedTime;
    boatRef.current.position.x = position[0] + Math.sin(t * 0.5) * areaRadius;
    boatRef.current.position.z = position[2] + Math.cos(t * 0.5) * (areaRadius * 0.6);
    boatRef.current.position.y = 0.15 + Math.sin(t * 2) * 0.05; // bobbing
    boatRef.current.rotation.y = -t * 0.5;
    boatRef.current.rotation.z = Math.sin(t * 2) * 0.08;
  });

  return (
    <group ref={boatRef} position={position}>
      {/* Boat Hull */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.8, 0.3, 1.6]} />
        <meshStandardMaterial color="#ea580c" />
      </mesh>
      {/* Outboard Motor */}
      <mesh position={[0, 0.25, -0.85]}>
        <boxGeometry args={[0.2, 0.4, 0.2]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
    </group>
  );
}

function Drone3D({ targetPosition, scanColor = '#38bdf8' }) {
  const droneRef = useRef();

  useFrame((state) => {
    if (!droneRef.current) return;
    const t = state.clock.elapsedTime * 1.5;
    droneRef.current.position.x = targetPosition[0] + Math.sin(t) * 2.5;
    droneRef.current.position.z = targetPosition[2] + Math.cos(t) * 2.5;
    droneRef.current.position.y = 5.5 + Math.sin(t * 3) * 0.3;
    droneRef.current.rotation.y = t * 0.5;
  });

  return (
    <group ref={droneRef} position={[targetPosition[0], 5.5, targetPosition[2]]}>
      {/* Drone Center Body */}
      <mesh>
        <sphereGeometry args={[0.25, 8, 8]} />
        <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Arms */}
      <mesh rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[1.2, 0.05, 0.05]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]}>
        <boxGeometry args={[1.2, 0.05, 0.05]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      {/* Searchlight Cone */}
      <spotLight
        position={[0, 0, 0]}
        target-position={[0, -5, 0]}
        angle={0.35}
        penumbra={0.5}
        intensity={2.5}
        color={scanColor}
        distance={10}
      />
    </group>
  );
}

// --- 3D BUILDINGS & INFRASTRUCTURE ---

function Building({ position, size = [2, 3, 2], color = '#1e293b', label }) {
  return (
    <group position={position}>
      <mesh position={[0, size[1] / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      {/* Roof detail */}
      <mesh position={[0, size[1] + 0.1, 0]}>
        <boxGeometry args={[size[0] * 0.9, 0.2, size[2] * 0.9]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {label && (
        <Text
          position={[0, size[1] + 1.2, 0]}
          fontSize={0.65}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          {label}
        </Text>
      )}
    </group>
  );
}

function HospitalBuilding({ position }) {
  return (
    <group position={position}>
      {/* Main Hospital Block */}
      <mesh position={[0, 2.5, 0]} castShadow>
        <boxGeometry args={[5, 5, 4]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.2} />
      </mesh>
      {/* Red Cross on Rooftop */}
      <mesh position={[0, 5.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.5, 2.5]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      <mesh position={[0, 5.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.7, 2.3]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 5.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.3, 0.7]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <Text
        position={[0, 6.2, 0]}
        fontSize={0.8}
        color="#f87171"
        anchorX="center"
        anchorY="middle"
      >
        METRO HOSPITAL
      </Text>
    </group>
  );
}

function ShelterBuilding({ position, name, capacity, occupancy = 0 }) {
  const isFull = occupancy >= capacity && capacity > 0;
  return (
    <group position={position}>
      {/* Shelter Hangar / Gym Structure */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <cylinderGeometry args={[2.8, 3.2, 3.6, 8]} />
        <meshStandardMaterial color={isFull ? '#991b1b' : '#065f46'} roughness={0.3} />
      </mesh>
      <mesh position={[0, 3.8, 0]}>
        <sphereGeometry args={[2.6, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={isFull ? '#dc2626' : '#10b981'} />
      </mesh>
      <Text
        position={[0, 5.2, 0]}
        fontSize={0.7}
        color={isFull ? '#fca5a5' : '#a7f3d0'}
        anchorX="center"
        anchorY="middle"
      >
        {name}
      </Text>
      <Text
        position={[0, 4.4, 0]}
        fontSize={0.5}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {occupancy}/{capacity} EVACUEES
      </Text>
    </group>
  );
}

function ZoneGroundMarker({ position, name, severity, critical, injured, isSelected, onClick }) {
  const haloColor = severity === 5 ? '#ef4444' : severity === 4 ? '#f97316' : '#f59e0b';

  return (
    <group position={position} onClick={onClick}>
      {/* Ground Danger Ring */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.2, 3.8, 32]} />
        <meshBasicMaterial color={haloColor} transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>
      {/* Inner Fill */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.2, 32]} />
        <meshStandardMaterial color={haloColor} transparent opacity={0.2} />
      </mesh>
      {/* Zone Center Flag / Beacon */}
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 3, 8]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      {/* Beacon top orb */}
      <mesh position={[0, 3.1, 0]}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial color={haloColor} emissive={haloColor} emissiveIntensity={2} />
      </mesh>
      <Text
        position={[0, 4.2, 0]}
        fontSize={1.0}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {name}
      </Text>
      <Text
        position={[0, 3.5, 0]}
        fontSize={0.5}
        color="#cbd5e1"
        anchorX="center"
        anchorY="middle"
      >
        SEV {severity} • {critical} CRIT
      </Text>
    </group>
  );
}

// --- 3D ROAD NETWORK & GLOWING ROUTES ---

function Road3D({ start, end, status = 'open' }) {
  const isBlocked = status === 'blocked';
  const isFlooded = status === 'flooded';

  const [p1, p2] = useMemo(() => [
    new THREE.Vector3(start[0], 0.05, start[2]),
    new THREE.Vector3(end[0], 0.05, end[2]),
  ], [start, end]);

  const length = p1.distanceTo(p2);
  const mid = p1.clone().add(p2).multiplyScalar(0.5);
  const angle = Math.atan2(p2.x - p1.x, p2.z - p1.z);

  return (
    <group position={[mid.x, 0.05, mid.z]} rotation={[0, angle, 0]}>
      {/* Asphalt strip */}
      <mesh receiveShadow>
        <boxGeometry args={[1.4, 0.05, length]} />
        <meshStandardMaterial
          color={isBlocked ? '#7f1d1d' : isFlooded ? '#78350f' : '#1e293b'}
          roughness={0.8}
        />
      </mesh>
      {/* Road Markings */}
      {isBlocked ? (
        // Hazard cross barriers
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[2.0, 0.6, 0.2]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} />
        </mesh>
      ) : (
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[0.1, 0.02, length * 0.9]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
      )}
    </group>
  );
}

// --- MASTER 3D SCENE ---

export default function Disaster3DMap({ scenario, currentPlan, selectedZoneId, onSelectZone }) {
  const hasZoneE = scenario?.zones?.some(z => z.id === 'zone_e');

  // Waypoints scaled to 3D coordinates from 2D coordinates
  // (x, y) in JSON mapped to ( (x - 260) / 18, 0, (y - 220) / 18 )
  const scalePos = (x, y) => [(x - 260) / 18, 0, (y - 220) / 18];

  const zoneACoords = scalePos(190, 120);
  const zoneBCoords = scalePos(280, 230);
  const zoneCCoords = scalePos(420, 170);
  const zoneDCoords = scalePos(220, 360);
  const zoneECoords = scalePos(340, 300);

  const depotCoords = scalePos(80, 250);
  const hospitalCoords = [0, 0, -2];
  const shelterNorthCoords = scalePos(480, 70);
  const shelterSouthCoords = scalePos(470, 380);

  // Active Vehicle Routes
  const ambulanceRouteA = [
    depotCoords,
    zoneACoords,
    hospitalCoords,
    depotCoords,
  ];

  const ambulanceRouteD = [
    depotCoords,
    zoneDCoords,
    hospitalCoords,
    depotCoords,
  ];

  const busRouteA = [
    zoneACoords,
    zoneBCoords,
    zoneCCoords,
    shelterNorthCoords,
    zoneACoords,
  ];

  const busRouteD = [
    zoneDCoords,
    shelterSouthCoords,
    zoneDCoords,
  ];

  return (
    <div className="relative w-full h-[520px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 32, 34], fov: 42 }}
        shadows
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#080d1a']} />
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[25, 45, 20]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <pointLight position={[0, 15, 0]} intensity={0.8} color="#38bdf8" />

        {/* Orbit Controls with bounded angles */}
        <OrbitControls
          maxPolarAngle={Math.PI / 2.15}
          minDistance={10}
          maxDistance={65}
          enablePan={true}
        />

        {/* Ground Terrain */}
        <mesh position={[0, -0.1, 0]} receiveShadow>
          <planeGeometry args={[80, 60]} />
          <meshStandardMaterial color="#0b1120" roughness={0.9} />
        </mesh>
        <gridHelper args={[70, 35, '#1e293b', '#0f172a']} position={[0, -0.05, 0]} />

        {/* Flooded River Corridor */}
        <mesh position={[2, 0.02, -3]} rotation={[-Math.PI / 2, 0, 0.35]}>
          <planeGeometry args={[10, 48]} />
          <meshStandardMaterial
            color="#1e3a8a"
            transparent
            opacity={0.75}
            roughness={0.1}
            metalness={0.8}
          />
        </mesh>

        {/* 3D Road Network */}
        <Road3D start={depotCoords} end={zoneACoords} />
        <Road3D start={depotCoords} end={zoneBCoords} />
        <Road3D start={depotCoords} end={zoneDCoords} />
        <Road3D start={zoneACoords} end={shelterNorthCoords} status="blocked" />
        <Road3D start={zoneACoords} end={zoneBCoords} />
        <Road3D start={zoneBCoords} end={zoneCCoords} status="flooded" />
        <Road3D start={zoneBCoords} end={zoneDCoords} />
        <Road3D start={zoneCCoords} end={shelterNorthCoords} />
        <Road3D start={zoneCCoords} end={shelterSouthCoords} />
        <Road3D start={zoneDCoords} end={shelterSouthCoords} />

        {hasZoneE && (
          <>
            <Road3D start={zoneECoords} end={zoneBCoords} />
            <Road3D start={zoneECoords} end={zoneDCoords} />
            <Road3D start={zoneECoords} end={shelterSouthCoords} />
          </>
        )}

        {/* Key Facilities */}
        <Building position={depotCoords} size={[3, 2.5, 3]} color="#1e3a8a" label="COMMAND DEPOT" />
        <HospitalBuilding position={hospitalCoords} />
        <ShelterBuilding
          position={shelterNorthCoords}
          name="SHELTER NORTH"
          capacity={150}
          occupancy={currentPlan ? 150 : 0}
        />
        <ShelterBuilding
          position={shelterSouthCoords}
          name="SHELTER SOUTH"
          capacity={100}
          occupancy={currentPlan ? 100 : 0}
        />

        {/* Disaster Zones */}
        <ZoneGroundMarker
          position={zoneACoords}
          name="ZONE A (Riverbank)"
          severity={4}
          critical={8}
          injured={28}
          isSelected={selectedZoneId === 'zone_a'}
          onClick={() => onSelectZone('zone_a')}
        />
        <ZoneGroundMarker
          position={zoneBCoords}
          name="ZONE B (Central)"
          severity={2}
          critical={2}
          injured={8}
          isSelected={selectedZoneId === 'zone_b'}
          onClick={() => onSelectZone('zone_b')}
        />
        <ZoneGroundMarker
          position={zoneCCoords}
          name="ZONE C (East)"
          severity={3}
          critical={4}
          injured={16}
          isSelected={selectedZoneId === 'zone_c'}
          onClick={() => onSelectZone('zone_c')}
        />
        <ZoneGroundMarker
          position={zoneDCoords}
          name="ZONE D (South)"
          severity={4}
          critical={6}
          injured={22}
          isSelected={selectedZoneId === 'zone_d'}
          onClick={() => onSelectZone('zone_d')}
        />

        {hasZoneE && (
          <ZoneGroundMarker
            position={zoneECoords}
            name="ZONE E (DAM BREACH)"
            severity={5}
            critical={14}
            injured={48}
            isSelected={selectedZoneId === 'zone_e'}
            onClick={() => onSelectZone('zone_e')}
          />
        )}

        {/* Moving Vehicles */}
        <Ambulance3D routeWaypoints={ambulanceRouteA} speed={0.3} label="AMB-1" />
        <Ambulance3D routeWaypoints={ambulanceRouteD} speed={0.25} label="AMB-2" />
        <EvacBus3D routeWaypoints={busRouteA} speed={0.2} label="BUS-1" />
        <EvacBus3D routeWaypoints={busRouteD} speed={0.22} label="BUS-2" />

        {/* Water Rescue Boats */}
        <RescueBoat3D position={[-3, 0, -2]} areaRadius={4} />
        <RescueBoat3D position={[4, 0, 5]} areaRadius={3} />

        {/* Airborne Recon Drones */}
        <Drone3D targetPosition={zoneACoords} scanColor="#ef4444" />
        <Drone3D targetPosition={hasZoneE ? zoneECoords : zoneDCoords} scanColor="#38bdf8" />
      </Canvas>

      {/* 3D Map Overlay HUD */}
      <div className="absolute top-3 left-3 bg-slate-900/90 border border-slate-800 backdrop-blur-md px-3 py-2 rounded-xl text-xs flex items-center gap-3 text-slate-300">
        <span className="flex items-center gap-1.5 font-bold text-white uppercase text-[11px] tracking-wider">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          3D Digital Twin Simulation
        </span>
        <span className="text-slate-600">|</span>
        <span className="text-[11px] text-slate-400">Left-click: Rotate • Right-click: Pan • Scroll: Zoom</span>
      </div>

      <div className="absolute bottom-3 right-3 bg-slate-900/90 border border-slate-800 backdrop-blur-md px-3 py-1.5 rounded-lg text-[10px] text-slate-400 font-mono flex items-center gap-3">
        <span className="flex items-center gap-1 text-white">🚑 3 Moving Ambulances</span>
        <span className="flex items-center gap-1 text-amber-400">🚌 2 Evac Buses</span>
        <span className="flex items-center gap-1 text-orange-400">🚤 Rescue Boats</span>
        <span className="flex items-center gap-1 text-cyan-400">🚁 Aerial Drones</span>
      </div>
    </div>
  );
}
