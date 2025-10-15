// app/components/LLMConfigModal.tsx
import React, { useState } from 'react';
import { View, TextInput, Button, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { saveProviderSpec, storeProviderSecret } from '../utils/providerStore';

// A simple modal component for adding or editing a generic LLM provider.
export default function LLMConfigModal({ onClose, onSaveSuccess }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [headersJson, setHeadersJson] = useState('{\n  "Authorization": "Bearer {{API_KEY}}"\n}');
  const [requestTemplate, setRequestTemplate] = useState('{\n  "model": "{{model}}",\n  "prompt": "{{prompt}}"\n}');
  const [apiKey, setApiKey] = useState('');

  const onSave = async () => {
    if (!id || !endpoint) {
      Alert.alert('Error', 'Provider ID and Endpoint are required.');
      return;
    }

    let headers;
    try {
      headers = headersJson ? JSON.parse(headersJson) : {};
    } catch (e) {
      Alert.alert('Error', 'Headers JSON is not valid.');
      return;
    }

    const spec = { id, name, endpoint, model, headers, requestTemplate };

    try {
      await saveProviderSpec(spec);

      // Simple logic to find an API_KEY placeholder and store the provided key.
      // A more robust solution would parse all {{placeholders}} and generate a form for them.
      const hasApiKeyPlaceholder = Object.values(headers).some(
        (val: string) => typeof val === 'string' && val.includes('{{API_KEY}}')
      );

      if (hasApiKeyPlaceholder && apiKey) {
        await storeProviderSecret(id, 'API_KEY', apiKey);
      }

      Alert.alert('Success', `Provider "${name || id}" saved successfully.`);
      onSaveSuccess(); // Callback to trigger refresh in the parent component
      onClose();
    } catch (error) {
      Alert.alert('Error', `Failed to save provider: ${error.message}`);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Add New LLM Provider</Text>
      <TextInput style={styles.input} placeholder="Provider ID (e.g., my-custom-llm)" value={id} onChangeText={setId} />
      <TextInput style={styles.input} placeholder="Display Name (e.g., My Custom LLM)" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="API Endpoint URL" value={endpoint} onChangeText={setEndpoint} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Model Name (optional)" value={model} onChangeText={setModel} autoCapitalize="none" />

      <Text style={styles.label}>Headers (JSON with placeholders like {`{{API_KEY}}`})</Text>
      <TextInput style={styles.inputMultiline} value={headersJson} onChangeText={setHeadersJson} multiline autoCapitalize="none" />

      {/* Show API Key input only if the placeholder is in the headers */}
      {headersJson.includes('{{API_KEY}}') && (
        <>
          <Text style={styles.label}>API Key (for {`{{API_KEY}}`})</Text>
          <TextInput style={styles.input} placeholder="Enter secret API Key" value={apiKey} onChangeText={setApiKey} secureTextEntry />
        </>
      )}

      <Text style={styles.label}>Request Template (JSON with {`{{prompt}}`} and {`{{model}}`})</Text>
      <TextInput style={styles.inputMultiline} value={requestTemplate} onChangeText={setRequestTemplate} multiline autoCapitalize="none" />

      <Button title="Save Provider" onPress={onSave} />
      <View style={styles.spacer} />
      <Button title="Cancel" onPress={onClose} color="gray" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  label: {
    marginTop: 15,
    marginBottom: 5,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  inputMultiline: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
    height: 100,
    textAlignVertical: 'top',
  },
  spacer: {
    height: 10,
  },
});
