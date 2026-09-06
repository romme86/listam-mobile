module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './',
            '@/src': './src',
            '@/src/components': './src/components',
            '@/src/hooks': './src/hooks',
            '@/components': './components',
            '@/app': './app',
            '@/app/assets': './app/assets',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  }
}
