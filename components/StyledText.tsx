import { Text, TextProps } from './Themed';
import { Fonts } from '@/constants/Typography';

export function MonoText(props: TextProps) {
  return <Text {...props} style={[props.style, { fontFamily: Fonts.monoRegular }]} />;
}
