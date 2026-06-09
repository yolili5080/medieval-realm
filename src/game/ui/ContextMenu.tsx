// ──────────────────────────────────────────────
//  ContextMenu – right-click context menu
//  Shows on terrain, buildings, citizens
// ──────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import { gameState, pushNotification, addResource } from '../core/GameState';
import { EventBus } from '../core/EventBus';
import { unassignCitizen } from '../systems/JobAssignmentSystem';

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  worldX: number;
  worldZ: number;
  entityId: number | null;
  entityType: 'terrain' | 'building' | 'citizen' | 'resource_node';
}

interface ContextMenuProps {
  menu: ContextMenuState;
  onClose: () => void;
  onMoveCamera: (x: number, z: number) => void;
}

const MenuItem: React.FC<{
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}> = ({ icon, label, onClick, danger, disabled }) => (
  <button
    onClick={() => { if (!disabled) onClick(); }}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      padding: '7px 12px',
      background: 'none',
      border: 'none',
      borderRadius: 4,
      color: disabled ? 'hsl(42 10% 35%)' : danger ? 'hsl(0 60% 62%)' : 'hsl(42 30% 80%)',
      fontSize: 12,
      cursor: disabled ? 'not-allowed' : 'pointer',
      textAlign: 'left',
      transition: 'background 0.1s',
    }}
    onMouseOver={e => { if (!disabled) e.currentTarget.style.background = danger ? 'hsla(0,40%,18%,0.8)' : 'hsla(38,30%,18%,0.7)'; }}
    onMouseOut={e => { e.currentTarget.style.background = 'none'; }}
  >
    <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{icon}</span>
    <span>{label}</span>
  </button>
);

const Divider: React.FC = () => (
  <div style={{ height: 1, background: 'hsl(38 20% 18%)', margin: '3px 8px' }} />
);

const ContextMenu: React.FC<ContextMenuProps> = ({ menu, onClose, onMoveCamera }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu.visible) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    setTimeout(() => window.addEventListener('click', handler), 10);
    window.addEventListener('keydown', keyHandler);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', keyHandler);
    };
  }, [menu.visible, onClose]);

  if (!menu.visible) return null;

  // Compute menu position, keep in viewport
  const menuW = 200;
  const menuH = 200;
  const left = Math.min(menu.x, window.innerWidth - menuW - 8);
  const top = Math.min(menu.y, window.innerHeight - menuH - 8);

  const entityId = menu.entityId;
  const building = entityId !== null ? gameState.buildings.get(entityId) : null;
  const citizen = entityId !== null ? gameState.citizens.get(entityId) : null;
  const selectable = entityId !== null ? gameState.selectables.get(entityId) : null;

  const handleDemolish = () => {
    if (!building || entityId === null) return;
    // Return 50% of build cost
    const cost = building.constructionCost;
    for (const [res, amt] of Object.entries(cost) as [any, number][]) {
      addResource(res, Math.floor((amt ?? 0) * 0.5));
    }
    // Unassign workers
    for (const wId of building.assignedWorkers) {
      const job = gameState.jobs.get(wId);
      if (job) {
        job.jobType = 'idle';
        job.actionState = 'idle';
        job.assignedBuildingId = null;
        job.targetEntityId = null;
      }
    }
    // Remove from ECS
    gameState.buildings.delete(entityId);
    gameState.resourceNodes.delete(entityId);
    gameState.isResourceNode.delete(entityId);
    gameState.transforms.delete(entityId);
    gameState.renders.delete(entityId);
    gameState.selectables.delete(entityId);
    gameState.isBuilding.delete(entityId);
    gameState.selectedEntity = null;

    EventBus.emit('EntitySelected', { entityId: null });
    EventBus.emit('BuildingDemolished', { buildingId: entityId });
    pushNotification(`${selectable?.label ?? 'Building'} demolished.`, 'warning');
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left, top,
        zIndex: 500,
        background: 'hsla(28,22%,9%,0.97)',
        border: '1px solid hsl(38 25% 22%)',
        borderRadius: 8,
        minWidth: 190,
        boxShadow: '0 8px 32px hsla(28,30%,4%,0.8)',
        backdropFilter: 'blur(8px)',
        overflow: 'hidden',
        padding: '4px 0',
        userSelect: 'none',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        padding: '6px 12px 5px',
        borderBottom: '1px solid hsl(38 20% 16%)',
        fontSize: 10, color: 'hsl(42 15% 45%)',
        letterSpacing: '0.1em', textTransform: 'uppercase',
        marginBottom: 3,
      }}>
        {menu.entityType === 'terrain' && 'Terrain'}
        {menu.entityType === 'building' && (selectable?.label ?? 'Building')}
        {menu.entityType === 'citizen' && (selectable?.label ?? 'Citizen')}
        {menu.entityType === 'resource_node' && 'Resource Node'}
      </div>

      {/* Terrain menu */}
      {menu.entityType === 'terrain' && (
        <>
          <MenuItem
            icon="🔨"
            label="Build here"
            onClick={() => { pushNotification('Open the Build Menu (left) to place a building.', 'info'); onClose(); }}
          />
          <MenuItem
            icon="🧱"
            label="Start wall here"
            onClick={() => { pushNotification('Select 🏰 Walls tab in the Build Menu, then click Draw Wall.', 'info'); onClose(); }}
          />
          <MenuItem
            icon="⚔️"
            label={`Move soldiers here (${Array.from(gameState.military.soldiers.values()).filter(s => s.state !== 'dead').length})`}
            onClick={() => {
              const count = Array.from(gameState.military.soldiers.values()).filter(s => s.state !== 'dead').length;
              if (count === 0) { pushNotification('No soldiers to command.', 'info'); onClose(); return; }
              pushNotification(`⚔️ ${count} soldiers moving to position`, 'info');
              gameState.military.soldiers.forEach((s, sid) => {
                if (s.state === 'dead') return;
                const t = gameState.military.soldierTransforms.get(sid);
                if (t) { t.x = menu.worldX + (Math.random() - 0.5) * 4; t.z = menu.worldZ + (Math.random() - 0.5) * 4; }
                s.state = 'idle';
                s.patrolWaypoints = [];
              });
              onClose();
            }}
            disabled={Array.from(gameState.military.soldiers.values()).filter(s => s.state !== 'dead').length === 0}
          />
        </>
      )}


      {/* Building menu */}
      {menu.entityType === 'building' && building && (
        <>
          <MenuItem
            icon="🔨"
            label="Assign worker"
            onClick={() => {
              if (entityId !== null) {
                gameState.selectables.forEach(s => { s.isSelected = false; });
                const s = gameState.selectables.get(entityId);
                if (s) s.isSelected = true;
                gameState.selectedEntity = entityId;
                EventBus.emit('EntitySelected', { entityId });
              }
              onClose();
            }}
          />
          <MenuItem
            icon="📋"
            label="View details"
            onClick={() => {
              if (entityId !== null) {
                gameState.selectables.forEach(s => { s.isSelected = false; });
                const s = gameState.selectables.get(entityId);
                if (s) s.isSelected = true;
                gameState.selectedEntity = entityId;
                EventBus.emit('EntitySelected', { entityId });
              }
              onClose();
            }}
          />
          {building.type !== 'town_center' && (
            <>
              <Divider />
              <MenuItem
                icon="🔥"
                label="Demolish building"
                onClick={handleDemolish}
                danger
              />
            </>
          )}
        </>
      )}

      {/* Citizen menu */}
      {menu.entityType === 'citizen' && citizen && entityId !== null && (
        <>
          <MenuItem
            icon="💼"
            label="View details"
            onClick={() => {
              gameState.selectables.forEach(s => { s.isSelected = false; });
              const s = gameState.selectables.get(entityId);
              if (s) s.isSelected = true;
              gameState.selectedEntity = entityId;
              EventBus.emit('EntitySelected', { entityId });
              onClose();
            }}
          />
          <MenuItem
            icon="🚫"
            label="Unassign job"
            onClick={() => { unassignCitizen(entityId); onClose(); }}
          />
          <MenuItem
            icon="🏠"
            label="Send home (idle)"
            onClick={() => {
              const job = gameState.jobs.get(entityId);
              if (job) {
                job.jobType = 'idle';
                job.actionState = 'idle';
                job.targetEntityId = null;
                job.assignedBuildingId = null;
              }
              onClose();
            }}
          />
        </>
      )}

      {/* Resource node menu */}
      {menu.entityType === 'resource_node' && (
        <>
          <MenuItem
            icon="📋"
            label="View details"
            onClick={() => {
              if (entityId !== null) {
                gameState.selectables.forEach(s => { s.isSelected = false; });
                const s = gameState.selectables.get(entityId);
                if (s) s.isSelected = true;
                gameState.selectedEntity = entityId;
                EventBus.emit('EntitySelected', { entityId });
              }
              onClose();
            }}
          />
        </>
      )}
    </div>
  );
};

export default ContextMenu;
