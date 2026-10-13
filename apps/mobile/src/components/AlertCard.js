import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

let currentAlert = null;
const listeners = new Set();

const publish = (alert) => {
  currentAlert = alert;
  listeners.forEach((listener) => listener(alert));
};

export const showAlertCard = (title, message, buttons, options) => {
  const normalizedButtons = Array.isArray(buttons) && buttons.length
    ? buttons
    : [{ text: 'OK', style: 'default' }];

  publish({
    title: title || '',
    message: message || '',
    buttons: normalizedButtons,
    onDismiss: options?.onDismiss,
  });
};

export const dismissAlertCard = () => publish(null);

export function AlertCardHost() {
  const [alert, setAlert] = useState(currentAlert);

  useEffect(() => {
    listeners.add(setAlert);
    setAlert(currentAlert);
    return () => listeners.delete(setAlert);
  }, []);

  if (Platform.OS !== 'web') return null;

  const close = (button) => {
    dismissAlertCard();
    if (button?.onPress) button.onPress();
    else if (!button && alert?.onDismiss) alert.onDismiss();
  };

  return (
    <Modal transparent visible={!!alert} animationType="fade" onRequestClose={() => close()}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert" accessibilityViewIsModal>
          {!!alert?.title && <Text style={styles.title}>{alert.title}</Text>}
          {!!alert?.message && <Text style={styles.message}>{alert.message}</Text>}
          <View style={styles.actions}>
            {alert?.buttons?.map((button, index) => (
              <Pressable
                key={`${button.text || 'button'}-${index}`}
                accessibilityRole="button"
                onPress={() => close(button)}
                style={({ pressed }) => [
                  styles.button,
                  button.style === 'cancel' && styles.cancelButton,
                  button.style === 'destructive' && styles.destructiveButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[
                  styles.buttonText,
                  button.style === 'cancel' && styles.cancelText,
                  button.style === 'destructive' && styles.destructiveText,
                ]}>{button.text || 'OK'}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(17, 24, 39, 0.48)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    padding: 24,
    backgroundColor: '#FFFFFF',
    shadowColor: '#111827',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  title: { color: '#111827', fontSize: 19, fontWeight: '700', marginBottom: 10 },
  message: { color: '#4B5563', fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 24, gap: 10 },
  button: { minWidth: 88, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10, backgroundColor: '#FFD700', alignItems: 'center' },
  cancelButton: { backgroundColor: '#F3F4F6' },
  destructiveButton: { backgroundColor: '#FEE2E2' },
  buttonText: { color: '#111827', fontSize: 14, fontWeight: '700' },
  cancelText: { color: '#374151' },
  destructiveText: { color: '#B91C1C' },
  pressed: { opacity: 0.72 },
});
