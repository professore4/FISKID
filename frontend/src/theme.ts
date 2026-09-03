// Shared design tokens for FiskID — Glass/Luxe DARK personality
export const colors = {
  surface: "#050505",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#141414",
  onSurfaceSecondary: "#E0E0E0",
  surfaceTertiary: "#222222",
  onSurfaceTertiary: "#CCCCCC",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#000000",
  brand: "#059669",
  brandPrimary: "#059669",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#10B981",
  brandTertiary: "#064E3B",
  onBrandTertiary: "#D1FAE5",
  success: "#059669",
  warning: "#D97706",
  error: "#DC2626",
  border: "#2A2A2A",
  borderStrong: "#404040",
  divider: "#1F1F1F",
  muted: "#8A8A8A",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const font = {
  display: "Georgia", // serif fallback for Fraunces
  text: "System",
};

export const type = {
  display: {
    fontFamily: font.display,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -0.5,
    color: colors.onSurface,
  },
  h1: {
    fontFamily: font.display,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.3,
    color: colors.onSurface,
  },
  h2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "600" as const,
    color: colors.onSurface,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.onSurfaceSecondary,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
    fontWeight: "600" as const,
  },
  small: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.onSurfaceTertiary,
  },
};

export const IMAGES = {
  cardBackground:
    "https://images.unsplash.com/photo-1635151227785-429f420c6b9d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjd8MHwxfHNlYXJjaHwzfHxhYnN0cmFjdCUyMGRhcmslMjBtZXRhbCUyMHRleHR1cmUlMjBwcmVtaXVtfGVufDB8fHx8MTc4ODQzMDE2MXww&ixlib=rb-4.1.0&q=85",
  welcomeBackground:
    "https://images.unsplash.com/photo-1711025372958-db48a4fe0ba1?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzB8MHwxfHNlYXJjaHwyfHxhYnN0cmFjdCUyMGdyZWVuJTIwbGlnaHQlMjBkYXJrJTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3ODg0MzAxNjF8MA&ixlib=rb-4.1.0&q=85",
};
