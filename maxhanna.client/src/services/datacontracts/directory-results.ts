import { FileEntry } from "./file-entry";
export interface DirectoryResults {
  totalCount?: number;
  currentDirectory?: string;
  page?: number;
  pageSize?: number;
  data?: FileEntry[];
}
