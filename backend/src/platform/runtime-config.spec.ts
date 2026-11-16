import { boundedInteger, validateRuntimeEnvironment } from './runtime-config';
describe('Configuración operativa', () => {
  it('producción exige cookie segura y orígenes HTTPS exactos', () => {
    expect(() => validateRuntimeEnvironment({NODE_ENV:'production',CORS_ORIGIN:'https://quickly.example',SESSION_COOKIE_SECURE:'false'})).toThrow();
    expect(() => validateRuntimeEnvironment({NODE_ENV:'production',CORS_ORIGIN:'http://quickly.example',SESSION_COOKIE_SECURE:'true'})).toThrow();
    expect(validateRuntimeEnvironment({NODE_ENV:'production',CORS_ORIGIN:'https://quickly.example',SESSION_COOKIE_SECURE:'true',TRUST_PROXY_HOPS:'1'}).proxyHops).toBe(1);
  });
  it('rechaza comodines, credenciales/rutas en origen y proxy abierto', () => {
    for(const origin of ['*','https://user:secret@example.com','https://example.com/path'])expect(()=>validateRuntimeEnvironment({CORS_ORIGIN:origin})).toThrow();
    for(const hops of ['true','2','-1'])expect(()=>validateRuntimeEnvironment({TRUST_PROXY_HOPS:hops})).toThrow();
  });
  it('desarrollo directo no confía en cabeceras de proxy y valida booleanos', () => {
    expect(validateRuntimeEnvironment({}).proxyHops).toBe(0);
    expect(()=>validateRuntimeEnvironment({SESSION_COOKIE_SECURE:'yes'})).toThrow();
  });
  it('límites DB no aceptan valores vacíos, infinitos ni fuera de rango', () => {
    expect(boundedInteger(undefined,20,1,100,'pool')).toBe(20);
    for(const value of ['', '0','101','Infinity','1.5'])expect(()=>boundedInteger(value,20,1,100,'pool')).toThrow();
  });
});
