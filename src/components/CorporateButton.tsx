import { Pressable, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Typography from './Typography';

export type CorporateButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type CorporateButtonSize = 'sm' | 'md' | 'lg';

interface CorporateButtonProps {
  label?: string;
  onPress: () => void;
  variant?: CorporateButtonVariant;
  size?: CorporateButtonSize;
  icon?: { name: string; position?: 'left' | 'right' };
  theme: {
    text: string;
    muted: string;
    panelBg: string;
    border: string;
    inputBorder: string;
  };
  accent: {
    color: string;
    border: string;
    soft: string;
  };
  accentTextColor: string;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  hitSlop?: { top?: number; bottom?: number; left?: number; right?: number };
  testID?: string;
  children?: React.ReactNode;
  className?: string;
  style?: ViewStyle;
}

export default function CorporateButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  theme,
  accent,
  accentTextColor,
  disabled = false,
  loading = false,
  fullWidth = true,
  hitSlop = { top: 15, bottom: 15, left: 15, right: 15 },
  testID,
  children,
  className = '',
  style,
}: CorporateButtonProps) {
  // Size-based sizing and typography
  const sizeConfig = {
    sm: { height: 36, px: 3, py: 2, textVariant: 'caption' as const },
    md: { height: 48, px: 4, py: 3, textVariant: 'body' as const },
    lg: { height: 56, px: 5, py: 4, textVariant: 'body' as const },
  };

  const config = sizeConfig[size];

  // Variant-based styling
  const variantStyles = {
    primary: {
      bg: accent.color,
      border: accent.border,
      textColor: accentTextColor,
      activeOpacity: 0.86,
    },
    secondary: {
      bg: theme.panelBg,
      border: theme.border,
      textColor: theme.text,
      activeOpacity: 0.9,
    },
    outline: {
      bg: 'transparent',
      border: theme.inputBorder,
      textColor: theme.text,
      activeOpacity: 0.95,
    },
    ghost: {
      bg: 'transparent',
      border: 'transparent',
      textColor: theme.text,
      activeOpacity: 0.95,
    },
    danger: {
      bg: '#DC2626',
      border: '#991B1B',
      textColor: '#FFFFFF',
      activeOpacity: 0.86,
    },
  };

  const variantConfig = variantStyles[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={hitSlop}
      testID={testID}
      className={`min-h-[${config.height}px] rounded-xl border ${fullWidth ? 'flex-1' : ''} items-center justify-center px-${config.px} py-${config.py} ${className}`}
      style={({ pressed }) => [
        {
          backgroundColor: disabled ? theme.muted + '20' : variantConfig.bg,
          borderColor: variantConfig.border,
          borderWidth: 1,
          opacity: pressed && !disabled ? variantConfig.activeOpacity : 1,
          transform: pressed && !disabled ? [{ scale: 0.98 }] : [{ scale: 1 }],
        },
        style,
      ]}
    >
      <View className="flex-row items-center justify-center gap-2">
        {icon && icon.position !== 'right' && (
          <MaterialCommunityIcons
            name={icon.name as any}
            size={size === 'sm' ? 16 : 20}
            color={disabled ? theme.muted : variantConfig.textColor}
          />
        )}

        {children ? (
          children
        ) : label ? (
          <Typography
            variant={config.textVariant}
            color={disabled ? theme.muted : variantConfig.textColor}
            weight="semibold"
            align="center"
            numberOfLines={2}
          >
            {label}
          </Typography>
        ) : null}

        {icon && icon.position === 'right' && (
          <MaterialCommunityIcons
            name={icon.name as any}
            size={size === 'sm' ? 16 : 20}
            color={disabled ? theme.muted : variantConfig.textColor}
          />
        )}
      </View>
    </Pressable>
  );
}
