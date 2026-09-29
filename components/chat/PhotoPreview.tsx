import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PhotoAttachment } from '@/src/chat/chat-types';
export function PhotoPreview({ photo, onRemove, compact = false }: { photo: PhotoAttachment; onRemove?: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState(false);
  return <View style={compact ? styles.wrapCompact : styles.wrap}>
    <Pressable accessibilityRole="button" accessibilityLabel={missing ? 'Image unavailable' : 'Preview attached photo'} disabled={missing} onPress={() => setOpen(true)}>
      {missing ? <Text style={[styles.missing, compact && styles.missingCompact]}>Image unavailable</Text> : <Image source={{ uri: photo.thumbnailUri }} onError={() => setMissing(true)} style={compact ? styles.thumbnailCompact : styles.thumbnail} resizeMode="cover" />}
    </Pressable>
    {onRemove && <Pressable accessibilityRole="button" accessibilityLabel="Remove attached photo" onPress={onRemove} style={compact ? styles.removeCompact : styles.remove}><Text style={compact ? styles.removeTextCompact : { color: 'white' }}>×</Text></Pressable>}
    <Modal visible={open} onRequestClose={() => setOpen(false)} transparent animationType="fade">
      <View style={styles.modal}><Pressable accessibilityRole="button" accessibilityLabel="Close photo preview" onPress={() => setOpen(false)} style={styles.close}><Text style={{ color: 'white' }}>Close</Text></Pressable>
        <Image source={{ uri: photo.uri }} style={styles.full} resizeMode="contain" accessibilityLabel="Attached photo" />
      </View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-end', margin: 0 },
  wrapCompact: { alignSelf: 'flex-start', marginHorizontal: 2, marginVertical: 3 },
  thumbnail: { width: 156, height: 118, borderRadius: 16, backgroundColor: '#EAE6D6', borderWidth: 1, borderColor: 'rgba(16, 24, 19, 0.10)' },
  thumbnailCompact: { width: 56, height: 56, borderRadius: 10, borderWidth: 1.5, borderColor: '#315E3E', backgroundColor: '#EAE6D6' },
  missing: { width: 156, height: 118, borderRadius: 16, backgroundColor: '#F0EFEA', borderWidth: 1, borderColor: '#D9D7CE', padding: 15, color: '#526459', textAlign: 'center' },
  missingCompact: { padding: 8, fontSize: 11, color: '#526459' },
  remove: { position: 'absolute', right: -5, top: -5, backgroundColor: '#A63333', borderRadius: 16, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  removeCompact: { position: 'absolute', right: -6, top: -6, backgroundColor: '#BA3E3E', borderRadius: 11, width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFFFFF' },
  removeTextCompact: { color: 'white', fontSize: 13, lineHeight: 15, fontWeight: 'bold' },
  modal: { flex: 1, backgroundColor: '#101A15', justifyContent: 'center' },
  close: { position: 'absolute', right: 24, top: 50, padding: 15, zIndex: 1 },
  full: { width: '100%', height: '85%' },
});
