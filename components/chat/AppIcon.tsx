import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleProp, Text, TextStyle, ViewStyle } from 'react-native';

import { Fonts } from '@/constants/Typography';

type AppIconProps = {
  name: SymbolViewProps['name'];
  fallback: string;
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function AppIcon({ name, fallback, color, size = 20, style }: AppIconProps) {
  const fallbackStyle: StyleProp<TextStyle> = {
    color,
    fontFamily: Fonts.monoSemiBold,
    fontSize: Math.max(13, size - 3),
    lineHeight: size,
  };

  return (
    <SymbolView
      name={name}
      fallback={<Text style={fallbackStyle}>{fallback}</Text>}
      size={size}
      tintColor={color}
      style={style}
    />
  );
}
