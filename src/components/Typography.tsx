import { Text, TextProps } from 'react-native';
import { PropsWithChildren } from 'react';

/**
 * Componente centralizado para tipografía profesional.
 * Define tamaños y pesos estrictos según guía:
 * - Headers: 20-24px (bold/semibold)
 * - Body: 14-16px (regular/medium)
 * - Captions: 12px (regular)
 */

interface TypographyProps extends PropsWithChildren {
  variant?: 'h1' | 'h2' | 'h3' | 'body' | 'bodySmall' | 'caption' | 'label';
  color?: string;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  tracking?: 'normal' | 'wide' | 'tight';
  align?: 'left' | 'center' | 'right';
  numberOfLines?: number;
  style?: TextProps['style'];
  className?: string; // Aceptado pero ignorado (para compatibilidad)
}

const TYPOGRAPHY_STYLES = {
  h1: {
    fontSize: 24,
    fontWeight: '700', // bold
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 20,
    fontWeight: '600', // semibold
    lineHeight: 28,
    letterSpacing: -0.25,
  },
  h3: {
    fontSize: 18,
    fontWeight: '600', // semibold
    lineHeight: 26,
    letterSpacing: 0,
  },
  body: {
    fontSize: 16,
    fontWeight: '400', // regular
    lineHeight: 24,
    letterSpacing: 0.15,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400', // regular
    lineHeight: 20,
    letterSpacing: 0.25,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400', // regular
    lineHeight: 16,
    letterSpacing: 0.4,
  },
  label: {
    fontSize: 14,
    fontWeight: '500', // medium
    lineHeight: 20,
    letterSpacing: 0.1,
  },
};

const TRACKING_MAP = {
  normal: 0,
  wide: 1,
  tight: -0.5,
};

export default function Typography({
  variant = 'body',
  color,
  weight,
  tracking = 'normal',
  align = 'left',
  numberOfLines,
  className,
  children,
  style,
}: TypographyProps) {
  const baseStyle = TYPOGRAPHY_STYLES[variant];

  // Permitir override de peso si se especifica
  const fontWeightMap: Record<'regular' | 'medium' | 'semibold' | 'bold', string> = {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  };

  const finalStyle = {
    ...baseStyle,
    fontWeight: weight ? fontWeightMap[weight] : baseStyle.fontWeight,
    letterSpacing: (baseStyle.letterSpacing ?? 0) + (TRACKING_MAP[tracking] ?? 0),
    color,
    textAlign: align as any,
    ...(style as any),
  };

  return (
    <Text style={finalStyle} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

/**
 * Hook para acceder a tamaños de tipografía
 * Uso: const sizes = useTypographySizes();
 */
export function useTypographySizes() {
  return TYPOGRAPHY_STYLES;
}
