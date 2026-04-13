const { getDefaultConfig } = require("expo/metro-config");

// Default Expo metro config — no custom transforms.
// react-native-svg works at runtime via <Svg> components and does NOT need
// metro to transform .svg files (we don't import .svg files anywhere).
module.exports = getDefaultConfig(__dirname);
