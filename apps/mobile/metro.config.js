const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

process.env.EXPO_ROUTER_APP_ROOT = 'app';

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'expo-router/_ctx' || moduleName.endsWith('expo-router/_ctx')) {
    return { filePath: path.resolve(projectRoot, 'expo-router-ctx.js'), type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Supporto npm workspaces: Metro deve sapere dove cercare i package condivisi
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.extraNodeModules = {
  'react': path.resolve(workspaceRoot, 'node_modules/react'),
  'react-native': path.resolve(workspaceRoot, 'node_modules/react-native'),
  'react-native-safe-area-context': path.resolve(workspaceRoot, 'node_modules/react-native-safe-area-context'),
  'react-native-screens': path.resolve(workspaceRoot, 'node_modules/react-native-screens'),
  'react-native-gesture-handler': path.resolve(workspaceRoot, 'node_modules/react-native-gesture-handler'),
  'react-native-reanimated': path.resolve(workspaceRoot, 'node_modules/react-native-reanimated'),
};

module.exports = withNativeWind(config, { input: './global.css' });
