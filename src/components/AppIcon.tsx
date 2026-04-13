import { Text } from 'react-native';

export type AppIconName =
  | 'brand'
  | 'bolsas'
  | 'cajas'
  | 'otros'
  | 'summary'
  | 'email'
  | 'settings'
  | 'style'
  | 'image';

type AppIconProps = {
  name: AppIconName;
  size?: number;
};

const ICON_MAP: Record<AppIconName, string> = {
  brand: '♻',
  bolsas: '🗑',
  cajas: '📦',
  otros: '🚛',
  summary: '🧾',
  email: '✉',
  settings: '⚙',
  style: '🧱',
  image: '🖼',
};

export default function AppIcon({ name, size = 14 }: AppIconProps) {
  return <Text style={{ fontSize: size }}>{ICON_MAP[name]}</Text>;
}
