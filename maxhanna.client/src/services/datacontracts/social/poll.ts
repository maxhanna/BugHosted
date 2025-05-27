export class Poll {
  id!: number;
  componentId!: string;  // Matches the story ID or other component identifier
  question!: string;
  options!: PollOption[];
  userVotes!: PollVote[];  // Votes from all users
  currentUserVote?: string; // The current user's vote (if any)
  totalVotes!: number;
  expiresAt?: Date;
  createdAt!: Date;
  isClosed!: boolean;

  constructor(data?: Partial<Poll>) {
    if (data) {
      Object.assign(this, data);

      // Ensure proper Date objects
      if (data.expiresAt) this.expiresAt = new Date(data.expiresAt);
      if (data.createdAt) this.createdAt = new Date(data.createdAt);

      // Initialize arrays if not provided
      this.options = data.options || [];
      this.userVotes = data.userVotes || [];

      // Calculate total votes
      this.totalVotes = this.userVotes.length;
    }
  }
}

export interface PollOption {
  id: string;  // Unique identifier for the option
  text: string;
  voteCount: number;
  percentage?: number; // Calculated percentage of votes
}

export interface PollVote {
  id: number;
  userId: number;
  componentId: string;
  value: string;  // Matches the option id
  timestamp: Date;
  username?: string; // Optional user info
  displayPicture?: string; // Optional user avatar
}