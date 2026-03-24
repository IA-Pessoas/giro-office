import React from 'react';
import NextLink from 'next/link';

type AnyProps = Record<string, any>;

const resolveResponsive = (v: any) => {
  if (v && typeof v === 'object' && ('base' in v || 'md' in v || 'lg' in v)) {
    // Mimic Chakra's default breakpoints used in this migration:
    // base < 768, md >= 768, lg >= 1024
    if (typeof window !== 'undefined') {
      const width = window.innerWidth;
      if (width >= 1024 && v.lg !== undefined) return v.lg;
      if (width >= 768 && v.md !== undefined) return v.md;
    }
    return v.base ?? v.md ?? v.lg;
  }
  return v;
};

const resolveSpace = (v: any): string | undefined => {
  const value = resolveResponsive(v);
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return `${value * 0.25}rem`; // Chakra space scale ~ 0.25rem per step
  if (typeof value === 'string') {
    if (value === 'full') return '100%';
    return value;
  }
  return undefined;
};

const resolveRadius = (v: any): string | undefined => {
  const value = resolveResponsive(v);
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return `${value * 0.25}rem`;
  if (typeof value === 'string') {
    const map: Record<string, string> = {
      sm: '0.125rem',
      md: '0.375rem',
      lg: '0.5rem',
      xl: '0.75rem',
      '2xl': '1rem',
      full: '9999px',
    };
    return map[value] ?? value;
  }
  return undefined;
};

const tokenToColor = (token: any): string | undefined => {
  if (token === undefined || token === null) return undefined;
  if (typeof token !== 'string') return undefined;
  const t = token;
  const map: Record<string, string> = {
    bodyBg: '#fafafa',
    bodyText: '#010e30',
    primaryText: '#2f406a',
    secondaryText: '#d0ab70',
    componentColor: '#2f406a',
    componentColorReverse: '#d0ab70',
    componentColorDarkOnly: '#fafafa',
    borderColor: '#676767',
    borderColorReverse: '#d0ab70',
    borderColorDarkOnly: '#d0ab70',
    mainOpacity: 'rgba(47,64,106,0.3)',
    mainOpacityReverse: 'rgba(208,171,112,0.3)',
    integracao: '#ef5a8b',
    'integracao.main': '#ef5a8b',
    'integracao.sub': '#c3476f',
    'button.cta': '#a0a0a0',
    'colors.yellow': '#ECC94B',
    'colors.green': '#48BB78',
    'colors.grey': '#A0AEC0',
    'red.500': '#ef4444',
    'whiteAlpha.100': 'rgba(255,255,255,0.1)',
    'componentColorReberse': '#2f406a',
  };
  if (map[t]) return map[t];
  // Accept raw CSS colors/hex
  if (t.startsWith('#') || t.startsWith('rgb') || t.startsWith('hsl')) return t;
  return undefined;
};

const styleFromChakraProps = (props: AnyProps): React.CSSProperties => {
  const style: React.CSSProperties = {};

  const gap = resolveSpace(props.gap);
  if (gap) style.gap = gap;

  const w = resolveResponsive(props.w ?? props.width ?? props.boxSize);
  const h = resolveResponsive(props.h ?? props.height ?? props.boxSize);
  if (w !== undefined) style.width = w === 'full' ? '100%' : (w as any);
  if (h !== undefined) style.height = h === 'full' ? '100%' : (h as any);

  const minW = resolveResponsive(props.minW ?? props.minWidth);
  const maxW = resolveResponsive(props.maxW ?? props.maxWidth);
  if (minW !== undefined) style.minWidth = minW;
  if (maxW !== undefined) style.maxWidth = maxW;

  const minH = resolveResponsive(props.minH ?? props.minHeight);
  const maxH = resolveResponsive(props.maxH ?? props.maxHeight);
  if (minH !== undefined) style.minHeight = minH;
  if (maxH !== undefined) style.maxHeight = maxH;

  style.display = props.display;
  if (props.flexDirection || props.direction) {
    style.flexDirection = props.flexDirection ?? resolveResponsive(props.direction);
  }
  if (props.alignItems) style.alignItems = props.alignItems;
  if (props.justifyContent) style.justifyContent = props.justifyContent;

  const p = resolveSpace(props.p);
  const px = resolveSpace(props.px);
  const py = resolveSpace(props.py);
  const pt = resolveSpace(props.pt);
  const pb = resolveSpace(props.pb);
  const pl = resolveSpace(props.pl);
  const pr = resolveSpace(props.pr);
  const m = resolveSpace(props.m);
  const mx = resolveSpace(props.mx);
  const my = resolveSpace(props.my);
  const mt = resolveSpace(props.mt);
  const mb = resolveSpace(props.mb);
  const ml = resolveSpace(props.ml);
  const mr = resolveSpace(props.mr);

  if (p) style.padding = p;
  if (px) style.paddingLeft = px;
  if (px) style.paddingRight = px;
  if (py) style.paddingTop = py;
  if (py) style.paddingBottom = py;
  if (pt) style.paddingTop = pt;
  if (pb) style.paddingBottom = pb;
  if (pl) style.paddingLeft = pl;
  if (pr) style.paddingRight = pr;

  if (m) style.margin = m;
  if (mx) style.marginLeft = mx;
  if (mx) style.marginRight = mx;
  if (my) style.marginTop = my;
  if (my) style.marginBottom = my;
  if (mt) style.marginTop = mt;
  if (mb) style.marginBottom = mb;
  if (ml) style.marginLeft = ml;
  if (mr) style.marginRight = mr;

  const bg = tokenToColor(props.bg ?? props.background ?? props.backgroundColor);
  if (bg) style.background = bg;

  const c = tokenToColor(props.color);
  if (c) style.color = c;

  const br = resolveRadius(props.borderRadius ?? props.borderRadius);
  if (br) style.borderRadius = br;

  const borderColor = tokenToColor(props.borderColor ?? props.borderColorDarkOnly);
  if (props.border || props.borderWidth) {
    style.borderStyle = 'solid';
    style.borderWidth = props.borderWidth ? resolveSpace(props.borderWidth) : '1px';
    if (borderColor) style.borderColor = borderColor;
  }

  if (props.borderBottom) style.borderBottom = `1px solid ${borderColor ?? '#e2e8f0'}`;
  if (props.borderTop) style.borderTop = `1px solid ${borderColor ?? '#e2e8f0'}`;

  if (props.boxShadow) {
    // Best-effort mapping
    if (props.boxShadow === 'lg') style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)';
  }

  const border = props.border;
  if (border && typeof border === 'string') style.border = border;

  if (props.position) style.position = props.position;
  if (props.pos) style.position = props.pos;
  if (props.top !== undefined) style.top = resolveSpace(props.top) ?? props.top;
  if (props.left !== undefined) style.left = resolveSpace(props.left) ?? props.left;
  if (props.right !== undefined) style.right = resolveSpace(props.right) ?? props.right;
  if (props.bottom !== undefined) style.bottom = resolveSpace(props.bottom) ?? props.bottom;

  if (props.zIndex !== undefined) style.zIndex = props.zIndex;

  if (props.overflow) style.overflow = props.overflow;
  if (props.overflowX) style.overflowX = props.overflowX;
  if (props.overflowY) style.overflowY = props.overflowY;

  if (props.transition) style.transition = props.transition;

  if (props.cursor) style.cursor = props.cursor;
  if (props.opacity !== undefined) style.opacity = props.opacity;

  const fs = resolveResponsive(props.fontSize);
  if (fs !== undefined) style.fontSize = typeof fs === 'number' ? `${fs}px` : fs;
  if (props.fontWeight) style.fontWeight = props.fontWeight;
  if (props.lineHeight) style.lineHeight = props.lineHeight;
  if (props.textAlign) style.textAlign = props.textAlign;

  if (props.boxSize !== undefined) {
    const size = resolveSpace(props.boxSize) ?? resolveResponsive(props.boxSize);
    if (size) {
      style.width = size as any;
      style.height = size as any;
    }
  }

  return style;
};

export function Box({ children, style, ...props }: AnyProps) {
  // Strip some Chakra-only props so they don't become invalid DOM attributes.
  const { as, _hover, _groupHover, _focusVisible, sx, ...rest } = props;
  return (
    <div style={{ ...styleFromChakraProps(rest), ...(style ?? {}) }} {...rest}>
      {children}
    </div>
  );
}

export function Flex({ children, style, ...props }: AnyProps) {
  const { as, _hover, _groupHover, _focusVisible, sx, ...rest } = props;
  return (
    <div style={{ display: 'flex', ...(styleFromChakraProps(rest) as any), ...(style ?? {}) }} {...rest}>
      {children}
    </div>
  );
}

export function HStack({ children, style, spacing, ...props }: AnyProps) {
  const gap = spacing !== undefined ? resolveSpace(spacing) ?? spacing : undefined;
  return (
    <Flex style={style} {...props} flexDirection="row" gap={gap ?? props.gap}>
      {children}
    </Flex>
  );
}

export function VStack({ children, style, spacing, ...props }: AnyProps) {
  const gap = spacing !== undefined ? resolveSpace(spacing) ?? spacing : undefined;
  return (
    <Flex style={style} {...props} flexDirection="column" gap={gap ?? props.gap}>
      {children}
    </Flex>
  );
}

export function Text({ children, style, ...props }: AnyProps) {
  const { as, _hover, _groupHover, sx, ...rest } = props;
  return (
    <p style={{ margin: 0, ...(styleFromChakraProps(rest) as any), ...(style ?? {}) }} {...rest}>
      {children}
    </p>
  );
}

export function Heading({ children, as, style, ...props }: AnyProps) {
  const Tag: any = as ?? 'h2';
  const { as: _ignoredAs, _hover, _groupHover, sx, ...rest } = props;
  return (
    <Tag style={{ margin: 0, ...(styleFromChakraProps(rest) as any), ...(style ?? {}) }} {...rest}>
      {children}
    </Tag>
  );
}

export function Divider({ style, ...props }: AnyProps) {
  const { _hover, _groupHover, sx, ...rest } = props;
  return <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', ...(styleFromChakraProps(rest) as any), ...(style ?? {}) }} />;
}

export function Tooltip({ children }: AnyProps) {
  return <>{children}</>;
}

export function Icon({ as: AsIcon, boxSize, style, ...props }: AnyProps) {
  const size = resolveSpace(boxSize) ?? props.boxSize;
  if (!AsIcon) return null;
  const IconComp = AsIcon as React.ElementType;
  return <IconComp style={{ width: size, height: size, ...(style ?? {}), ...(props.style ?? {}) }} />;
}

export function IconButton({ icon, children, style, ...props }: AnyProps) {
  const { as, _hover, _groupHover, sx, ...rest } = props;
  const isRound = !!props.isRound;
  return (
    <button
      type="button"
      aria-label={props['aria-label']}
      style={{
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        borderRadius: isRound ? '9999px' : undefined,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...(styleFromChakraProps(rest) as any),
        ...(style ?? {}),
      }}
      onClick={props.onClick}
      {...rest}
    >
      {icon ?? children}
    </button>
  );
}

export function Link({ href, children, onClick, style, ...props }: AnyProps) {
  return (
    <NextLink href={href} legacyBehavior>
      <a
        onClick={onClick}
        style={{ textDecoration: 'none', ...(style ?? {}) }}
        {...props}
      >
        {children}
      </a>
    </NextLink>
  );
}

export function SimpleGrid({ children, columns, gap, spacing, style, ...props }: AnyProps) {
  const cols = typeof columns === 'number' ? columns : columns?.lg ?? columns?.md ?? columns?.base ?? 2;
  const g = gap ?? spacing;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: resolveSpace(g) ?? g ?? 12,
        ...(style ?? {}),
        ...(styleFromChakraProps(props) as any),
      }}
    >
      {children}
    </div>
  );
}

export function Tag({ children, colorScheme, style, ...props }: AnyProps) {
  const bgMap: Record<string, string> = {
    gray: '#e2e8f0',
    green: '#dcfce7',
    red: '#fee2e2',
  };
  const bg = bgMap[colorScheme] ?? '#e2e8f0';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.55rem',
        borderRadius: 8,
        background: bg,
        ...(style ?? {}),
      }}
      {...props}
    >
      {children}
    </span>
  );
}

export function FormControl({ children, style, ...props }: AnyProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...(style ?? {}) }} {...props}>
      {children}
    </div>
  );
}

export function FormLabel({ children, style, ...props }: AnyProps) {
  return (
    <label style={{ fontWeight: 700, fontSize: '0.9rem', ...(style ?? {}) }} {...props}>
      {children}
    </label>
  );
}

export function Input({ style, ...props }: AnyProps) {
  return (
    <input
      style={{
        width: '100%',
        border: '1px solid #cbd5e1',
        borderRadius: 8,
        padding: '0.55rem 0.7rem',
        ...(style ?? {}),
      }}
      {...props}
    />
  );
}

export function Select({ style, ...props }: AnyProps) {
  return (
    <select
      style={{
        width: '100%',
        border: '1px solid #cbd5e1',
        borderRadius: 8,
        padding: '0.55rem 0.7rem',
        background: '#fff',
        ...(style ?? {}),
      }}
      {...props}
    />
  );
}

export function Textarea({ style, ...props }: AnyProps) {
  return (
    <textarea
      style={{
        width: '100%',
        border: '1px solid #cbd5e1',
        borderRadius: 8,
        padding: '0.55rem 0.7rem',
        ...(style ?? {}),
      }}
      {...props}
    />
  );
}

export function Switch({ isChecked, onChange, style, ...props }: AnyProps) {
  return (
    <input
      type="checkbox"
      checked={!!isChecked}
      onChange={onChange}
      style={style}
      {...props}
    />
  );
}

export function Button({ children, style, isLoading, disabled, isDisabled, ...props }: AnyProps) {
  return (
    <button
      type={props.type ?? 'button'}
      disabled={disabled || isDisabled || isLoading}
      onClick={props.onClick}
      style={{
        border: '1px solid transparent',
        borderRadius: 8,
        padding: '0.6rem 0.85rem',
        background: tokenToColor(props.bg ?? props.background) ?? (props.bg ? undefined : '#ef5a8b'),
        color: tokenToColor(props.color) ?? '#fff',
        cursor: disabled || isDisabled || isLoading ? 'not-allowed' : 'pointer',
        opacity: disabled || isDisabled || isLoading ? 0.7 : 1,
        ...(style ?? {}),
      }}
      {...props}
    >
      {isLoading ? '...' : children}
    </button>
  );
}

export function Spinner() {
  return <div style={{ padding: 8, fontSize: 14 }}>Carregando...</div>;
}

export function Badge({ children, colorScheme, style, ...props }: AnyProps) {
  const bgMap: Record<string, string> = {
    green: '#dcfce7',
    red: '#fee2e2',
    blue: '#dbeafe',
    purple: '#f5f3ff',
    gray: '#e2e8f0',
  };
  const bg = bgMap[colorScheme] ?? '#e2e8f0';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.55rem',
        borderRadius: 8,
        background: bg,
        ...(style ?? {}),
      }}
      {...props}
    >
      {children}
    </span>
  );
}

export function Card({ children, style, ...props }: AnyProps) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: 0,
        ...(style ?? {}),
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, style, ...props }: AnyProps) {
  return <div style={{ padding: '1rem', ...(style ?? {}) }} {...props}>{children}</div>;
}

export function Checkbox({ isChecked, onChange, style, ...props }: AnyProps) {
  return <input type="checkbox" checked={!!isChecked} onChange={onChange} style={style} {...props} />;
}

export function useDisclosure() {
  const ReactAny = React as any;
  // Using React state via the imported React singleton.
  const [isOpen, setIsOpen] = ReactAny.useState(false);
  const onOpen = () => setIsOpen(true);
  const onClose = () => setIsOpen(false);
  const onToggle = () => setIsOpen((v: boolean) => !v);
  return { isOpen, onOpen, onClose, onToggle };
}

export function Table({ children, style, ...props }: AnyProps) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', ...(style ?? {}) }} {...props}>
      {children}
    </table>
  );
}

export function Thead({ children, ...props }: AnyProps) {
  return <thead {...props}>{children}</thead>;
}
export function Tbody({ children, ...props }: AnyProps) {
  return <tbody {...props}>{children}</tbody>;
}
export function Tr({ children, ...props }: AnyProps) {
  return <tr {...props}>{children}</tr>;
}
export function Th({ children, style, ...props }: AnyProps) {
  return <th style={{ textAlign: 'left', padding: '0.5rem 0.35rem', borderBottom: '1px solid #e2e8f0', ...(style ?? {}) }} {...props}>{children}</th>;
}
export function Td({ children, style, ...props }: AnyProps) {
  return <td style={{ textAlign: 'left', padding: '0.5rem 0.35rem', borderBottom: '1px solid #f1f5f9', ...(style ?? {}) }} {...props}>{children}</td>;
}

// --- Popover (simplified) ---
const PopoverContext = React.createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

export function Popover({ children }: AnyProps) {
  const [open, setOpen] = React.useState(false);
  return <PopoverContext.Provider value={{ open, setOpen }}>{children}</PopoverContext.Provider>;
}

export function PopoverTrigger({ children }: AnyProps) {
  const ctx = React.useContext(PopoverContext);
  if (!ctx) return <>{children}</>;
  const child = React.Children.only(children) as React.ReactElement<any>;
  return React.cloneElement(child, {
    onClick: (e: any) => {
      child.props?.onClick?.(e);
      ctx.setOpen(!ctx.open);
    },
  });
}

export function PopoverContent({ children, style, ...props }: AnyProps) {
  const ctx = React.useContext(PopoverContext);
  if (!ctx?.open) return null;
  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 1001,
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: 12,
        minWidth: 240,
        ...(style ?? {}),
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function PopoverHeader({ children, style, ...props }: AnyProps) {
  return (
    <div style={{ fontWeight: 800, marginBottom: 8, ...(style ?? {}) }} {...props}>
      {children}
    </div>
  );
}

export function PopoverBody({ children, style, ...props }: AnyProps) {
  return (
    <div style={{ marginBottom: 8, ...(style ?? {}) }} {...props}>
      {children}
    </div>
  );
}

export function PopoverFooter({ children, style, ...props }: AnyProps) {
  return (
    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, ...(style ?? {}) }} {...props}>
      {children}
    </div>
  );
}

export function PopoverArrow() {
  return null;
}

export function PopoverCloseButton({ style, ...props }: AnyProps) {
  const ctx = React.useContext(PopoverContext);
  return (
    <button
      type="button"
      style={{ position: 'absolute', top: 8, right: 8, border: 'none', background: 'transparent', cursor: 'pointer', ...(style ?? {}) }}
      onClick={() => ctx?.setOpen(false)}
      aria-label="Close"
      {...props}
    >
      x
    </button>
  );
}

export function PopoverAnchor({ children }: AnyProps) {
  return <>{children}</>;
}

// --- ButtonGroup (simple wrapper) ---
export function ButtonGroup({ children, style, ...props }: AnyProps) {
  return (
    <div style={{ display: 'inline-flex', gap: 8, ...(style ?? {}) }} {...props}>
      {children}
    </div>
  );
}

