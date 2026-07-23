import { describe, it, expect } from 'vitest';
import { validateUserInput, detectSemanticThreats } from '../../lib/security/requestValidator';

describe('command strings pass the existing security gate unchanged (FR-012)', () => {
  const commandStrings = [
    '/sessions',
    '/load 1',
    '/load 3f9a1234-5678-4abc-9def-0123456789ab',
    '/clear',
    '/clear confirm',
    '/help',
    '/notacommand'
  ];

  it.each(commandStrings)('validateUserInput accepts %s', (input) => {
    expect(validateUserInput(input)).toEqual({ isValid: true });
  });

  it.each(commandStrings)('detectSemanticThreats accepts %s', (input) => {
    expect(detectSemanticThreats(input)).toEqual({ isValid: true });
  });
});
