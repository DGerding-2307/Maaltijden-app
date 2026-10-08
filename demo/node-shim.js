// Minimale vervangers voor node:fs en node:path in de browserdemo.
export default {
  mkdirSync() {},
  dirname: (p) => String(p).split('/').slice(0, -1).join('/') || '.',
  resolve: (...p) => p.join('/'),
};
