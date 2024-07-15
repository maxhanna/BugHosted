import { User } from "./user";

export class Contact {
  id: number | undefined;
  name: string | undefined;
  phone: string | null | undefined;
  birthday: Date | null | undefined;
  notes: string | null | undefined;
  email: string | null | undefined;
  user: User | undefined;
}
