import type { SVGProps } from 'react';

export type IconName =
  | 'anchor' | 'swords' | 'target' | 'shield' | 'trophy' | 'scroll'
  | 'compass' | 'coins' | 'share' | 'dice' | 'rotate' | 'flag'
  | 'skull' | 'gear' | 'plus' | 'minus' | 'arrow-right' | 'check'
  | 'lock' | 'bolt' | 'wheel' | 'crown' | 'ship' | 'user' | 'grid'
  | 'medal' | 'handshake' | 'crosshair' | 'wave' | 'logout'
  | 'clock' | 'info' | 'pencil';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function Icon({ name, size = 20, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...rest}>
      {paths(name)}
    </svg>
  );
}

function paths(name: IconName) {
  switch (name) {
    case 'anchor':
      return <g {...P}><circle cx="12" cy="5" r="2.4" /><path d="M12 7.4V21" /><path d="M5 12H3a9 9 0 0 0 18 0h-2" /><path d="M8 10l4-2 4 2" /></g>;
    case 'swords':
      return <g {...P}><path d="M14.5 3.5 21 3l-.5 6.5" /><path d="M3 14.5 14.5 3" /><path d="m13 11 3 3" /><path d="m5 13 6 6" /><path d="M3 21l3-3" /><path d="M9.5 20.5 3 21l.5-6.5" /><path d="M21 14.5 9.5 3" /><path d="m11 13-3 3" /><path d="m19 13-6 6" /><path d="M21 21l-3-3" /></g>;
    case 'target':
      return <g {...P}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></g>;
    case 'crosshair':
      return <g {...P}><circle cx="12" cy="12" r="8" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></g>;
    case 'shield':
      return <g {...P}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" /></g>;
    case 'trophy':
      return <g {...P}><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" /><path d="M12 13v4M9 21h6M10 17h4" /></g>;
    case 'scroll':
      return <g {...P}><path d="M5 5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2V5Z" /><path d="M5 5a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h2" /><path d="M9 8h6M9 12h6M9 16h3" /></g>;
    case 'compass':
      return <g {...P}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></g>;
    case 'coins':
      return <g {...P}><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3" /><path d="M15 11.2c2.4.4 4 1.5 4 2.8 0 1.7-2.7 3-6 3-1 0-2-.1-2.8-.3" /><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" /></g>;
    case 'share':
      return <g {...P}><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M12 16V4M8 8l4-4 4 4" /></g>;
    case 'dice':
      return <g {...P}><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="8.5" cy="8.5" r="1" fill="currentColor" stroke="none" /><circle cx="15.5" cy="8.5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="8.5" cy="15.5" r="1" fill="currentColor" stroke="none" /><circle cx="15.5" cy="15.5" r="1" fill="currentColor" stroke="none" /></g>;
    case 'rotate':
      return <g {...P}><path d="M21 12a9 9 0 1 1-2.6-6.3" /><path d="M21 4v4h-4" /></g>;
    case 'flag':
      return <g {...P}><path d="M5 21V4" /><path d="M5 4h11l-2 3 2 3H5" /></g>;
    case 'skull':
      return <g {...P}><path d="M5 11a7 7 0 1 1 14 0c0 2-1 3.4-2 4v2.5a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V15c-1-.6-2-2-2-4Z" /><circle cx="9" cy="11" r="1.4" fill="currentColor" stroke="none" /><circle cx="15" cy="11" r="1.4" fill="currentColor" stroke="none" /><path d="M11 20v-2M13 20v-2" /></g>;
    case 'gear':
      return <g {...P}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></g>;
    case 'plus':
      return <g {...P}><path d="M12 5v14M5 12h14" /></g>;
    case 'minus':
      return <g {...P}><path d="M5 12h14" /></g>;
    case 'arrow-right':
      return <g {...P}><path d="M5 12h14M13 6l6 6-6 6" /></g>;
    case 'check':
      return <g {...P}><path d="M4 12.5 9 17.5 20 6.5" /></g>;
    case 'lock':
      return <g {...P}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></g>;
    case 'bolt':
      return <g {...P}><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" /></g>;
    case 'wheel':
      return <g {...P}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M19.1 4.9l-2.9 2.9M7.8 16.2l-2.9 2.9" /></g>;
    case 'crown':
      return <g {...P}><path d="M3 8l4 4 5-7 5 7 4-4-2 12H5L3 8Z" /></g>;
    case 'ship':
      return <g {...P}><path d="M3 15l1.5 5h15L21 15" /><path d="M5 15V8h9l4 4v3" /><path d="M9 8V5h3" /></g>;
    case 'user':
      return <g {...P}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></g>;
    case 'grid':
      return <g {...P}><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M4 9h16M4 14h16M9 4v16M14 4v16" /></g>;
    case 'medal':
      return <g {...P}><circle cx="12" cy="14" r="6" /><path d="M9 8 6 2M15 8l3-6M11 12l1-1v5" /></g>;
    case 'handshake':
      return <g {...P}><path d="M4 13h14M4 11h16" /></g>;
    case 'wave':
      return <g {...P}><path d="M3 8c2 0 2 2 4.5 2S10 8 12 8s2 2 4.5 2S19 8 21 8M3 14c2 0 2 2 4.5 2S10 14 12 14s2 2 4.5 2S19 14 21 14" /></g>;
    case 'logout':
      return <g {...P}><path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 12H3M6 8l-4 4 4 4" /></g>;
    case 'clock':
      return <g {...P}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></g>;
    case 'info':
      return <g {...P}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="7.5" r="0.6" fill="currentColor" /></g>;
    case 'pencil':
      return <g {...P}><path d="M17 3a2.4 2.4 0 0 1 3.4 3.4L8 19l-4 1 1-4L17 3Z" /></g>;
    default:
      return null;
  }
}
