export class Todo {
  id: number | undefined;
  todo: string | undefined;
  type: string | undefined;
  url: string | undefined;
  fileId: number | undefined;
  date: Date | undefined;
  done: boolean| undefined;
  // server returns ownership and owner_name for shared todos
  ownership?: number;
  owner_name?: string;
}
