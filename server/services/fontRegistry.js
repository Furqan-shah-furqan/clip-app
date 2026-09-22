/**
 * Central font registry for ClipFlow Studio captions.
 * Maps high-impact viral display fonts between CSS @font-face, Remotion, and FFmpeg/ASS libass.
 */
const path = require("path");

const FONT_REGISTRY = {
  montserrat: {
    id: "montserrat",
    displayName: "Montserrat Black",
    cssFamily: "Montserrat",
    assFontName: "Montserrat",
    file: "Montserrat.ttf",
    weight: 900,
    style: "normal",
    category: "Bold",
    isDisplay: true,
  },
  anton: {
    id: "anton",
    displayName: "Anton (Hormozi)",
    cssFamily: "Anton",
    assFontName: "Anton",
    file: "Anton-Regular.ttf",
    weight: 400,
    style: "normal",
    category: "Bold",
    isDisplay: true,
  },
  bebasneue: {
    id: "bebasneue",
    displayName: "Bebas Neue",
    cssFamily: "Bebas Neue",
    assFontName: "Bebas Neue",
    file: "BebasNeue-Regular.ttf",
    weight: 400,
    style: "normal",
    category: "Bold",
    isDisplay: true,
  },
  barlow: {
    id: "barlow",
    displayName: "Barlow Bold",
    cssFamily: "Barlow",
    assFontName: "Barlow",
    file: "Barlow-Bold.ttf",
    weight: 700,
    style: "normal",
    category: "Clean",
    isDisplay: false,
  },
  barlowcondensed: {
    id: "barlowcondensed",
    displayName: "Barlow Condensed Bold",
    cssFamily: "Barlow Condensed",
    assFontName: "Barlow Condensed",
    file: "BarlowCondensed-Bold.ttf",
    weight: 700,
    style: "normal",
    category: "Clean",
    isDisplay: false,
  },
  archivoblack: {
    id: "archivoblack",
    displayName: "Archivo Black",
    cssFamily: "Archivo Black",
    assFontName: "Archivo Black",
    file: "ArchivoBlack.ttf",
    weight: 400,
    style: "normal",
    category: "Bold",
    isDisplay: true,
  },
  poppins: {
    id: "poppins",
    displayName: "Poppins ExtraBold",
    cssFamily: "Poppins",
    assFontName: "Poppins",
    file: "Poppins.ttf",
    weight: 700,
    style: "normal",
    category: "Modern",
    isDisplay: false,
  },
  inter: {
    id: "inter",
    displayName: "Inter Display",
    cssFamily: "Inter",
    assFontName: "Inter",
    file: "Inter.ttf",
    weight: 700,
    style: "normal",
    category: "Clean",
    isDisplay: false,
  },
  oswald: {
    id: "oswald",
    displayName: "Oswald Bold",
    cssFamily: "Oswald",
    assFontName: "Oswald",
    file: "Oswald.ttf",
    weight: 700,
    style: "normal",
    category: "Bold",
    isDisplay: false,
  },
  komika: {
    id: "komika",
    displayName: "Komika Axis",
    cssFamily: "Komika Axis",
    assFontName: "Komika Axis",
    file: "KomikaAxis.ttf",
    fallbackFile: "ArchivoBlack.ttf",
    weight: 700,
    style: "normal",
    category: "Comic/Viral",
    isDisplay: true,
  },
};

/**
 * Resolves font metadata by user input family name or key.
 */
function resolveFont(familyOrKey = "") {
  if (!familyOrKey) return FONT_REGISTRY.montserrat;
  const clean = String(familyOrKey).toLowerCase().replace(/['"\s\-_]/g, "");
  
  for (const [key, font] of Object.entries(FONT_REGISTRY)) {
    if (
      key === clean ||
      font.cssFamily.toLowerCase().replace(/\s/g, "") === clean ||
      font.displayName.toLowerCase().replace(/\s/g, "") === clean
    ) {
      return font;
    }
  }
  return FONT_REGISTRY.montserrat;
}

/**
 * Returns absolute path to the local TTF font file.
 */
function getFontFilePath(familyOrKey, fontsDir) {
  const font = resolveFont(familyOrKey);
  const targetDir = fontsDir || path.resolve(__dirname, "../../public/fonts");
  return path.join(targetDir, font.file);
}

module.exports = {
  FONT_REGISTRY,
  resolveFont,
  getFontFilePath,
};
