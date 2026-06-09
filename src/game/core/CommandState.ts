// ──────────────────────────────────────────────
//  CommandState – singleton for actor command mode
//  Tracks the current command the player is issuing
// ──────────────────────────────────────────────

export type CommandMode =
  | 'none'
  | 'selected_citizen'
  | 'selected_soldier'
  | 'awaiting_move_target'
  | 'awaiting_work_target'
  | 'awaiting_attack_target';

export interface CommandState {
  mode: CommandMode;
  selectedEntityId: number | null;
  selectedEntityType: 'citizen' | 'soldier' | 'building' | null;
  hint: string;
}

export const commandState: CommandState = {
  mode: 'none',
  selectedEntityId: null,
  selectedEntityType: null,
  hint: '',
};

export function enterCommandMode(mode: CommandMode, entityId: number, entityType: 'citizen' | 'soldier', hint: string): void {
  commandState.mode = mode;
  commandState.selectedEntityId = entityId;
  commandState.selectedEntityType = entityType;
  commandState.hint = hint;

  const cursors: Partial<Record<CommandMode, string>> = {
    awaiting_move_target: 'crosshair',
    awaiting_work_target: 'pointer',
    awaiting_attack_target: 'cell',
  };
  document.body.style.cursor = cursors[mode] ?? 'default';
}

export function exitCommandMode(): void {
  commandState.mode = 'none';
  commandState.hint = '';
  document.body.style.cursor = 'default';
}

export function cancelToSelection(): void {
  const prev = commandState.selectedEntityType;
  commandState.mode = prev === 'soldier' ? 'selected_soldier' : prev === 'citizen' ? 'selected_citizen' : 'none';
  commandState.hint = '';
  document.body.style.cursor = 'default';
}
