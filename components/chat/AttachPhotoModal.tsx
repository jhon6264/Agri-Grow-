import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Fonts } from '@/constants/Typography';

type AttachPhotoModalProps = {
  visible: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onChoosePhoto: () => void;
};

export function AttachPhotoModal({
  visible,
  onClose,
  onTakePhoto,
  onChoosePhoto,
}: AttachPhotoModalProps) {
  const reduce = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (visible) {
      AccessibilityInfo.announceForAccessibility('Attach photo options opened');
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: reduce ? 0 : 200,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          tension: 65,
          friction: 9,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      opacity.setValue(0);
      scale.setValue(0.92);
    }
  }, [visible, opacity, scale, reduce]);

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.backdrop,
            { opacity },
          ]}>
          <Pressable
            accessibilityLabel="Close attach photo modal"
            accessibilityRole="button"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.cardContainer,
            {
              opacity,
              transform: [{ scale }],
            },
          ]}>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>
              Attach Photo
            </Text>

            <View style={styles.buttonStack}>
              <Pressable
                accessibilityLabel="Take photo"
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  onTakePhoto();
                }}
                style={({ pressed }) => [
                  styles.button,
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                ]}>
                <Text style={styles.buttonText}>Take Photo</Text>
              </Pressable>

              <Pressable
                accessibilityLabel="Choose from gallery"
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  onChoosePhoto();
                }}
                style={({ pressed }) => [
                  styles.button,
                  styles.galleryButton,
                  pressed && styles.buttonPressed,
                ]}>
                <Text style={styles.buttonText}>Choose from Gallery</Text>
              </Pressable>

              <Pressable
                accessibilityLabel="Cancel"
                accessibilityRole="button"
                onPress={onClose}
                style={({ pressed }) => [
                  styles.button,
                  styles.cancelButton,
                  pressed && styles.buttonPressed,
                ]}>
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdrop: {
    backgroundColor: 'rgba(16, 26, 21, 0.55)',
  },
  cardContainer: {
    width: '100%',
    maxWidth: 320,
    overflow: 'visible',
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFBEF',
    borderColor: '#315E3E',
    borderWidth: 2,
    borderBottomWidth: 4,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  title: {
    fontFamily: Fonts.sansBold,
    fontSize: 20,
    color: '#20432D',
    textAlign: 'center',
  },
  buttonStack: {
    width: '100%',
    gap: 10,
  },
  button: {
    minHeight: 48,
    borderRadius: 15,
    borderBottomWidth: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#32834E',
    borderColor: '#205936',
  },
  galleryButton: {
    backgroundColor: '#2F7647',
    borderColor: '#1E4E2F',
  },
  cancelButton: {
    backgroundColor: '#BA3E3E',
    borderColor: '#872828',
    minHeight: 44,
    marginTop: 2,
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ translateY: 1 }],
  },
  buttonText: {
    fontFamily: Fonts.sansBold,
    fontSize: 16.5,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
