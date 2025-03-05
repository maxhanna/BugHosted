import { FileEntry } from "../file/file-entry";

export class Theme {
  id?: number;
  name?: string;
  backgroundImage?: number;
  backgroundColor: string;
  componentBackgroundColor: string;
  secondaryComponentBackgroundColor: string;
  fontColor: string;
  secondaryFontColor: string;
  thirdFontColor: string;
  mainHighlightColor: string;
  mainHighlightColorQuarterOpacity: string;
  linkColor: string;
  fontSize: string;
  fontFamily: string;

  constructor(
    backgroundImage?: number,
    backgroundColor: string = "",
    componentBackgroundColor: string = "",
    secondaryComponentBackgroundColor: string = "",
    fontColor: string = "",
    secondaryFontColor: string = "",
    thirdFontColor: string = "",
    mainHighlightColor: string = "",
    mainHighlightColorQuarterOpacity: string = "",
    linkColor: string = "",
    fontSize: string = "",
    fontFamily: string = "",
    id?: number,
    name?: string,
  ) {
    this.id = id;
    this.name = name;
    this.backgroundImage = backgroundImage;
    this.backgroundColor = backgroundColor;
    this.componentBackgroundColor = componentBackgroundColor;
    this.secondaryComponentBackgroundColor = secondaryComponentBackgroundColor;
    this.fontColor = fontColor;
    this.secondaryFontColor = secondaryFontColor;
    this.thirdFontColor = thirdFontColor;
    this.mainHighlightColor = mainHighlightColor;
    this.mainHighlightColorQuarterOpacity = mainHighlightColorQuarterOpacity;
    this.linkColor = linkColor;
    this.fontSize = fontSize;
    this.fontFamily = fontFamily;
  }

  static fromObject(obj: any): Theme {
    return new Theme(
      obj.backgroundImage, // This could be a FileEntry or a string ID
      obj.backgroundColor,
      obj.componentBackgroundColor,
      obj.secondaryComponentBackgroundColor,
      obj.fontColor,
      obj.secondaryFontColor,
      obj.thirdFontColor,
      obj.mainHighlightColor,
      obj.mainHighlightColorQuarterOpacity,
      obj.linkColor,
      obj.fontSize,
      obj.fontFamily,
      obj.id,
      obj.name,
    );
  }
}
