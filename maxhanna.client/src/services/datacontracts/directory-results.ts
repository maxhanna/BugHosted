import { FileEntry } from "./file-entry";
export interface DirectoryResults {
  totalCount?: number;
  page?: number;
  pageSize?: number;
  data?: FileEntry[];
}
