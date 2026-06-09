import { gameState } from '../core/GameState';
import type { TerrainGameplayClass } from '../core/Noise';
import { getTerrainClass } from '../core/Noise';

export function getMovementModifierAt(x: number, z: number): number {
  const cls: TerrainGameplayClass = getTerrainClass(x, z);
  return gameState.terrainGameplay.movement[cls] ?? 1.0;
}

export function getDamageMultiplier(
  attackerX: number,
  attackerZ: number,
  defenderX: number,
  defenderZ: number,
  isRanged: boolean
): number {
  const aClass = getTerrainClass(attackerX, attackerZ);
  const dClass = getTerrainClass(defenderX, defenderZ);
  let mult = 1.0;

  if (aClass === 'highground' && dClass !== 'highground') {
    mult += gameState.terrainGameplay.damageHighgroundBonus;
  }
  if (isRanged && dClass === 'forest') {
    mult -= gameState.terrainGameplay.rangedForestMitigation;
  }

  return Math.max(0.6, Math.min(1.4, mult));
}

export function runTerrainGameplaySystem(_dt: number): void {
  // Intentionally lightweight and deterministic:
  // applies passive bonuses from captured objectives.
  let moraleBonus = 0;
  gameState.mapObjectives.forEach((obj) => {
    if (obj.owner !== 'player') return;
    if (obj.bonus.key === 'morale') moraleBonus += obj.bonus.value;
  });

  if (moraleBonus <= 0) return;
  gameState.citizens.forEach((cit) => {
    cit.happiness = Math.min(100, cit.happiness + moraleBonus * 0.002);
  });
}

