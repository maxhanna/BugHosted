import { Story } from "./story";

export class StoryResponse {
  pageCount!: number;
  currentPage!: number;
  totalCount!: number;
  stories?: Array<Story>;
}