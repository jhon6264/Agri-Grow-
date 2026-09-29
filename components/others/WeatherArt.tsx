import { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Image, View } from 'react-native';
import type { Condition } from '@/src/others/content-model';

const images = {
  rays: require('@/assets/weather/sun-rays.png'), sun: require('@/assets/weather/sun-disc.png'),
  light: require('@/assets/weather/cloud-light.png'), dark: require('@/assets/weather/cloud-dark.png'),
  thunder: require('@/assets/weather/cloud-thunder-original.png'), drop: require('@/assets/weather/raindrop.png'),
  bolt: require('@/assets/weather/lightning.png'),
};
const box = (size: number, left: number, top: number, width: number, height: number) => ({
  position: 'absolute' as const, left: size * left, top: size * top, width: size * width, height: size * height,
});

// The fixed watercolor layers are the control panel's current artwork. Motion only
// changes transforms and opacity, so the illustration does not jitter frame to frame.
export const WeatherArt = memo(function WeatherArt({ condition, size, animate = true }: { condition: Condition; size: number; animate?: boolean }) {
  const rays = useRef(new Animated.Value(0)).current;
  const back = useRef(new Animated.Value(0)).current;
  const rain = useRef(new Animated.Value(0)).current;
  const lightning = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const preference = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const app = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => { preference.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    rays.stopAnimation(); back.stopAnimation(); rain.stopAnimation(); lightning.stopAnimation();
    rays.setValue(0); back.setValue(0); rain.setValue(0); lightning.setValue(0);
    if (!animate || reduceMotion || !active) return;
    const loops: Animated.CompositeAnimation[] = [];
    const loop = (value: Animated.Value, duration: number) => {
      const animation = Animated.loop(Animated.timing(value, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
      loops.push(animation); animation.start();
    };
    if (condition === 'sunny') loop(rays, 40000);
    if (condition === 'cloudy') loop(back, 28000);
    if (condition === 'rainy' || condition === 'heavy-rain' || condition === 'heavy-rain-thunder') loop(rain, condition === 'rainy' ? 2300 : 1400);
    if (condition === 'heavy-rain-thunder') loop(lightning, 9000);
    return () => loops.forEach(animation => animation.stop());
  }, [active, animate, back, condition, lightning, rain, rays, reduceMotion]);

  const image = (source: number, left: number, top: number, width: number, height: number, opacity = 1, key?: string) =>
    <Image key={key} source={source} resizeMode="contain" style={[box(size, left, top, width, height), { opacity }]} />;
  const animatedImage = (source: number, left: number, top: number, width: number, height: number, style: object) =>
    <Animated.Image source={source} resizeMode="contain" style={[box(size, left, top, width, height), style]} />;
  const moving = animate && !reduceMotion && active;
  const driftBack = back.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.067, size * 0.067] });
  const fadeBack = back.interpolate({ inputRange: [0, 0.08, 0.92, 1], outputRange: [0, 0.75, 0.75, 0] });
  const fall = rain.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.12, size * 0.38] });
  const rainFade = rain.interpolate({ inputRange: [0, 0.18, 0.76, 1], outputRange: [0, 0.85, 0.85, 0] });
  const flash = lightning.interpolate({ inputRange: [0, 0.6, 0.69, 0.72, 0.82, 1], outputRange: [0, 0, 0.9, 0.9, 0, 0] });
  const rainy = condition === 'rainy' || condition === 'heavy-rain' || condition === 'heavy-rain-thunder';
  return <View style={{ width: size, height: size, overflow: 'hidden' }} accessibilityLabel={condition.replaceAll('-', ' ')}>
    {condition === 'sunny' && <>
      {animatedImage(images.rays, 0.18, 0.07, 0.68, 0.68, { transform: [{ rotate: moving ? rays.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) : '0deg' }] })}
      {image(images.sun, 0.30, 0.19, 0.44, 0.44)}{image(images.light, 0.14, 0.46, 0.76, 0.46)}
    </>}
    {condition === 'cloudy' && <>
      {animatedImage(images.light, 0.09, 0.20, 0.56, 0.37, { opacity: moving ? fadeBack : 0.75, transform: [{ translateX: moving ? driftBack : 0 }] })}
      {image(images.light, 0.23, 0.39, 0.70, 0.44)}
    </>}
    {rainy && <>
      <Animated.View renderToHardwareTextureAndroid={moving} shouldRasterizeIOS={moving}
        style={{ position: 'absolute', width: size, height: size, opacity: moving ? rainFade : 0.85, transform: [{ translateY: moving ? fall : 0 }] }}>
        {Array.from({ length: condition === 'rainy' ? 7 : 18 }, (_, index) => image(images.drop,
          (18 + index * 37 % 65) / 100, 0.54 + (index * 7 % 24) / 100, condition === 'rainy' ? 0.043 : 0.038, 0.09, 1, `drop-${index}`))}
      </Animated.View>
      {condition === 'heavy-rain-thunder' && animatedImage(images.bolt, 0.43, 0.52, 0.21, 0.39, { opacity: moving ? flash : 0.9 })}
      {image(condition === 'rainy' ? images.light : condition === 'heavy-rain' ? images.dark : images.thunder, 0.06, 0.11, 0.88, 0.55)}
    </>}
  </View>;
});
