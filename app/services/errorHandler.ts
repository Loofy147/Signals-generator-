/**
 * @file A global error handler for the application.
 */
import { Alert } from 'react-native';

/**
 * A global error handler that logs the error and displays an alert.
 * @param {Error} error - The error to handle.
 * @param {boolean} [isFatal] - Whether the error is fatal.
 */
export function globalErrorHandler(error: Error, isFatal?: boolean) {
  console.error(error);
  Alert.alert(
    isFatal ? 'Fatal Error' : 'An unexpected error occurred',
    isFatal ? error.message : 'Please try again later.',
    [{ text: 'OK' }]
  );
}
