export interface ThemeColors {
  heritageGreen: string
  forestGreen: string
  cream: string
  canvasTan: string
  leather: string
  matteBlack: string
  softGold: string
  white: string
  warmSand: string
  sand: string
}

export interface ThemeTypographyStyle {
  fontFamily: 'display' | 'body'
  fontSize: string
  fontWeight: string
  lineHeight: string
  letterSpacing?: string
  textTransform?: string
}

export interface Theme {
  colors: ThemeColors
  fonts: {
    display: string
    body: string
  }
  typography: Record<string, ThemeTypographyStyle>
  spacing: {
    sectionY: string
    sectionYLarge: string
    containerX: string
    containerMax: string
  }
  radii: {
    sm: string
    md: string
    lg: string
  }
}
