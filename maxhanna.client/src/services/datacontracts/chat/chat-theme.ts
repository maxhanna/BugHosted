export interface UserTheme {
  id: number;
  userId?: number | null;
  backgroundImage?: string | null;
  fontColor?: string | null;
  secondaryFontColor?: string | null;
  thirdFontColor?: string | null;
  backgroundColor?: string | null;
  componentBackgroundColor?: string | null;
  secondaryComponentBackgroundColor?: string | null;
  mainHighlightColor?: string | null;
  mainHighlightColorQuarterOpacity?: string | null;
  linkColor?: string | null;
  fontSize?: number | null;
  fontFamily?: string | null;
  name?: string;
}

export interface GetChatThemeResponse {
  theme?: string;
  userThemeId?: number | null;
  userTheme?: UserTheme | null;
}

export interface SetChatThemeRequest {
  ChatId: number;
  Theme?: string;
  UserThemeId?: number | null;
}
