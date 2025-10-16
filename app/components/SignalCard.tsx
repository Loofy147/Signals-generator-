// app/components/SignalCard.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TradingSignal } from '../types';

interface SignalCardProps {
  signal: TradingSignal;
}

/**
 * A component to display a trading signal.
 * @param {SignalCardProps} props - The component's props.
 * @returns {JSX.Element} The rendered component.
 */
export default function SignalCard({ signal }: SignalCardProps) {
  const cardStyle =
    signal.type === 'BUY' ? styles.buyCard : signal.type === 'SELL' ? styles.sellCard : styles.holdCard;

  return (
    <View style={[styles.card, cardStyle]}>
      <View style={styles.header}>
        <Text style={styles.symbol}>{signal.symbol}</Text>
        <Text style={styles.type}>{signal.type}</Text>
      </View>
      <Text style={styles.price}>Entry: ${signal.price.toFixed(2)}</Text>
      <Text style={styles.confidence}>Confidence: {signal.confidence}%</Text>
      <View style={styles.risk}>
        <Text style={styles.riskText}>SL: ${signal.riskMetrics.stopLoss.toFixed(2)}</Text>
        <Text style={styles.riskText}>TP: ${signal.riskMetrics.takeProfit.toFixed(2)}</Text>
      </View>
      <Text style={styles.reasoning}>{signal.reasoning}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  buyCard: {
    backgroundColor: '#e8f5e9', // Light green
    borderColor: '#4caf50',
    borderWidth: 1,
  },
  sellCard: {
    backgroundColor: '#ffebee', // Light red
    borderColor: '#f44336',
    borderWidth: 1,
  },
  holdCard: {
    backgroundColor: '#f5f5f5', // Light gray
    borderColor: '#9e9e9e',
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  symbol: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  type: {
    fontSize: 18,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  price: {
    fontSize: 16,
    marginBottom: 5,
  },
  confidence: {
    fontSize: 14,
    color: '#555',
    marginBottom: 10,
  },
  risk: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  riskText: {
    fontSize: 14,
  },
  reasoning: {
    fontSize: 14,
    color: '#333',
    fontStyle: 'italic',
  },
});
