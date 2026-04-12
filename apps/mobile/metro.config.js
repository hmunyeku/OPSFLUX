const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// SVG support for FieldSignature
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== "svg");
config.resolver.sourceExts.push("svg");

module.exports = config;
