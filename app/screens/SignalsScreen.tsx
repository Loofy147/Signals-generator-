// app/screens/SignalsScreen.tsx
import React, { useState } from 'react';
import { View, Text, Button, StyleSheet, FlatList, Modal, ActivityIndicator, TextInput } from 'react-native';
import { useSignalGenerator } from '../hooks/useSignalGenerator';
import SignalCard from '../components/SignalCard';
import LLMConfigModal from '../components/LLMConfigModal';
import { TradingSignal } from '../types';

export default function SignalsScreen() {
  const { loading, error, lastSignal, generate, availableProviders, refreshProviders } = useSignalGenerator();
  const [modalVisible, setModalVisible] = useState(false);
  const [symbol, setSymbol] = useState('BTCUSDT');

  const handleGenerate = () => {
    generate(symbol);
  };

  const onSaveSuccess = () => {
    // Refresh the provider list after a new one is saved.
    refreshProviders();
  };

  return (
    <View style={styles.container}>
      <Modal
        animationType="slide"
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <LLMConfigModal onClose={() => setModalVisible(false)} onSaveSuccess={onSaveSuccess} />
      </Modal>

      <View style={styles.header}>
        <Text style={styles.title}>Trading Signals</Text>
        <Button title="Add Provider" onPress={() => setModalVisible(true)} />
      </View>

      <Text style={styles.providerInfo}>
        Available Providers: {availableProviders.length > 0 ? availableProviders.map(p => p.name || p.id).join(', ') : 'None'}
      </Text>

      <View style={styles.controls}>
        <TextInput
          style={styles.input}
          value={symbol}
          onChangeText={setSymbol}
          placeholder="Enter Symbol (e.g., BTCUSDT)"
          autoCapitalize="characters"
        />
        <Button title="Generate Signal" onPress={handleGenerate} disabled={loading || availableProviders.length === 0} />
      </View>

      {loading && <ActivityIndicator size="large" color="#0000ff" style={styles.loader} />}

      {error && <Text style={styles.errorText}>Error: {error}</Text>}

      {lastSignal && (
        <View style={styles.signalContainer}>
          <Text style={styles.sectionTitle}>Last Signal:</Text>
          <SignalCard signal={lastSignal} />
        </View>
      )}

      {!lastSignal && !loading && (
        <View style={styles.placeholder}>
          <Text>No signal generated yet. Press "Generate Signal" to start.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f9f9f9',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  providerInfo: {
    fontSize: 12,
    color: '#666',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  loader: {
    marginVertical: 20,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginVertical: 10,
  },
  signalContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
