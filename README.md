# LLM Trading Signal Generator (React Native PoC)

## Overview

This is a proof-of-concept React Native application that generates trading signals for cryptocurrencies (e.g., BTC/USD) using a combination of multi-timeframe market analysis and multiple Large Language Model (LLM) providers. The application is designed to be highly modular and extensible, allowing for the dynamic addition of any LLM provider at runtime without requiring code changes.

## Core Features

- **Multi-Timeframe Analysis**: Fetches and analyzes market data from Binance across multiple timeframes (1m, 5m, 15m, 1h, 4h, 1d) to provide a comprehensive market overview.
- **Dynamic LLM Providers**: Supports the integration of any LLM provider through a generic specification system. Users can add, edit, and remove providers at runtime.
- **Signal Aggregation**: Aggregates signals from multiple providers using various strategies (e.g., weighted average, majority vote) to generate a consensus signal.
- **Retrieval-Augmented Generation (RAG)**: Uses a "playbook" of historical trading signals to provide relevant examples to the LLM, improving the quality of the generated signals.
- **Circuit Breaker**: Implements a circuit breaker pattern to gracefully handle provider failures and prevent cascading failures.
- **Secure Storage**: Uses `expo-secure-store` to securely store sensitive provider secrets (e.g., API keys).

## Project Structure

The project is organized into the following directories:

- `app/`: The main application directory.
  - `components/`: Reusable React components.
  - `hooks/`: Custom React hooks.
  - `screens/`: The main screens of the application.
  - `services/`: Core application services for interacting with LLMs, fetching market data, etc.
  - `utils/`: Utility functions and stores for managing provider configurations and health.
  - `types.ts`: Core data structures and type definitions.
  - `schemas.ts`: Zod schemas for data validation.
  - `constants.ts`: Global constants.

## Getting Started

### Prerequisites

- Node.js 18+
- Yarn or npm
- Expo CLI

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    ```
2.  Install the dependencies:
    ```bash
    yarn install
    ```

### Running the Application

1.  Start the Expo development server:
    ```bash
    yarn expo start
    ```
2.  Open the application on an emulator or on your phone using the Expo Go app.

## Adding a New LLM Provider

To add a new LLM provider, open the application and tap the "Add Provider" button. You will be prompted to enter the following information:

- **Provider ID**: A unique identifier for the provider (e.g., `my-custom-llm`).
- **Display Name**: A user-friendly name for the provider (e.g., `My Custom LLM`).
- **API Endpoint URL**: The URL of the provider's API endpoint.
- **Model Name** (optional): The model to use for the provider.
- **Headers**: A JSON object of headers to include in the request. You can use placeholders like `{{API_KEY}}` for sensitive data.
- **API Key**: If you used the `{{API_KEY}}` placeholder in the headers, you will be prompted to enter your API key here. It will be stored securely.
- **Request Template**: A JSON string template for the request body. You can use the `{{prompt}}` and `{{model}}` placeholders.

Once saved, the provider will be available for use immediately.

## Security

- Provider secrets (e.g., API keys) are stored securely using `expo-secure-store`.
- Non-sensitive provider specifications (e.g., endpoint URL, headers) are stored in AsyncStorage.
- The application does not send any sensitive data to external servers.

## Future Improvements

- Automate the tracking of signal outcomes by integrating with a cryptocurrency exchange API.
- Implement more sophisticated signal aggregation strategies.
- Add support for more advanced technical indicators.
