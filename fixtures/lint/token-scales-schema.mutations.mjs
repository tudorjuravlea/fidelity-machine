// Planted breaks for the four token families in the schema (fixtures/lint/token-scales.test.mjs).
//   node scripts/mutation-run.mjs fixtures/lint/token-scales-schema.mutations.mjs
export default {
  target: 'design-lock.schema.json',
  copy: ['scripts', 'fixtures/lint', 'package.json', 'design-lock.schema.json'],
  test: ['node', '--test', 'fixtures/lint/token-scales.test.mjs'],
  mutations: [
    { name: 'an opacity over 1 is taken', find: '"minimum": 0,\n            "maximum": 1', replace: '"minimum": 0,\n            "maximum": 100' },
    { name: 'opacity may be an object', find: '"opacity": {\n          "type": "array"', replace: '"opacity": {\n          "type": ["array", "object"]' },
    { name: 'a negative blur is taken', find: '"blur": {\n          "type": "array",\n          "items": {\n            "type": "number",\n            "minimum": 0\n          }', replace: '"blur": {\n          "type": "array",\n          "items": {\n            "type": "number"\n          }' },
    { name: 'a fractional layer is taken', find: '"additionalProperties": {\n            "type": "integer"\n          },\n          "description": "Optional. layer role', replace: '"additionalProperties": {\n            "type": "number"\n          },\n          "description": "Optional. layer role' },
    { name: 'layers may be a list', find: '"zIndex": {\n          "type": "object"', replace: '"zIndex": {\n          "type": ["object", "array"]' },
    { name: 'a breakpoint at zero is taken', find: '"type": "number",\n            "exclusiveMinimum": 0\n          },\n          "description": "Optional. name', replace: '"type": "number",\n            "minimum": 0\n          },\n          "description": "Optional. name' },
    { name: 'a breakpoint may be a string', find: '"additionalProperties": {\n            "type": "number",\n            "exclusiveMinimum": 0\n          }', replace: '"additionalProperties": {\n            "exclusiveMinimum": 0\n          }' },
    { name: 'the families are not in the schema', find: '"zIndex": {\n          "type": "object"', replace: '"zLayers": {\n          "type": "object"' },
  ],
};
