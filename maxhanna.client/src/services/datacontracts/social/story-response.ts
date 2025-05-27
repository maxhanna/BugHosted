import { Story } from "./story";
import { Poll } from "./poll";

export class StoryResponse {
  pageCount!: number;
  currentPage!: number;
  totalCount!: number;
  stories?: Array<Story>;
  polls?: Array<Poll>; 
}