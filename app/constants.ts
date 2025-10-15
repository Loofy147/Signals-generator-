/**
 * @file Global constants and configuration values for the application.
 */

// --- Playbook Service ---
export const MAX_SIGNALS_TO_STORE = 500;

// --- Circuit Breaker ---
export const FAILURE_THRESHOLD = 3; // Number of failures before opening the circuit
export const OPEN_TIMEOUT_MS = 60 * 1000; // 1 minute before the circuit moves to HALF_OPEN
