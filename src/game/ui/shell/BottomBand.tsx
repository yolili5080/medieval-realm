import React, { useMemo, useState } from 'react';
import { gameState, pushNotification } from '../../core/GameState';
import type { BuildingType, SoldierType } from '../../core/EventBus';
import { EventBus } from '../../core/EventBus';
import { commandState, enterCommandMode } from '../../core/CommandState';
import { setPath } from '../../systems/JobSystem';
import { unassignCitizen } from '../../systems/JobAssignmentSystem';
import { canUpgradeBuilding, startBuildingUpgrade } from '../../systems/BuildingUpgradeSystem';
import { enqueueSoldierTraining } from '../../systems/RaidSystem';
import { queueSmithyCraft, SMITHY_RECIPES, smithyCrafting, smithyQueue } from '../../systems/SmithySystem';
import { BUILDING_DEFS } from '../../data/buildings';
import { SOLDIER_DEFS } from '../../core/MilitaryTypes';
import type { CommandCardAction } from './commandTypes';
import { RtsIcon, iconForActionId } from './IconAtlas';

interface BottomBandProps {
  tick: number;
  selectedEntity: number | null;
  selectedSoldierId: number | null;
  multiSelected: number[];
  buildMode: BuildingType | null;
  wallDrawMode: boolean;
  onSelectBuild: (type: BuildingType | null) => void;
  onWallDrawMode: (active: boolean) => void;
  onClearSelection: () => void;
  compact?: boolean;
}

const BUILD_ICON: Partial<Record<BuildingType, string>> = {
  house: '🏠',
  storage_barn: '🏚',
  woodcutter_hut: '🪓',
  farm_field: '🌾',
  quarry: '⛏',
  market: '🏪',
  dock: '⚓',
  barracks: '⚔️',
  smithy: '🔨',
  tower: '🗼',
  guard_post: '🚩',
  stronghold: '🏰',
};

const BUILD_ORDER: BuildingType[] = [
  'house', 'storage_barn', 'woodcutter_hut', 'farm_field', 'quarry', 'market',
  'dock', 'barracks', 'smithy', 'tower', 'guard_post', 'stronghold',
];

const COST_ICON = {
  wood: 'wood',
  food: 'food',
  stone: 'stone',
} as const;

function emitInvoked(actionId: string): void {
  EventBus.emit('CommandCardActionInvoked', { actionId });
}

function emitHover(actionId: string | null): void {
  EventBus.emit('CommandCardActionHovered', { actionId });
}

const BottomBand: React.FC<BottomBandProps> = ({
  tick: _tick,
  selectedEntity,
  selectedSoldierId,
  multiSelected,
  buildMode,
  wallDrawMode,
  onSelectBuild,
  onWallDrawMode,
  onClearSelection,
  compact = false,
}) => {
  const [hoveredActionId, setHoveredActionId] = useState<string | null>(null);

  const selectedCitizen = selectedEntity !== null ? gameState.citizens.get(selectedEntity) : null;
  const selectedBuilding = selectedEntity !== null ? gameState.buildings.get(selectedEntity) : null;
  const selectedSoldier = selectedSoldierId !== null ? gameState.military.soldiers.get(selectedSoldierId) : null;
  const selectedTransform = selectedEntity !== null ? gameState.transforms.get(selectedEntity) : null;
  const aliveSoldiers = Array.from(gameState.military.soldiers.entries()).filter(([, s]) => s.state !== 'dead');

  let firstBarracksId: number | null = null;
  gameState.buildings.forEach((b, id) => {
    if (firstBarracksId !== null) return;
    if (b.type === 'barracks' && (b.state === 'active' || b.state === 'under_construction')) firstBarracksId = id;
  });
  const trainingQueue = firstBarracksId !== null ? (gameState.military.trainingQueues.get(firstBarracksId) ?? []) : [];
  const trainingHead = trainingQueue[0];

  const actions = useMemo<CommandCardAction[]>(() => {
    if (selectedCitizen && selectedEntity !== null) {
      return [
        {
          id: 'citizen_move',
          iconId: '📍',
          label: 'Move',
          hotkey: 'M',
          enabled: true,
          tooltip: 'Move selected citizen to target terrain.',
          priorityGroup: 'core',
          onInvoke: () => {
            enterCommandMode('awaiting_move_target', selectedEntity, 'citizen', 'Click terrain to move citizen');
            emitInvoked('citizen_move');
          },
        },
        {
          id: 'citizen_work',
          iconId: '🧰',
          label: 'Gather',
          hotkey: 'G',
          enabled: true,
          tooltip: 'Assign citizen to a nearby resource node.',
          priorityGroup: 'economy',
          onInvoke: () => {
            enterCommandMode('awaiting_work_target', selectedEntity, 'citizen', 'Click a resource node');
            emitInvoked('citizen_work');
          },
        },
        {
          id: 'citizen_home',
          iconId: '🏠',
          label: 'Home',
          enabled: true,
          tooltip: 'Send citizen to Town Center.',
          priorityGroup: 'utility',
          onInvoke: () => {
            let tcX = 0;
            let tcZ = 0;
            gameState.buildings.forEach((b, id) => {
              if (b.type === 'town_center') {
                const t = gameState.transforms.get(id);
                if (t) {
                  tcX = t.x;
                  tcZ = t.z;
                }
              }
            });
            setPath(selectedEntity, tcX, tcZ);
            emitInvoked('citizen_home');
          },
        },
        {
          id: 'citizen_idle',
          iconId: '🛑',
          label: 'Idle',
          enabled: true,
          tooltip: 'Unassign current job and set idle.',
          priorityGroup: 'utility',
          onInvoke: () => {
            unassignCitizen(selectedEntity);
            emitInvoked('citizen_idle');
          },
        },
      ];
    }

    if (selectedSoldier && selectedSoldierId !== null) {
      return [
        {
          id: 'soldier_move',
          iconId: '📍',
          label: 'Move',
          hotkey: 'M',
          enabled: true,
          tooltip: 'Move selected soldier.',
          priorityGroup: 'core',
          onInvoke: () => {
            enterCommandMode('awaiting_move_target', selectedSoldierId, 'soldier', 'Click terrain to move soldier');
            emitInvoked('soldier_move');
          },
        },
        {
          id: 'soldier_attack',
          iconId: '⚔️',
          label: 'Attack',
          hotkey: 'A',
          enabled: true,
          tooltip: 'Order soldier to attack a target.',
          priorityGroup: 'military',
          onInvoke: () => {
            enterCommandMode('awaiting_attack_target', selectedSoldierId, 'soldier', 'Click enemy to attack');
            emitInvoked('soldier_attack');
          },
        },
      ];
    }

    if (selectedBuilding && selectedEntity !== null) {
      const out: CommandCardAction[] = [];
      const canUp = canUpgradeBuilding(selectedEntity);
      out.push({
        id: 'building_upgrade',
        iconId: '⬆️',
        label: 'Upgrade',
        enabled: canUp.canUpgrade,
        disabledReason: canUp.reason,
        tooltip: canUp.canUpgrade ? 'Upgrade this building.' : `Upgrade unavailable: ${canUp.reason ?? 'requirements not met'}`,
        priorityGroup: 'core',
        onInvoke: () => {
          startBuildingUpgrade(selectedEntity);
          emitInvoked('building_upgrade');
        },
      });

      if (selectedBuilding.type === 'barracks') {
        (['spearman', 'swordsman', 'archer', 'knight'] as SoldierType[]).forEach((type) => {
          const def = SOLDIER_DEFS[type];
          const cost = [
            { type: 'food' as const, amount: def.cost.food },
            { type: 'wood' as const, amount: def.cost.wood },
            { type: 'stone' as const, amount: def.cost.stone },
          ].filter((c) => c.amount > 0);
          const affordable = cost.every((c) => gameState.resources[c.type] >= c.amount);
          out.push({
            id: `train_${type}`,
            iconId: type === 'spearman' ? '🪖' : type === 'swordsman' ? '🗡️' : type === 'archer' ? '🏹' : '🐎',
            label: `Train ${def.label}`,
            enabled: affordable,
            disabledReason: affordable ? undefined : 'Not enough resources',
            cost,
            tooltip: `Train ${def.label}`,
            priorityGroup: 'military',
            onInvoke: () => {
              enqueueSoldierTraining(selectedEntity, type);
              emitInvoked(`train_${type}`);
            },
          });
        });
      }

      if (selectedBuilding.type === 'smithy') {
        SMITHY_RECIPES.slice(0, 4).forEach((r) => {
          const cost = Object.entries(r.inputs).map(([type, amount]) => ({ type: type as 'wood' | 'food' | 'stone', amount: amount ?? 0 }));
          const affordable = cost.every((c) => gameState.resources[c.type] >= c.amount);
          out.push({
            id: `craft_${r.output}`,
            iconId: '🛡️',
            label: `Craft ${r.output}`,
            enabled: affordable,
            disabledReason: affordable ? undefined : 'Not enough resources',
            cost,
            tooltip: `Craft ${r.output} at smithy`,
            priorityGroup: 'utility',
            onInvoke: () => {
              queueSmithyCraft(selectedEntity, r.output);
              emitInvoked(`craft_${r.output}`);
            },
          });
        });
      }
      return out;
    }

    if (multiSelected.length > 1) {
      return [
        {
          id: 'group_move',
          iconId: '📐',
          label: 'Formation Move',
          enabled: true,
          tooltip: 'Right-click terrain to move selected group.',
          priorityGroup: 'military',
          onInvoke: () => emitInvoked('group_move'),
        },
      ];
    }

    return BUILD_ORDER.map((type) => {
      const def = BUILDING_DEFS[type];
      const cost = Object.entries(def.constructionCost).map(([k, v]) => ({ type: k as 'wood' | 'food' | 'stone', amount: v }));
      const enabled = cost.every((c) => gameState.resources[c.type] >= c.amount);
      return {
        id: `build_${type}`,
        iconId: BUILD_ICON[type] ?? '🏛',
        label: def.label,
        enabled,
        disabledReason: enabled ? undefined : 'Not enough resources',
        cost,
        tooltip: def.description,
        priorityGroup: 'economy',
        onInvoke: () => {
          onWallDrawMode(false);
          onSelectBuild(buildMode === type ? null : type);
          emitInvoked(`build_${type}`);
        },
      } as CommandCardAction;
    });
  }, [selectedCitizen, selectedEntity, selectedSoldier, selectedSoldierId, selectedBuilding, multiSelected, onSelectBuild, buildMode, onWallDrawMode]);

  const hoveredAction = actions.find((a) => a.id === hoveredActionId) ?? null;
  const actionById = useMemo(() => {
    const map = new Map<string, CommandCardAction>();
    actions.forEach((a) => map.set(a.id, a));
    return map;
  }, [actions]);

  const contextHint = commandState.hint
    || (wallDrawMode
      ? 'Click two terrain points to place wall.'
      : buildMode
      ? `Placing ${buildMode.replace(/_/g, ' ')} - left click to place, Esc to cancel.`
      : 'Select a unit/building to view commands. Right-click terrain to move.');

  const title = selectedCitizen
    ? `${selectedCitizen.name} | Citizen`
    : selectedSoldier
      ? `${selectedSoldier.soldierType} | Soldier`
      : selectedBuilding
        ? `${BUILDING_DEFS[selectedBuilding.type].label} | Building`
        : multiSelected.length > 1
          ? `${multiSelected.length} units selected`
          : 'No Selection';

  const nextActionHint = useMemo(() => {
    const activeRaid = gameState.military.activeRaid;
    if (activeRaid) return 'Raid active: select soldiers, press Attack [A], then click enemies or right-click the frontline.';
    if (wallDrawMode) return 'Wall Draw active: click start and end points to place a wall segment.';
    if (buildMode) return `Build mode active: place ${buildMode.replace(/_/g, ' ')} on valid terrain.`;
    if (selectedCitizen) return 'Citizen selected: click Gather, then click a resource node.';
    if (selectedSoldier) return 'Soldier selected: click Attack [A], then click an enemy.';
    if (selectedBuilding) return 'Building selected: use Upgrade or production commands in the grid.';
    if (multiSelected.length > 1) return 'Group selected: right-click terrain to move formation.';
    return 'No unit selected: choose a build command or select a unit to begin.';
  }, [selectedCitizen, selectedSoldier, selectedBuilding, multiSelected, wallDrawMode, buildMode]);

  const recommendedActionId = useMemo(() => {
    if (buildMode || wallDrawMode) return null;
    if (gameState.military.activeRaid) return selectedSoldier ? 'soldier_attack' : null;
    if (selectedCitizen) return 'citizen_work';
    if (selectedSoldier) return 'soldier_attack';
    if (!selectedCitizen && !selectedSoldier && !selectedBuilding && multiSelected.length === 0) return 'build_house';
    return null;
  }, [selectedCitizen, selectedSoldier, selectedBuilding, multiSelected, buildMode, wallDrawMode]);

  const hasSelection = selectedEntity !== null || selectedSoldierId !== null || multiSelected.length > 0;
  const currentSelectionIds = multiSelected.length > 0
    ? multiSelected
    : [
      ...(selectedSoldierId !== null ? [selectedSoldierId] : []),
      ...(selectedEntity !== null ? [selectedEntity] : []),
    ];
  const controlGroupSlots = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <div className={`rts-bottom-band ${compact ? 'compact' : ''}`}>
      <div className="rts-selection-summary">
        <div className="rts-selection-title">{title}</div>
        <div className="rts-selection-meta">
          {selectedTransform ? `X ${selectedTransform.x.toFixed(1)} · Z ${selectedTransform.z.toFixed(1)}` : 'Global command mode'}
        </div>
        <div className="rts-context-hint">{contextHint}</div>
        {hasSelection && (
          <button className="rts-clear-btn" onClick={onClearSelection}>Clear Selection</button>
        )}
      </div>

      <div className="rts-command-area">
        <div className="rts-command-card-grid">
          {Array.from({ length: 12 }).map((_, idx) => {
            const action = actions[idx];
            if (!action) return <div key={idx} className="rts-command-slot empty" />;
            return (
              <button
                key={action.id}
                className={`rts-command-slot group-${action.priorityGroup} ${!action.enabled ? 'disabled' : ''} ${recommendedActionId === action.id ? 'recommended' : ''}`}
                disabled={!action.enabled}
                onClick={action.onInvoke}
                onMouseEnter={() => {
                  setHoveredActionId(action.id);
                  emitHover(action.id);
                }}
                onMouseLeave={() => {
                  setHoveredActionId((prev) => (prev === action.id ? null : prev));
                  emitHover(null);
                }}
                title={action.enabled ? action.tooltip : `${action.tooltip}\n${action.disabledReason ?? ''}`}
              >
                <span className="rts-command-icon-wrap">
                  <RtsIcon name={iconForActionId(action.id)} className="rts-command-icon-svg" />
                </span>
                <span className="rts-command-label">{action.label}</span>
                {action.hotkey && <span className="rts-command-hotkey">{action.hotkey}</span>}
              </button>
            );
          })}
        </div>

        <div className="rts-parchment-tooltip" aria-live="polite">
          {hoveredAction ? (
            <>
              <div className="rts-parchment-head">
                <span className="rts-parchment-icon"><RtsIcon name={iconForActionId(hoveredAction.id)} className="rts-parchment-icon-svg" /></span>
                <span className="rts-parchment-title">{hoveredAction.label}</span>
                {hoveredAction.hotkey && <span className="rts-parchment-key">[{hoveredAction.hotkey}]</span>}
              </div>
              <div className="rts-parchment-text">{hoveredAction.tooltip}</div>
              <div className="rts-parchment-cta">Left-click to execute command</div>
              {hoveredAction.cost && hoveredAction.cost.length > 0 && (
                <div className="rts-parchment-costs">
                  {hoveredAction.cost.map((c) => (
                    <span key={`${hoveredAction.id}-${c.type}`} className="rts-cost-pill">
                      <RtsIcon name={COST_ICON[c.type]} className="rts-cost-icon-svg" /> {c.amount}
                    </span>
                  ))}
                </div>
              )}
              {!hoveredAction.enabled && (
                <div className="rts-parchment-warning">Unavailable: {hoveredAction.disabledReason ?? 'requirements not met'}</div>
              )}
            </>
          ) : (
            <>
              <div className="rts-parchment-head">
                <span className="rts-parchment-title">Command Help</span>
              </div>
              <div className="rts-parchment-text">Hover a command to inspect purpose, hotkey, and cost.</div>
            </>
          )}
        </div>

        {recommendedActionId && actionById.get(recommendedActionId) && (
          <div className="rts-recommended-strip">
            Next Best Action:
            <button
              className="rts-recommended-btn"
              onClick={() => {
                const action = actionById.get(recommendedActionId);
                if (!action || !action.enabled) return;
                action.onInvoke();
              }}
            >
              {actionById.get(recommendedActionId)?.label}
              {actionById.get(recommendedActionId)?.hotkey ? ` [${actionById.get(recommendedActionId)?.hotkey}]` : ''}
            </button>
          </div>
        )}
      </div>

      <div className="rts-context-details">
        <div className="rts-details-title">Guidance</div>
        <div className={`rts-details-row ${gameState.military.activeRaid ? 'raid' : ''}`}>{nextActionHint}</div>
        <div className="rts-details-row">Controls: Left-click select · Right-click move/command · Shift+Right-click force menu</div>
        <div className="rts-details-row">
          <div className="rts-mini-title">Control Groups (Right-click to assign)</div>
          <div className="rts-control-groups">
            {controlGroupSlots.map((slot) => {
              const ids = (gameState.controlGroups as Record<number, number[]>)[slot] ?? [];
              const validIds = ids.filter((id) => gameState.citizens.has(id) || (gameState.military.soldiers.has(id) && gameState.military.soldiers.get(id)?.state !== 'dead'));
              const selectedIds = (gameState.selectedGroupIds ?? []).slice().sort((a, b) => a - b);
              const groupIds = validIds.slice().sort((a, b) => a - b);
              const isActive = selectedIds.length > 0
                && selectedIds.length === groupIds.length
                && selectedIds.every((id, i) => id === groupIds[i]);
              return (
                <button
                  key={slot}
                  className={`rts-control-chip ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    if (validIds.length === 0) return;
                    EventBus.emit('ControlGroupRecalled', { group: slot, ids: validIds });
                    pushNotification(`Control Group ${slot} recalled (${validIds.length})`, 'info');
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (currentSelectionIds.length === 0) return;
                    (gameState.controlGroups as Record<number, number[]>)[slot] = currentSelectionIds.slice();
                    EventBus.emit('ControlGroupAssigned', { group: slot, ids: currentSelectionIds.slice() });
                    pushNotification(`Control Group ${slot} assigned (${currentSelectionIds.length})`, 'success');
                  }}
                  title={`Group ${slot}${validIds.length > 0 ? ` (${validIds.length})` : ''}`}
                >
                  <span className="num">{slot}</span>
                  <span className="count">{validIds.length}</span>
                </button>
              );
            })}
          </div>
        </div>
        {aliveSoldiers.length > 0 && (
          <div className="rts-details-row">
            <div className="rts-mini-title">Soldier Keys</div>
            <div className="rts-soldier-keys">
              {aliveSoldiers.slice(0, 9).map(([id, soldier], idx) => (
                <button
                  key={id}
                  className={`rts-soldier-key ${gameState.military.selectedSoldierId === id ? 'active' : ''}`}
                  onClick={() => {
                    gameState.military.selectedSoldierId = id;
                    EventBus.emit('SoldierSelected', { soldierId: id });
                  }}
                  title={`Select ${soldier.soldierType} (${idx + 1})`}
                >
                  <span className="num">{idx + 1}</span>
                  <span className="type">{soldier.soldierType}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {trainingQueue.length > 0 && (
          <div className="rts-details-row">
            <div className="rts-mini-title">Training Queue</div>
            <div className="rts-training-line">
              {trainingHead ? `Now: ${trainingHead.soldierType} (${Math.ceil(trainingHead.timeRemaining)}s)` : 'Idle'}
            </div>
            {trainingQueue.length > 1 && (
              <div className="rts-training-tail">
                Next: {trainingQueue.slice(1, 4).map((q, i) => (
                  <span key={`${q.soldierType}-${i}`}>{q.soldierType}{i < Math.min(trainingQueue.length - 2, 2) ? ' -> ' : ''}</span>
                ))}
              </div>
            )}
          </div>
        )}
        {selectedBuilding?.type === 'barracks' && (
          <div className="rts-details-row">Barracks Queue: {(gameState.military.trainingQueues.get(selectedEntity!) ?? []).length}</div>
        )}
        {selectedBuilding?.type === 'smithy' && (
          <>
            <div className="rts-details-row">Smithy Crafting: {smithyCrafting.get(selectedEntity!)?.recipe.output ?? 'None'}</div>
            <div className="rts-details-row">Smithy Queue: {(smithyQueue.get(selectedEntity!) ?? []).length}</div>
          </>
        )}
        <div className="rts-details-row">Mode: {buildMode ? `Build ${buildMode}` : wallDrawMode ? 'Wall Draw' : 'Normal'}</div>
        {hasSelection && (
          <button className="rts-clear-btn" onClick={onClearSelection}>Clear Selection</button>
        )}
      </div>
    </div>
  );
};

export default BottomBand;
