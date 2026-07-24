import { describe, expect, it } from 'vitest';
import {
  DYNAMIC_VARIABLES,
  isDynamicVariableName,
  resolveDynamicVariable,
  unknownDynamicVariables,
} from '../lib/dynamicVariables';
import { environmentFeature } from '../lib/stores/features/environments';

function resolve(value: string, values: Record<string, string> = {}) {
  return environmentFeature.resolveTemplate.call(
    { activeEnvironmentValues: () => values } as never,
    value,
    values,
  );
}

describe('dynamic variables', () => {
  it('covers the Postman names that collections actually use', () => {
    for (const name of ['$guid', '$randomUUID', '$timestamp', '$isoTimestamp', '$randomInt', '$randomEmail', '$randomFirstName', '$randomUserAgent']) {
      expect(isDynamicVariableName(name)).toBe(true);
    }
    expect(isDynamicVariableName('$notAThing')).toBe(false);
    expect(isDynamicVariableName('baseUrl')).toBe(false);
  });

  it('generates a value in the documented shape for every definition', () => {
    for (const variable of DYNAMIC_VARIABLES) {
      const value = variable.generate();
      expect(value, variable.name).toBeTypeOf('string');
      expect(value.length, variable.name).toBeGreaterThan(0);
      expect(value, variable.name).not.toContain('{{');
    }
  });

  it('produces well-formed values for the strongly typed ones', () => {
    expect(resolveDynamicVariable('$guid')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(resolveDynamicVariable('$timestamp')).toMatch(/^\d{10}$/);
    expect(resolveDynamicVariable('$isoTimestamp')).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    expect(Number(resolveDynamicVariable('$randomInt'))).toBeGreaterThanOrEqual(0);
    expect(Number(resolveDynamicVariable('$randomInt'))).toBeLessThanOrEqual(1000);
    expect(resolveDynamicVariable('$randomEmail')).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/);
    expect(resolveDynamicVariable('$randomIP')).toMatch(/^(\d{1,3}\.){3}\d{1,3}$/);
    expect(resolveDynamicVariable('$randomHexColor')).toMatch(/^#[0-9a-f]{6}$/);
    expect(resolveDynamicVariable('$randomBoolean')).toMatch(/^(true|false)$/);
    expect(resolveDynamicVariable('$randomAlphaNumeric')).toHaveLength(1);
    expect(resolveDynamicVariable('$randomSemver')).toMatch(/^\d+\.\d+\.\d+$/);
    expect(resolveDynamicVariable('$notAThing')).toBeNull();
  });

  it('reports dynamic variables it does not implement', () => {
    expect(unknownDynamicVariables('{{$guid}} and {{$randomInt}}')).toEqual([]);
    expect(unknownDynamicVariables('{{$randomTeapot}} {{baseUrl}}')).toEqual(['$randomTeapot']);
  });
});

describe('resolveTemplate with dynamic variables', () => {
  it('substitutes dynamic variables anywhere in the value', () => {
    const resolved = resolve('https://api.test/{{$guid}}/items?ts={{$timestamp}}');
    expect(resolved).not.toContain('{{');
    expect(resolved).toMatch(/^https:\/\/api\.test\/[0-9a-f-]{36}\/items\?ts=\d{10}$/i);
  });

  // Postman resolves every occurrence separately; a collection that posts two
  // records in one body relies on getting two different ids.
  it('resolves each occurrence independently', () => {
    const resolved = resolve('{{$guid}} {{$guid}}');
    const [first, second] = resolved.split(' ');
    expect(first).not.toBe(second);
  });

  it('lets an environment value win over the built-in name', () => {
    expect(resolve('{{$timestamp}}', { $timestamp: 'pinned' })).toBe('pinned');
  });

  it('still resolves ordinary variables and leaves unknown ones alone', () => {
    expect(resolve('{{base}}/x/{{missing}}', { base: 'https://api.test' }))
      .toBe('https://api.test/x/{{missing}}');
    expect(resolve('{{$randomTeapot}}')).toBe('{{$randomTeapot}}');
  });
});
