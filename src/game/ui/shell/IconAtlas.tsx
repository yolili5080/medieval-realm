import React from 'react';

export type RtsIconName =
  | 'wood' | 'food' | 'stone' | 'population' | 'worker'
  | 'pause' | 'play' | 'playFast' | 'playFaster' | 'thirdPerson' | 'save' | 'settings'
  | 'drawerLeft' | 'drawerRight'
  | 'house' | 'storage' | 'woodcutter' | 'farm' | 'quarry' | 'market' | 'dock' | 'barracks' | 'smithy' | 'tower' | 'guard' | 'stronghold'
  | 'move' | 'gather' | 'home' | 'idle' | 'attack' | 'group' | 'upgrade'
  | 'trainSpearman' | 'trainSwordsman' | 'trainArcher' | 'trainKnight'
  | 'craft';

interface IconProps {
  name: RtsIconName;
  className?: string;
}

const SvgBase: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ className, children }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {children}
  </svg>
);

export const RtsIcon: React.FC<IconProps> = ({ name, className }) => {
  const stroke = 'currentColor';
  const sw = 1.8;

  switch (name) {
    case 'wood':
      return <SvgBase className={className}><rect x="5" y="6" width="13" height="11" rx="2" stroke={stroke} strokeWidth={sw} /><path d="M9 6V17M14 6V17" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'food':
      return <SvgBase className={className}><path d="M7 18C10 14 10 10 7 6M7 18C5 16 4 13 5 10M7 18C9 16 10 13 9 10" stroke={stroke} strokeWidth={sw} strokeLinecap="round" /><path d="M13 18C16 14 16 10 13 6M13 18C11 16 10 13 11 10M13 18C15 16 16 13 15 10" stroke={stroke} strokeWidth={sw} strokeLinecap="round" /></SvgBase>;
    case 'stone':
      return <SvgBase className={className}><path d="M12 4L19 9L16 18H8L5 9L12 4Z" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'population':
      return <SvgBase className={className}><circle cx="9" cy="9" r="3" stroke={stroke} strokeWidth={sw} /><circle cx="16" cy="10" r="2.4" stroke={stroke} strokeWidth={sw} /><path d="M4 19C4 15.8 6.3 14 9 14C11.7 14 14 15.8 14 19" stroke={stroke} strokeWidth={sw} /><path d="M13 19C13 16.8 14.5 15.4 16.6 15.4C18.6 15.4 20 16.8 20 19" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'worker':
      return <SvgBase className={className}><circle cx="8" cy="8" r="2.5" stroke={stroke} strokeWidth={sw} /><path d="M5 19C5 16.7 6.5 15 8.7 15C10.8 15 12.2 16.7 12.2 19" stroke={stroke} strokeWidth={sw} /><path d="M14 7L20 13M17 7L20 10M14 10L17 13" stroke={stroke} strokeWidth={sw} strokeLinecap="round" /></SvgBase>;
    case 'pause':
      return <SvgBase className={className}><rect x="6.5" y="5.5" width="4" height="13" rx="1" stroke={stroke} strokeWidth={sw} /><rect x="13.5" y="5.5" width="4" height="13" rx="1" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'play':
      return <SvgBase className={className}><path d="M8 6L18 12L8 18V6Z" stroke={stroke} strokeWidth={sw} fill="currentColor" /></SvgBase>;
    case 'playFast':
      return <SvgBase className={className}><path d="M5 6L12 12L5 18V6Z" stroke={stroke} strokeWidth={sw} fill="currentColor" /><path d="M12 6L19 12L12 18V6Z" stroke={stroke} strokeWidth={sw} fill="currentColor" /></SvgBase>;
    case 'playFaster':
      return <SvgBase className={className}><path d="M4 6L9 12L4 18V6Z" stroke={stroke} strokeWidth={sw} fill="currentColor" /><path d="M10 6L15 12L10 18V6Z" stroke={stroke} strokeWidth={sw} fill="currentColor" /><path d="M16 6L21 12L16 18V6Z" stroke={stroke} strokeWidth={sw} fill="currentColor" /></SvgBase>;
    case 'thirdPerson':
      return <SvgBase className={className}><circle cx="12" cy="7.5" r="3" stroke={stroke} strokeWidth={sw} /><path d="M6.5 20C6.5 16.6 8.8 14.5 12 14.5C15.2 14.5 17.5 16.6 17.5 20" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'save':
      return <SvgBase className={className}><path d="M5 5H17L19 7V19H5V5Z" stroke={stroke} strokeWidth={sw} /><rect x="8" y="5.5" width="6" height="4" stroke={stroke} strokeWidth={sw} /><rect x="8" y="13" width="8" height="5" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'settings':
      return <SvgBase className={className}><circle cx="12" cy="12" r="3" stroke={stroke} strokeWidth={sw} /><path d="M12 4V6M12 18V20M4 12H6M18 12H20M6.3 6.3L7.7 7.7M16.3 16.3L17.7 17.7M17.7 6.3L16.3 7.7M7.7 16.3L6.3 17.7" stroke={stroke} strokeWidth={sw} strokeLinecap="round" /></SvgBase>;
    case 'drawerLeft':
      return <SvgBase className={className}><rect x="5" y="4" width="14" height="16" rx="2" stroke={stroke} strokeWidth={sw} /><path d="M12 8L9 12L12 16" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" /></SvgBase>;
    case 'drawerRight':
      return <SvgBase className={className}><rect x="5" y="4" width="14" height="16" rx="2" stroke={stroke} strokeWidth={sw} /><path d="M12 8L15 12L12 16" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" /></SvgBase>;
    case 'house':
      return <SvgBase className={className}><path d="M4 11L12 5L20 11" stroke={stroke} strokeWidth={sw} /><rect x="6.5" y="11" width="11" height="8" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'storage':
      return <SvgBase className={className}><rect x="4.5" y="6" width="15" height="12.5" rx="1.5" stroke={stroke} strokeWidth={sw} /><path d="M4.5 10H19.5M4.5 14H19.5" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'woodcutter':
      return <SvgBase className={className}><path d="M7 17L13.5 10.5M11.2 8.8L14.7 5.3L18.7 9.3L15.2 12.8Z" stroke={stroke} strokeWidth={sw} /><path d="M6 18L9 21" stroke={stroke} strokeWidth={sw} strokeLinecap="round" /></SvgBase>;
    case 'farm':
      return <SvgBase className={className}><path d="M4 18H20M6 18V10M10 18V8M14 18V10M18 18V8" stroke={stroke} strokeWidth={sw} /><path d="M6 10C8 9 8 7 6 6M10 8C12 7 12 5 10 4M14 10C16 9 16 7 14 6M18 8C20 7 20 5 18 4" stroke={stroke} strokeWidth={sw} strokeLinecap="round" /></SvgBase>;
    case 'quarry':
      return <SvgBase className={className}><path d="M4 17L12 6L20 17H4Z" stroke={stroke} strokeWidth={sw} /><path d="M12 10L14 14H10L12 10Z" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'market':
      return <SvgBase className={className}><path d="M4 10H20L18 6H6L4 10Z" stroke={stroke} strokeWidth={sw} /><rect x="6" y="10" width="12" height="9" stroke={stroke} strokeWidth={sw} /><path d="M11 10V19M6 14H18" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'dock':
      return <SvgBase className={className}><path d="M12 4V14M9 7L12 4L15 7" stroke={stroke} strokeWidth={sw} /><path d="M7 14H17M8 14C8 16 9.3 18 12 18C14.7 18 16 16 16 14" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'barracks':
      return <SvgBase className={className}><path d="M7 6L10 9L7 12M17 6L14 9L17 12" stroke={stroke} strokeWidth={sw} /><rect x="5" y="13" width="14" height="6" rx="1.2" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'smithy':
      return <SvgBase className={className}><path d="M6 8L12 14M10 4L20 14M5 19L10 14L14 18L9 23" stroke={stroke} strokeWidth={sw} strokeLinecap="round" /></SvgBase>;
    case 'tower':
      return <SvgBase className={className}><rect x="8" y="6" width="8" height="13" stroke={stroke} strokeWidth={sw} /><path d="M6 6H18M10 10H14M10 14H14" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'guard':
      return <SvgBase className={className}><path d="M12 4L18 6V11C18 15 15.5 18 12 20C8.5 18 6 15 6 11V6L12 4Z" stroke={stroke} strokeWidth={sw} /><path d="M12 8V16" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'stronghold':
      return <SvgBase className={className}><path d="M5 19V9H19V19M5 9L8 6H10L12 8L14 6H16L19 9" stroke={stroke} strokeWidth={sw} /><path d="M10 19V14H14V19" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'move':
      return <SvgBase className={className}><path d="M12 4V20M4 12H20M12 4L9 7M12 4L15 7M12 20L9 17M12 20L15 17M4 12L7 9M4 12L7 15M20 12L17 9M20 12L17 15" stroke={stroke} strokeWidth={sw} strokeLinecap="round" /></SvgBase>;
    case 'gather':
      return <SvgBase className={className}><path d="M7 17L14 10" stroke={stroke} strokeWidth={sw} /><path d="M13 8L16 5L19 8L16 11Z" stroke={stroke} strokeWidth={sw} /><path d="M5 19L8 22" stroke={stroke} strokeWidth={sw} strokeLinecap="round" /></SvgBase>;
    case 'home':
      return <SvgBase className={className}><path d="M4 11L12 5L20 11" stroke={stroke} strokeWidth={sw} /><rect x="7" y="11" width="10" height="8" stroke={stroke} strokeWidth={sw} /><rect x="11" y="14" width="2" height="5" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'idle':
      return <SvgBase className={className}><circle cx="12" cy="12" r="8" stroke={stroke} strokeWidth={sw} /><path d="M12 8V12L15 14" stroke={stroke} strokeWidth={sw} strokeLinecap="round" /></SvgBase>;
    case 'attack':
      return <SvgBase className={className}><path d="M5 5L19 19M19 5L5 19" stroke={stroke} strokeWidth={sw} /><circle cx="12" cy="12" r="2.2" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'group':
      return <SvgBase className={className}><circle cx="8" cy="9" r="2.3" stroke={stroke} strokeWidth={sw} /><circle cx="16" cy="9" r="2.3" stroke={stroke} strokeWidth={sw} /><path d="M5 18C5 15.8 6.2 14.4 8 14.4C9.8 14.4 11 15.8 11 18M13 18C13 15.8 14.2 14.4 16 14.4C17.8 14.4 19 15.8 19 18" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'upgrade':
      return <SvgBase className={className}><path d="M12 20V6M12 6L7 11M12 6L17 11" stroke={stroke} strokeWidth={sw} strokeLinecap="round" /><rect x="6" y="20" width="12" height="2" rx="1" fill="currentColor" /></SvgBase>;
    case 'trainSpearman':
      return <SvgBase className={className}><path d="M12 3L14 7L12 21M10 7L12 3L14 7" stroke={stroke} strokeWidth={sw} strokeLinecap="round" /><path d="M7 11H17" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'trainSwordsman':
      return <SvgBase className={className}><path d="M12 4L16 8L12 12L8 8L12 4Z" stroke={stroke} strokeWidth={sw} /><path d="M12 12V20M9 20H15" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'trainArcher':
      return <SvgBase className={className}><path d="M8 5C14 8 14 16 8 19" stroke={stroke} strokeWidth={sw} /><path d="M8 5L15 12L8 19M15 12H20" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'trainKnight':
      return <SvgBase className={className}><path d="M8 19L10 6H14L16 19H8Z" stroke={stroke} strokeWidth={sw} /><path d="M10 8L8 6L10 4M14 8L16 6L14 4" stroke={stroke} strokeWidth={sw} /></SvgBase>;
    case 'craft':
      return <SvgBase className={className}><path d="M6 7L12 13M10 3L20 13M5 19L10 14L14 18L9 23" stroke={stroke} strokeWidth={sw} strokeLinecap="round" /></SvgBase>;
    default:
      return <SvgBase className={className}><circle cx="12" cy="12" r="7" stroke={stroke} strokeWidth={sw} /></SvgBase>;
  }
};

export function iconForActionId(actionId: string): RtsIconName {
  if (actionId.startsWith('build_house')) return 'house';
  if (actionId.startsWith('build_storage_barn')) return 'storage';
  if (actionId.startsWith('build_woodcutter_hut')) return 'woodcutter';
  if (actionId.startsWith('build_farm_field')) return 'farm';
  if (actionId.startsWith('build_quarry')) return 'quarry';
  if (actionId.startsWith('build_market')) return 'market';
  if (actionId.startsWith('build_dock')) return 'dock';
  if (actionId.startsWith('build_barracks')) return 'barracks';
  if (actionId.startsWith('build_smithy')) return 'smithy';
  if (actionId.startsWith('build_tower')) return 'tower';
  if (actionId.startsWith('build_guard_post')) return 'guard';
  if (actionId.startsWith('build_stronghold')) return 'stronghold';
  if (actionId.startsWith('citizen_move') || actionId.startsWith('soldier_move')) return 'move';
  if (actionId.startsWith('citizen_work')) return 'gather';
  if (actionId.startsWith('citizen_home')) return 'home';
  if (actionId.startsWith('citizen_idle')) return 'idle';
  if (actionId.startsWith('soldier_attack')) return 'attack';
  if (actionId.startsWith('group_move')) return 'group';
  if (actionId.startsWith('building_upgrade')) return 'upgrade';
  if (actionId.startsWith('train_spearman')) return 'trainSpearman';
  if (actionId.startsWith('train_swordsman')) return 'trainSwordsman';
  if (actionId.startsWith('train_archer')) return 'trainArcher';
  if (actionId.startsWith('train_knight')) return 'trainKnight';
  if (actionId.startsWith('craft_')) return 'craft';
  return 'move';
}
