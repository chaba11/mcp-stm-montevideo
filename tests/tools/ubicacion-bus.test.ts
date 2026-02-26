import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerUbicacionBus } from '../../src/tools/ubicacion-bus.js';

function makeServer() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerUbicacionBus(server);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = (server as any)._registeredTools['ubicacion_bus'].handler;
  return handler;
}

describe('ubicacion_bus tool', () => {
  const handler = makeServer();

  it('returns a response without arguments', async () => {
    const result = await handler({}, {});
    expect(result).toBeDefined();
    expect(result.content).toHaveLength(1);
  });

  it('returns text content type', async () => {
    const result = await handler({}, {});
    expect(result.content[0].type).toBe('text');
  });

  it('returns valid JSON in text field', async () => {
    const result = await handler({}, {});
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  it('available is false', async () => {
    const result = await handler({}, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.available).toBe(false);
  });

  it('has a message field', async () => {
    const result = await handler({}, {});
    const data = JSON.parse(result.content[0].text);
    expect(typeof data.message).toBe('string');
    expect(data.message.length).toBeGreaterThan(10);
  });

  it('message mentions STM Montevideo', async () => {
    const result = await handler({}, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.message).toMatch(/STM|Montevideo/i);
  });

  it('has alternativas array', async () => {
    const result = await handler({}, {});
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data.alternativas)).toBe(true);
  });

  it('alternativas has at least 2 entries', async () => {
    const result = await handler({}, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.alternativas.length).toBeGreaterThanOrEqual(2);
  });

  it('alternativas includes app reference', async () => {
    const result = await handler({}, {});
    const data = JSON.parse(result.content[0].text);
    const text = data.alternativas.join(' ');
    expect(text).toMatch(/app|App|montevideo|www/i);
  });

  it('responds correctly when linea is provided', async () => {
    const result = await handler({ linea: '181' }, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.available).toBe(false);
  });

  it('responds correctly when linea and variante provided', async () => {
    const result = await handler({ linea: 'D10', variante: '01' }, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.available).toBe(false);
  });

  it('alternativas mentions proximos_buses as alternative', async () => {
    const result = await handler({}, {});
    const data = JSON.parse(result.content[0].text);
    const text = data.alternativas.join(' ');
    expect(text).toMatch(/proximos_buses|proximos|horarios/i);
  });
});
