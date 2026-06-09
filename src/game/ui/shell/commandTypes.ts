export interface CommandCardAction {
  id: string;
  iconId: string;
  label: string;
  hotkey?: string;
  enabled: boolean;
  disabledReason?: string;
  cost?: Array<{ type: 'wood' | 'food' | 'stone'; amount: number }>;
  cooldown?: number;
  tooltip: string;
  priorityGroup: 'core' | 'economy' | 'military' | 'utility';
  onInvoke: () => void;
}

