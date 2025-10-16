// app/screens/SignalsScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, FlatList } from 'react-native';
import {
  Provider as PaperProvider,
  Button,
  TextInput,
  Text,
  ActivityIndicator,
} from 'react-native-paper';
import { useSignalGenerator } from '../hooks/useSignalGenerator';
import { globalErrorHandler } from '../services/errorHandler';
import '../i18n';
import { useTranslation } from 'react-i18next';
import SignalCard from '../components/SignalCard';
import LLMConfigModal from '../components/LLMConfigModal';
import { TradingSignal } from '../types';
import { CircuitState } from '../utils/providerHealthStore';

/**
 * Returns a color based on the circuit state.
 * @param {CircuitState} state - The circuit state.
 * @returns {string} The color corresponding to the state.
 */
const getStatusColor = (state: CircuitState) => {
  switch (state) {
    case 'CLOSED':
      return 'green';
    case 'HALF_OPEN':
      return 'orange';
    case 'OPEN':
      return 'red';
    default:
      return 'grey';
  }
};

/**
 * The main screen of the application.
 * It displays the list of providers, allows generating new signals, and shows the last generated signal and provider responses.
 * @returns {JSX.Element} The rendered component.
 */
export default function SignalsScreen() {
  const { t, i18n } = useTranslation();
  const { loading, lastSignal, lastResponses, generate, providersWithHealth, refreshProviders } = useSignalGenerator();
  const [modalVisible, setModalVisible] = useState(false);
  const [symbol, setSymbol] = useState('BTCUSDT');

  useEffect(() => {
    ErrorUtils.setGlobalHandler(globalErrorHandler);
  }, []);

  const handleGenerate = () => {
    generate(symbol);
  };

  const onSaveSuccess = () => {
    // Refresh the provider list after a new one is saved.
    refreshProviders();
  };

  return (
    <PaperProvider>
      <View style={styles.container}>
        <Modal
          animationType="slide"
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <LLMConfigModal onClose={() => setModalVisible(false)} onSaveSuccess={onSaveSuccess} />
      </Modal>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text variant="headlineMedium">{t('tradingSignals')}</Text>
        <Button mode="contained" onPress={() => setModalVisible(true)}>
          {t('addProvider')}
        </Button>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>
        <Button onPress={() => i18n.changeLanguage('en')}>EN</Button>
        <Button onPress={() => i18n.changeLanguage('ar')}>AR</Button>
      </View>

      <View style={{ marginBottom: 20 }}>
        <Text variant="bodySmall" style={{ color: '#666', fontStyle: 'italic' }}>{t('availableProviders')}</Text>
        {providersWithHealth.length > 0 ? (
          providersWithHealth.map(p => (
            <View key={p.spec.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, marginRight: 10, backgroundColor: getStatusColor(p.health.state) }} />
              <Text>{p.spec.name || p.spec.id}</Text>
            </View>
          ))
        ) : (
          <Text variant="bodySmall" style={{ color: '#666', fontStyle: 'italic' }}>{t('none')}</Text>
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <TextInput
          style={{ flex: 1, marginRight: 10 }}
          value={symbol}
          onChangeText={setSymbol}
          label={t('symbol')}
          autoCapitalize="characters"
        />
        <Button
          mode="contained"
          onPress={handleGenerate}
          disabled={loading || providersWithHealth.length === 0}
          loading={loading}
        >
          {t('generateSignal')}
        </Button>
      </View>

      {loading && <ActivityIndicator animating={true} style={{ marginVertical: 20 }} />}

      {lastSignal && (
        <View style={{ flex: 1 }}>
          <Text variant="titleLarge">{t('lastSignal')}</Text>
          <SignalCard signal={lastSignal} />
        </View>
      )}

      {lastResponses.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Text variant="titleLarge">{t('providerResponses')}</Text>
          {lastResponses.map(response => (
            <View key={response.providerId} style={{ padding: 10, backgroundColor: '#fff', borderRadius: 5, marginBottom: 5, borderColor: '#eee', borderWidth: 1 }}>
              <Text>
                <Text style={{ fontWeight: 'bold' }}>{response.providerId}: </Text>
                {response.ok ? `${t('success')} (${response.parsed?.type})` : `${t('failed')} (${response.error})`}
              </Text>
            </View>
          ))}
        </View>
      )}

      {!lastSignal && !loading && (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>{t('noSignalGenerated')}</Text>
        </View>
      )}
    </View>
  );
}
