// ──────────────────────────────────────────────
//  Main Game Page – top-level React component
// ──────────────────────────────────────────────

import React, { useEffect, useState, useCallback, useRef } from 'react';
import GameCanvas from '../game/render/GameCanvas';
import Notifications from '../game/ui/Notifications';
import ContextMenu from '../game/ui/ContextMenu';
import GameOverScreen from '../game/ui/GameOverScreen';
import RaidWarningBanner from '../game/ui/RaidWarningBanner';
import EventModal from '../game/ui/EventModal';
import KeyboardShortcuts from '../game/ui/KeyboardShortcuts';
import { pushMinimapPing } from '../game/ui/Minimap';
import { WelcomeSplash } from '../game/ui/ObjectivesPanel';
import GameLayout from '../game/ui/shell/GameLayout';
import type { ContextMenuState } from '../game/ui/ContextMenu';
import { startGameLoop, stopGameLoop, setOnTickCallback } from '../game/GameLoop';
import { gameState, createInitialGameState, setGameState, pushNotification } from '../game/core/GameState';
import { EventBus } from '../game/core/EventBus';
import type { BuildingType } from '../game/core/EventBus';
import type { WallSegment } from '../game/core/GameState';
import { enterCommandMode } from '../game/core/CommandState';
import { resetResearchState } from '../game/systems/TechnologySystem';
import { resetTradeState } from '../game/systems/TradeSystem';
import { resetStrongholdState } from '../game/systems/StrongholdSystem';
import { resetOceanState } from '../game/systems/OceanSystem';
import { setPath } from '../game/systems/JobSystem';
import { garrisonUnit, GARRISON_CAPACITY } from '../game/systems/GarrisonSystem';
import { unassignCitizen } from '../game/systems/JobAssignmentSystem';
import { enqueueSoldierTraining } from '../game/systems/RaidSystem';
import '../game/ui/styles/rts-shell.css';

const INTRO_KEY = 'medieval_realm_intro_seen';

// ── Formation types ───────────────────────────────────────────────────────────
type FormationType = 'line' | 'box' | 'wedge' | 'spread' | 'circle';
type RightClickTargetKind = 'terrain' | 'resource' | 'building' | 'enemy' | 'enemy_worker' | 'enemy_structure';

interface RightClickTarget {
  kind: RightClickTargetKind;
  id: number | null;
  x: number;
  z: number;
}

function getFormationPositions(
  unitIds: number[],
  formationType: FormationType,
  center: { x: number; z: number },
): Map<number, { x: number; z: number }> {
  const positions = new Map<number, { x: number; z: number }>();
  const spacing = 2.2;

  unitIds.forEach((id, index) => {
    let localX = 0, localZ = 0;
    switch (formationType) {
      case 'line': { localX = (index - (unitIds.length - 1) / 2) * spacing; localZ = 0; break; }
      case 'box': { const cols = Math.ceil(Math.sqrt(unitIds.length)); localX = (index % cols - (cols - 1) / 2) * spacing; localZ = Math.floor(index / cols) * spacing; break; }
      case 'wedge': { const row = Math.floor(Math.sqrt(index * 2)); const posInRow = index - (row * (row - 1)) / 2; localX = (posInRow - row / 2) * spacing; localZ = row * spacing; break; }
      case 'spread': { const angle = (index / unitIds.length) * Math.PI * 2; const radius = spacing * Math.ceil(unitIds.length / 6); localX = Math.cos(angle) * radius; localZ = Math.sin(angle) * radius; break; }
      case 'circle': { const angle = (index / unitIds.length) * Math.PI * 2; const radius = spacing * (unitIds.length / (2 * Math.PI)); localX = Math.cos(angle) * radius; localZ = Math.sin(angle) * radius; break; }
    }
    positions.set(id, { x: center.x + localX, z: center.z + localZ });
  });

  return positions;
}

function detectRightClickTarget(worldX: number, worldZ: number): RightClickTarget {
  let best: RightClickTarget = { kind: 'terrain', id: null, x: worldX, z: worldZ };
  let bestD2 = Infinity;

  gameState.military.enemies.forEach((enemy, enemyId) => {
    if (enemy.state === 'dead') return;
    const et = gameState.military.enemyTransforms.get(enemyId);
    if (!et) return;
    const dx = et.x - worldX;
    const dz = et.z - worldZ;
    const d2 = dx * dx + dz * dz;
    if (d2 <= 2.4 * 2.4 && d2 < bestD2) {
      best = { kind: 'enemy', id: enemyId, x: et.x, z: et.z };
      bestD2 = d2;
    }
  });

  gameState.enemyFaction.workerEntities.forEach((w, wid) => {
    const dx = w.x - worldX;
    const dz = w.z - worldZ;
    const d2 = dx * dx + dz * dz;
    if (d2 <= 2.6 * 2.6 && d2 < bestD2) {
      best = { kind: 'enemy_worker', id: wid, x: w.x, z: w.z };
      bestD2 = d2;
    }
  });

  gameState.enemyFaction.visualStructures.forEach((s) => {
    if (s.state !== 'active' || (s.hp ?? s.maxHp ?? 1) <= 0) return;
    const dx = s.x - worldX;
    const dz = s.z - worldZ;
    const d2 = dx * dx + dz * dz;
    if (d2 <= 5.2 * 5.2 && d2 < bestD2) {
      best = { kind: 'enemy_structure', id: s.id, x: s.x, z: s.z };
      bestD2 = d2;
    }
  });

  gameState.resourceNodes.forEach((node, nodeId) => {
    if (node.depleted || node.amount <= 0) return;
    const t = gameState.transforms.get(nodeId);
    if (!t) return;
    const dx = t.x - worldX;
    const dz = t.z - worldZ;
    const d2 = dx * dx + dz * dz;
    if (d2 <= 3.2 * 3.2 && d2 < bestD2) {
      best = { kind: 'resource', id: nodeId, x: t.x, z: t.z };
      bestD2 = d2;
    }
  });

  gameState.buildings.forEach((building, buildingId) => {
    if (building.state !== 'active' && building.state !== 'under_construction') return;
    const t = gameState.transforms.get(buildingId);
    if (!t) return;
    const dx = t.x - worldX;
    const dz = t.z - worldZ;
    const d2 = dx * dx + dz * dz;
    if (d2 <= 4.6 * 4.6 && d2 < bestD2) {
      best = { kind: 'building', id: buildingId, x: t.x, z: t.z };
      bestD2 = d2;
    }
  });

  return best;
}

function issueCitizenMove(citizenId: number, x: number, z: number): void {
  setPath(citizenId, x, z);
  const job = gameState.jobs.get(citizenId);
  if (job) {
    job.jobType = 'idle';
    job.actionState = 'idle';
    job.targetEntityId = null;
    job.assignedBuildingId = null;
  }
  const citizen = gameState.citizens.get(citizenId);
  if (citizen) citizen.animState = 'walk';
}

function issueCitizenGather(citizenId: number, nodeId: number): void {
  const node = gameState.resourceNodes.get(nodeId);
  const nt = gameState.transforms.get(nodeId);
  const job = gameState.jobs.get(citizenId);
  if (!node || !nt || !job) return;

  const jobForResource = node.resourceType === 'wood' ? 'woodcutter'
    : node.resourceType === 'stone' ? 'quarryman'
    : 'farmer';
  job.jobType = jobForResource as any;
  job.actionState = 'moving_to_resource';
  job.targetEntityId = nodeId;
  job.assignedBuildingId = node.resourceType === 'food' ? nodeId : null;
  setPath(citizenId, nt.x, nt.z);
  const citizen = gameState.citizens.get(citizenId);
  if (citizen) citizen.animState = 'walk';
}

function issueSoldierMove(soldierId: number, x: number, z: number): void {
  const soldier = gameState.military.soldiers.get(soldierId);
  if (!soldier || soldier.state === 'dead') return;
  soldier.targetEnemyId = null;
  soldier.targetEnemyWorkerId = null;
  soldier.targetEnemyStructureId = null;
  soldier.patrolWaypoints = [{ x, z }];
  soldier.patrolIndex = 0;
  soldier.state = 'patrolling';
}

function issueSoldierAttack(soldierId: number, enemyId: number, targetKind: 'enemy' | 'enemy_worker' | 'enemy_structure' = 'enemy'): void {
  const soldier = gameState.military.soldiers.get(soldierId);
  if (!soldier || soldier.state === 'dead') return;
  soldier.targetEnemyId = null;
  soldier.targetEnemyWorkerId = null;
  soldier.targetEnemyStructureId = null;
  if (targetKind === 'enemy') {
    const enemy = gameState.military.enemies.get(enemyId);
    if (!enemy || enemy.state === 'dead') return;
    soldier.targetEnemyId = enemyId;
  } else if (targetKind === 'enemy_worker') {
    if (!gameState.enemyFaction.workerEntities.has(enemyId)) return;
    soldier.targetEnemyWorkerId = enemyId;
  } else {
    const s = gameState.enemyFaction.visualStructures.find((v) => v.id === enemyId && v.state === 'active' && (v.hp ?? v.maxHp ?? 1) > 0);
    if (!s) return;
    soldier.targetEnemyStructureId = enemyId;
  }
  soldier.state = 'engaging';
}

const SelectionActionPopup: React.FC<{
  selectedEntity: number | null;
  selectedSoldierId: number | null;
  multiSelected: number[];
  onClose: () => void;
}> = ({ selectedEntity, selectedSoldierId, multiSelected, onClose }) => {
  const hasMulti = multiSelected.length > 1;
  if (!hasMulti && selectedEntity === null && selectedSoldierId === null) return null;

  const btnStyle: React.CSSProperties = {
    background: 'hsla(36,24%,12%,0.96)',
    color: 'hsl(42 35% 82%)',
    border: '1px solid hsl(38 30% 28%)',
    borderRadius: 8,
    padding: '7px 10px',
    fontSize: 12,
    cursor: 'pointer',
  };

  const wrapStyle: React.CSSProperties = {
    position: 'fixed',
    left: '50%',
    bottom: 206,
    transform: 'translateX(-50%)',
    zIndex: 240,
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid hsl(38 28% 24%)',
    background: 'hsla(26,30%,8%,0.92)',
    backdropFilter: 'blur(6px)',
    boxShadow: '0 8px 26px hsla(24,45%,2%,0.55)',
  };

  const closeBtn = (
    <button style={{ ...btnStyle, padding: '4px 8px' }} onClick={onClose}>✕</button>
  );

  if (hasMulti) {
    return (
      <div style={wrapStyle}>
        <button style={btnStyle} onClick={() => pushNotification('Right-click terrain/resource/enemy to command group.', 'info')}>Group Orders</button>
        {closeBtn}
      </div>
    );
  }

  if (selectedSoldierId !== null && gameState.military.soldiers.has(selectedSoldierId)) {
    return (
      <div style={wrapStyle}>
        <button style={btnStyle} onClick={() => enterCommandMode('awaiting_move_target', selectedSoldierId, 'soldier', 'Click terrain to move soldier')}>Move</button>
        <button style={btnStyle} onClick={() => enterCommandMode('awaiting_attack_target', selectedSoldierId, 'soldier', 'Click enemy to attack')}>Attack</button>
        <button style={btnStyle} onClick={() => {
          const s = gameState.military.soldiers.get(selectedSoldierId);
          if (!s) return;
          s.state = 'idle';
          s.targetEnemyId = null;
          s.targetEnemyWorkerId = null;
          s.targetEnemyStructureId = null;
          s.patrolWaypoints = [];
        }}>Stop</button>
        {closeBtn}
      </div>
    );
  }

  if (selectedEntity !== null && gameState.citizens.has(selectedEntity)) {
    return (
      <div style={wrapStyle}>
        <button style={btnStyle} onClick={() => enterCommandMode('awaiting_move_target', selectedEntity, 'citizen', 'Click terrain to move citizen')}>Move</button>
        <button style={btnStyle} onClick={() => enterCommandMode('awaiting_work_target', selectedEntity, 'citizen', 'Click a resource node')}>Gather</button>
        <button style={btnStyle} onClick={() => {
          let tcX = 0, tcZ = 0;
          gameState.buildings.forEach((b, id) => {
            if (b.type !== 'town_center') return;
            const t = gameState.transforms.get(id);
            if (!t) return;
            tcX = t.x; tcZ = t.z;
          });
          setPath(selectedEntity, tcX, tcZ);
        }}>Home</button>
        <button style={btnStyle} onClick={() => unassignCitizen(selectedEntity)}>Unassign</button>
        {closeBtn}
      </div>
    );
  }

  if (selectedEntity !== null && gameState.buildings.has(selectedEntity)) {
    const b = gameState.buildings.get(selectedEntity)!;
    return (
      <div style={wrapStyle}>
        {b.type === 'barracks' && (
          <>
            <button style={btnStyle} onClick={() => enqueueSoldierTraining(selectedEntity, 'spearman')}>Train Spearman</button>
            <button style={btnStyle} onClick={() => enqueueSoldierTraining(selectedEntity, 'archer')}>Train Archer</button>
          </>
        )}
        <button style={btnStyle} onClick={() => pushNotification('Use command card below for full building actions.', 'info')}>More</button>
        {closeBtn}
      </div>
    );
  }

  if (selectedEntity !== null && gameState.resourceNodes.has(selectedEntity)) {
    return (
      <div style={wrapStyle}>
        <button style={btnStyle} onClick={() => pushNotification('Select a worker, then right-click this resource to gather.', 'info')}>Gather With Worker</button>
        {closeBtn}
      </div>
    );
  }

  return null;
};

const Game: React.FC = () => {
  const [tick, setTick] = useState(0);
  const [buildMode, setBuildMode] = useState<BuildingType | null>(null);
  const [wallDrawMode, setWallDrawMode] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<number | null>(null);
  const [selectedSoldierId, setSelectedSoldierId] = useState<number | null>(null);
  const [multiSelected, setMultiSelected] = useState<number[]>([]);
  const [showIntro, setShowIntro] = useState(() => !localStorage.getItem(INTRO_KEY));
  const [gameOver, setGameOver] = useState<{ won: boolean } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false, x: 0, y: 0, worldX: 0, worldZ: 0,
    entityId: null, entityType: 'terrain',
  });
  const tickRef = useRef(0);
  const multiSelectedRef = useRef<number[]>([]);
  const idleCitizenCycleRef = useRef(0);
  const idleSoldierCycleRef = useRef(0);

  useEffect(() => {
    let uiTimer = 0;
    setOnTickCallback(() => {
      tickRef.current++;
      uiTimer++;
      if (uiTimer >= 3) { uiTimer = 0; setTick((t) => t + 1); }
    });

    startGameLoop();

    const unsubSelect = EventBus.on('EntitySelected', ({ entityId }) => {
      gameState.selectables.forEach((s) => { s.isSelected = false; });
      gameState.military.soldiers.forEach((s) => { s.selected = false; });
      setSelectedEntity(entityId);
      if (entityId !== null) {
        const sel = gameState.selectables.get(entityId);
        if (sel) sel.isSelected = true;
        multiSelectedRef.current = [];
        gameState.selectedGroupIds = [];
        setMultiSelected([]);
      } else {
        gameState.selectedGroupIds = [];
      }
    });
    const unsubGameOver = EventBus.on('GameOver', ({ won }) => setGameOver({ won }));
    const unsubSoldier = EventBus.on('SoldierSelected', ({ soldierId }) => {
      gameState.military.soldiers.forEach((s) => { s.selected = false; });
      setSelectedSoldierId(soldierId);
      if (soldierId !== null) {
        const s = gameState.military.soldiers.get(soldierId);
        if (s) s.selected = true;
        multiSelectedRef.current = [];
        gameState.selectedGroupIds = [];
        setMultiSelected([]);
      } else {
        gameState.selectedGroupIds = [];
      }
    });
    const unsubControlGroupRecall = EventBus.on('ControlGroupRecalled', ({ ids }) => {
      const validIds = ids.filter((id) => gameState.citizens.has(id) || (gameState.military.soldiers.has(id) && gameState.military.soldiers.get(id)?.state !== 'dead'));
      if (validIds.length === 0) return;

      gameState.selectables.forEach((s) => { s.isSelected = false; });
      gameState.military.soldiers.forEach((s) => { s.selected = false; });
      gameState.selectedGroupIds = validIds;

      if (validIds.length === 1) {
        const id = validIds[0];
        multiSelectedRef.current = [];
        setMultiSelected([]);
        if (gameState.military.soldiers.has(id)) {
          setSelectedEntity(null);
          setSelectedSoldierId(id);
          gameState.selectedEntity = null;
          gameState.military.selectedSoldierId = id;
          const soldier = gameState.military.soldiers.get(id);
          if (soldier) soldier.selected = true;
        } else {
          setSelectedEntity(id);
          setSelectedSoldierId(null);
          gameState.selectedEntity = id;
          gameState.military.selectedSoldierId = null;
          const sel = gameState.selectables.get(id);
          if (sel) sel.isSelected = true;
        }
        return;
      }

      multiSelectedRef.current = validIds;
      setMultiSelected(validIds);
      setSelectedEntity(null);
      setSelectedSoldierId(null);
      gameState.selectedEntity = null;
      gameState.military.selectedSoldierId = null;
      validIds.forEach((id) => {
        const sel = gameState.selectables.get(id);
        if (sel) sel.isSelected = true;
        const soldier = gameState.military.soldiers.get(id);
        if (soldier) soldier.selected = true;
      });
    });
    const unsubRaid = EventBus.on('RaidStarted', () => {
      pushMinimapPing(-80, -80, '⚔️', 5000);
      pushMinimapPing(80, 80, '⚔️', 5000);
    });

    return () => {
      stopGameLoop();
      unsubSelect();
      unsubGameOver();
      unsubSoldier();
      unsubControlGroupRecall();
      unsubRaid();
    };
  }, []);

  const handleMinimapCameraMove = useCallback((wx: number, wz: number) => {
    (window as any).__minimapCameraTarget = { x: wx, z: wz };
  }, []);

  const handleRestart = useCallback(() => {
    stopGameLoop();
    setGameState(createInitialGameState());
    resetResearchState();
    resetTradeState();
    resetStrongholdState();
    resetOceanState();
    setGameOver(null);
    setSelectedEntity(null);
    setSelectedSoldierId(null);
    multiSelectedRef.current = [];
    setMultiSelected([]);
    setBuildMode(null);
    setWallDrawMode(false);
    setTimeout(() => startGameLoop(), 50);
  }, []);

  const handleIntroClose = useCallback(() => {
    localStorage.setItem(INTRO_KEY, 'true');
    setShowIntro(false);
  }, []);

  const handleSelectBuild = useCallback((type: BuildingType | null) => {
    setBuildMode(type);
    gameState.buildMode = type;
    if (type) setWallDrawMode(false);
  }, []);

  const handleWallDrawMode = useCallback((active: boolean) => {
    setWallDrawMode(active);
    if (active) { setBuildMode(null); gameState.buildMode = null; }
  }, []);

  const handleBuildPlaced = useCallback(() => {
    setBuildMode(null);
    gameState.buildMode = null;
    setTick((t) => t + 1);
  }, []);

  const handleWallPlaced = useCallback((startX: number, startZ: number, endX: number, endZ: number) => {
    if (gameState.resources.stone < 3) {
      pushNotification('Not enough stone for wall segment! (Need 🪨 3)', 'error');
      return;
    }
    gameState.resources.stone -= 3;
    const seg: WallSegment = {
      id: gameState.nextWallId++,
      startX, startZ, endX, endZ,
      hp: 300, maxHp: 300, isGate: false, gateOpen: false,
    };
    gameState.walls.push(seg);
    pushNotification('🧱 Wall segment placed', 'info');
  }, []);

  const handleClearSelection = useCallback(() => {
    gameState.selectables.forEach(s => { s.isSelected = false; });
    gameState.military.soldiers.forEach((s) => { s.selected = false; });
    gameState.selectedEntity = null;
    gameState.military.selectedSoldierId = null;
    setSelectedEntity(null);
    setSelectedSoldierId(null);
    gameState.selectedGroupIds = [];
    setMultiSelected([]);
    EventBus.emit('EntitySelected', { entityId: null });
    EventBus.emit('SoldierSelected', { soldierId: null });
  }, []);

  const handleCanvasRightClick = useCallback((e: MouseEvent, worldX: number, worldZ: number) => {
    const forceContextMenu = e.shiftKey || e.altKey;
    if (contextMenu.visible) setContextMenu((prev) => ({ ...prev, visible: false }));
    const target = detectRightClickTarget(worldX, worldZ);

    const liveMulti = multiSelectedRef.current;
    const selectedSoldiers = new Set<number>();
    const selectedCitizens = new Set<number>();
    if (liveMulti.length > 0) {
      liveMulti.forEach((id) => {
        if (gameState.military.soldiers.has(id)) selectedSoldiers.add(id);
        else if (gameState.citizens.has(id)) selectedCitizens.add(id);
      });
    } else {
      const liveSelectedSoldier = gameState.military.selectedSoldierId ?? selectedSoldierId;
      const liveSelectedEntity = gameState.selectedEntity ?? selectedEntity;
      if (liveSelectedSoldier !== null && gameState.military.soldiers.has(liveSelectedSoldier)) selectedSoldiers.add(liveSelectedSoldier);
      if (liveSelectedEntity !== null && gameState.citizens.has(liveSelectedEntity)) selectedCitizens.add(liveSelectedEntity);
    }
    const hasUnitsSelected = selectedSoldiers.size > 0 || selectedCitizens.size > 0;

    if (!forceContextMenu && hasUnitsSelected) {
      if ((target.kind === 'enemy' || target.kind === 'enemy_worker' || target.kind === 'enemy_structure') && target.id !== null) {
        const k: 'enemy' | 'enemy_worker' | 'enemy_structure' = target.kind === 'enemy' ? 'enemy' : target.kind === 'enemy_worker' ? 'enemy_worker' : 'enemy_structure';
        selectedSoldiers.forEach((id) => issueSoldierAttack(id, target.id!, k));
        const fallbackFormation: FormationType = ((gameState as any).currentFormation as FormationType) ?? 'spread';
        const citizenIds = Array.from(selectedCitizens);
        const retreat = getFormationPositions(citizenIds, fallbackFormation, { x: worldX, z: worldZ });
        citizenIds.forEach((id) => {
          const p = retreat.get(id);
          if (p) issueCitizenMove(id, p.x, p.z);
        });
        return;
      }

      if (target.kind === 'resource' && target.id !== null) {
        selectedCitizens.forEach((id) => issueCitizenGather(id, target.id!));
        const soldierIds = Array.from(selectedSoldiers);
        const guard = getFormationPositions(soldierIds, 'circle', { x: target.x, z: target.z });
        soldierIds.forEach((id) => {
          const p = guard.get(id);
          if (p) issueSoldierMove(id, p.x, p.z);
        });
        return;
      }

      if (target.kind === 'building' && target.id !== null) {
        const building = gameState.buildings.get(target.id);
        if (building && GARRISON_CAPACITY[building.type]) {
          selectedCitizens.forEach((id) => { garrisonUnit(id, target.id!); });
          selectedSoldiers.forEach((id) => { garrisonUnit(id, target.id!); });
          return;
        }
      }

      const allSelected = [...Array.from(selectedSoldiers), ...Array.from(selectedCitizens)];
      const formation: FormationType = ((gameState as any).currentFormation as FormationType) ?? 'box';
      const positions = getFormationPositions(allSelected, formation, { x: target.x, z: target.z });
      EventBus.emit('MoveCommandIssued', { x: target.x, z: target.z });
      allSelected.forEach((id) => {
        const p = positions.get(id);
        if (!p) return;
        if (gameState.military.soldiers.has(id)) issueSoldierMove(id, p.x, p.z);
        else if (gameState.citizens.has(id)) issueCitizenMove(id, p.x, p.z);
      });
      return;
    }

    if (forceContextMenu) {
      const sel = gameState.selectedEntity;
      let entityType: ContextMenuState['entityType'] = 'terrain';
      let entityId: number | null = null;
      if (sel !== null) {
        if (gameState.buildings.get(sel)) { entityType = 'building'; entityId = sel; }
        else if (gameState.citizens.get(sel)) { entityType = 'citizen'; entityId = sel; }
        else if (gameState.resourceNodes.get(sel)) { entityType = 'resource_node'; entityId = sel; }
      }
      setContextMenu({ visible: true, x: e.clientX, y: e.clientY, worldX, worldZ, entityId, entityType });
      return;
    }
    const sel = gameState.selectedEntity;
    let entityType: ContextMenuState['entityType'] = 'terrain';
    let entityId: number | null = null;
    if (sel !== null) {
      if (gameState.buildings.get(sel)) { entityType = 'building'; entityId = sel; }
      else if (gameState.citizens.get(sel)) { entityType = 'citizen'; entityId = sel; }
      else if (gameState.resourceNodes.get(sel)) { entityType = 'resource_node'; entityId = sel; }
    }
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, worldX, worldZ, entityId, entityType });
  }, [selectedSoldierId, selectedEntity, contextMenu.visible]);

  const handleMultiSelect = useCallback((ids: number[]) => {
    multiSelectedRef.current = ids;
    gameState.selectedGroupIds = ids;
    setMultiSelected(ids);
    setSelectedEntity(null);
    setSelectedSoldierId(null);
    gameState.selectedEntity = null;
    gameState.military.selectedSoldierId = null;
    gameState.selectables.forEach(sel => { sel.isSelected = false; });
    gameState.military.soldiers.forEach((s) => { s.selected = false; });
    ids.forEach((id) => {
      const sel = gameState.selectables.get(id);
      if (sel) sel.isSelected = true;
      const soldier = gameState.military.soldiers.get(id);
      if (soldier) soldier.selected = true;
    });
  }, []);

  const handleCloseContext = useCallback(() => setContextMenu(prev => ({ ...prev, visible: false })), []);
  const handleMoveCamera = useCallback((x: number, z: number) => {
    (window as any).__minimapCameraTarget = { x, z };
  }, []);

  const handleTimeScaleChange = useCallback((scale: number) => {
    if (scale === 0) { gameState.paused = true; }
    else { gameState.paused = false; gameState.timeScale = scale; }
    EventBus.emit('TimeScaleChanged', { scale });
  }, []);

  const handleCenterCamera = useCallback(() => {
    let tcX = 0, tcZ = 0;
    gameState.buildings.forEach((b, id) => {
      if (b.type === 'town_center') { const t = gameState.transforms.get(id); if (t) { tcX = t.x; tcZ = t.z; } }
    });
    (window as any).__minimapCameraTarget = { x: tcX, z: tcZ };
  }, []);

  const handleSelectIdleCitizen = useCallback(() => {
    const idleCitizens: number[] = [];
    gameState.citizens.forEach((_, id) => {
      const job = gameState.jobs.get(id);
      if (!!job && job.jobType === 'idle' && (job.actionState === 'idle' || job.actionState === 'sleeping')) {
        idleCitizens.push(id);
      }
    });
    if (idleCitizens.length === 0) {
      pushNotification('No idle citizens available.', 'info');
      return;
    }
    const index = idleCitizenCycleRef.current % idleCitizens.length;
    const id = idleCitizens[index];
    idleCitizenCycleRef.current = index + 1;
    gameState.selectables.forEach((s) => { s.isSelected = false; });
    gameState.military.soldiers.forEach((s) => { s.selected = false; });
    gameState.selectedGroupIds = [];
    gameState.selectedEntity = id;
    gameState.military.selectedSoldierId = null;
    setSelectedEntity(id);
    setSelectedSoldierId(null);
    setMultiSelected([]);
    const sel = gameState.selectables.get(id);
    if (sel) sel.isSelected = true;
    EventBus.emit('EntitySelected', { entityId: id });
    const t = gameState.transforms.get(id);
    if (t) (window as any).__minimapCameraTarget = { x: t.x, z: t.z };
  }, []);

  const handleSelectIdleSoldier = useCallback(() => {
    const idleSoldierIds = Array.from(gameState.military.soldiers.entries())
      .filter(([, s]) => s.state === 'idle')
      .map(([id]) => id);
    if (idleSoldierIds.length === 0) {
      pushNotification('No idle soldiers available.', 'info');
      return;
    }
    const index = idleSoldierCycleRef.current % idleSoldierIds.length;
    const id = idleSoldierIds[index];
    idleSoldierCycleRef.current = index + 1;
    gameState.selectables.forEach((s) => { s.isSelected = false; });
    gameState.military.soldiers.forEach((s) => { s.selected = false; });
    gameState.selectedGroupIds = [];
    gameState.selectedEntity = null;
    gameState.military.selectedSoldierId = id;
    setSelectedEntity(null);
    setSelectedSoldierId(id);
    setMultiSelected([]);
    const soldier = gameState.military.soldiers.get(id);
    if (soldier) soldier.selected = true;
    EventBus.emit('SoldierSelected', { soldierId: id });
    const t = gameState.transforms.get(id);
    if (t) (window as any).__minimapCameraTarget = { x: t.x, z: t.z };
  }, []);

  return (
    <div className="game-root">
      {showIntro && !gameOver && <WelcomeSplash onClose={handleIntroClose} />}
      {gameOver && (
        <GameOverScreen
          won={gameOver.won}
          onRestart={handleRestart}
          onContinue={gameOver.won ? () => setGameOver(null) : undefined}
        />
      )}

      <div className="game-canvas-container">
        <GameCanvas
          tick={tick}
          buildMode={buildMode}
          onBuildPlaced={handleBuildPlaced}
          wallDrawMode={wallDrawMode}
          onWallDrawModeChange={setWallDrawMode}
          onWallPlaced={handleWallPlaced}
          onRightClick={handleCanvasRightClick}
          onMultiSelect={handleMultiSelect}
        />
      </div>

      <GameLayout
        tick={tick}
        selectedEntity={selectedEntity}
        selectedSoldierId={selectedSoldierId}
        multiSelected={multiSelected}
        buildMode={buildMode}
        wallDrawMode={wallDrawMode}
        onSelectBuild={handleSelectBuild}
        onWallDrawMode={handleWallDrawMode}
        onClearSelection={handleClearSelection}
        onTimeScale={handleTimeScaleChange}
        onCameraMove={handleMinimapCameraMove}
        onSelectIdleCitizen={handleSelectIdleCitizen}
        onSelectIdleSoldier={handleSelectIdleSoldier}
      />
      <Notifications tick={tick} />
      <RaidWarningBanner tick={tick} />
      <ContextMenu menu={contextMenu} onClose={handleCloseContext} onMoveCamera={handleMoveCamera} />
      <EventModal tick={tick} />
      <KeyboardShortcuts
        onTimeScale={handleTimeScaleChange}
        onBuildMode={handleSelectBuild}
        onCenterCamera={handleCenterCamera}
      />
    </div>
  );
};

export default Game;
