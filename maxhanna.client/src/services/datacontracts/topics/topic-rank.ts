export class TopicRank {
  topicId: number;
  topicName: string;
  storyCount: number;

  constructor(topicId: number, topicName: string, storyCount: number) {
    this.topicId = topicId;
    this.topicName = topicName;
    this.storyCount = storyCount;
  }
}  
