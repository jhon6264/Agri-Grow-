const fs = require('node:fs');
const path = require('node:path');

// SDK 57: initial URL resolution can notify an uncommitted NavigationContainer.
// Keep initial route parsing intact; deliver its notification in a commit effect.
function patchSource(source) {
  if (source.includes('// AgriGrow: commit initial-link notifications')) return source;
  const start = source.indexOf('    const getInitialState =');
  const end = source.indexOf('    (0, react_1.useEffect)', start);
  if (start < 0 || end < 0) throw new Error('Expo Router linking source changed; review the startup patch.');
  const before = source.slice(start, end);
  const notification = 'onUnhandledLinking((0, extractPathFromURL_1.extractExpoPathFromURL)(prefixes, url));';
  if (before.split(notification).length !== 3) throw new Error('Unexpected initial-link callbacks; review the startup patch.');
  const effect = `    // AgriGrow: commit initial-link notifications
    const pendingInitialLink = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        const pending = pendingInitialLink.current;
        if (pending !== null) {
            pendingInitialLink.current = null;
            onUnhandledLinking(pending.path);
        }
    });
`;
  return source.slice(0, start) + effect + before.replaceAll(notification,
    'pendingInitialLink.current = { path: (0, extractPathFromURL_1.extractExpoPathFromURL)(prefixes, url) };') + source.slice(end);
}
if (require.main === module) {
  const root = path.dirname(require.resolve('expo-router/package.json'));
  const version = require(path.join(root, 'package.json')).version;
  if (version !== '57.0.22') throw new Error(`Review the linking patch before using expo-router ${version}.`);
  const file = path.join(root, 'build/fork/useLinking.native.js');
  const source = fs.readFileSync(file, 'utf8');
  const patched = patchSource(source);
  if (patched !== source) fs.writeFileSync(file, patched);
}
module.exports = { patchSource };
