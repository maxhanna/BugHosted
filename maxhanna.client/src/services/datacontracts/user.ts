export class User {
  id: number | undefined;
  username: string | undefined;
  pass: string | undefined;

  constructor(id?: number, username?: string, password?: string) {
    this.id = id;
    this.username = username;
    this.pass = password;
  }
}
