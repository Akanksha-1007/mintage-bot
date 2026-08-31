/**
 * Chatbot Field Validation Utilities
 * Enforces validation rules for user responses in chatbot flows:
 * - Email: must contain '@' and valid domain format.
 * - Phone number: must be 10 digits.
 * - Name: cannot contain numbers, should only contain alphabets (plus spaces/hyphens), and must have at least 3 letters.
 */

export interface ValidationResult {
  isValid: boolean;
  errorMsg?: string;
}

export function validateFieldValue(
  nodeType: string = '',
  fieldKey: string = '',
  fieldLabel: string = '',
  value: string = ''
): ValidationResult {
  const cleanVal = value.trim();
  const lowerKey = (fieldKey || '').toLowerCase();
  const lowerLabel = (fieldLabel || '').toLowerCase();
  const lowerType = (nodeType || '').toLowerCase();

  // Identify field type based on node type, key, or label
  const isNameField =
    lowerType === 'name' ||
    lowerKey === 'name' ||
    lowerKey === 'full_name' ||
    lowerKey === 'fullname' ||
    lowerLabel.includes('full name') ||
    lowerLabel.includes('your name') ||
    (lowerLabel.includes('name') && !lowerLabel.includes('company') && !lowerLabel.includes('bot'));

  const isEmailField =
    lowerType === 'email' ||
    lowerKey.includes('email') ||
    lowerKey.includes('mail') ||
    lowerLabel.includes('email') ||
    lowerLabel.includes('mail');

  const isPhoneField =
    lowerType === 'phone' ||
    lowerKey.includes('phone') ||
    lowerKey.includes('mobile') ||
    lowerKey.includes('contact') ||
    lowerLabel.includes('phone') ||
    lowerLabel.includes('mobile') ||
    lowerLabel.includes('contact number');

  // 1. Email Validation
  if (isEmailField) {
    const hasAt = cleanVal.includes('@');
    // Standard email regex ensuring username@domain.ext
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!hasAt || !emailRegex.test(cleanVal)) {
      return {
        isValid: false,
        errorMsg: '⚠️ Please enter a valid email address containing "@" (e.g., name@example.com).'
      };
    }
  }

  // 2. Phone Number Validation (Must be 10 digits)
  if (isPhoneField) {
    const digitsOnly = cleanVal.replace(/\D/g, '');

    // Check if digits count is exactly 10 (or 10 digits after stripping country code like +91 / +1)
    const isValid10Digit =
      digitsOnly.length === 10 ||
      (cleanVal.startsWith('+') && (digitsOnly.length === 11 || digitsOnly.length === 12));

    if (!isValid10Digit) {
      return {
        isValid: false,
        errorMsg: '⚠️ Phone number must be 10 digits. Please enter a valid 10-digit phone number (e.g., 9876543210).'
      };
    }
  }

  // 3. Name Validation (Cannot contain numbers, must only contain alphabets, min 3 letters)
  if (isNameField) {
    // Check if contains any numbers/digits
    const hasDigits = /\d/.test(cleanVal);
    if (hasDigits) {
      return {
        isValid: false,
        errorMsg: '⚠️ Name cannot contain numbers. Please use only alphabetic characters (at least 3 letters).'
      };
    }

    // Check if contains non-alphabetic characters (allowing standard name spaces, dots, hyphens, apostrophes)
    const isOnlyAlphabets = /^[a-zA-Z\u00C0-\u024F\s\.\'-]+$/.test(cleanVal);
    const letterMatches = cleanVal.match(/[a-zA-Z\u00C0-\u024F]/g) || [];

    if (!isOnlyAlphabets || letterMatches.length < 3) {
      return {
        isValid: false,
        errorMsg: '⚠️ Name should only contain alphabetic letters and have at least 3 letters.'
      };
    }
  }

  return { isValid: true };
}
