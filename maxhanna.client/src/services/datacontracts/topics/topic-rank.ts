export class TopicRank {
  topicId: number;
  topicName: string;
  storyCount: number;
  fileCount: number;

  constructor(topicId: number, topicName: string, storyCount: number, fileCount: number) {
    this.topicId = topicId;
    this.topicName = topicName;
    this.storyCount = storyCount;
    this.fileCount = fileCount;
  }
}  
