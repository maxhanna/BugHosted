export class Comment {
  id!: number;
  userId!: number;
  username!: string;
  commentText?: string;
  upvotes?: number;
  downvotes?: number;
}
