const fs = require('fs');

const filePath = process.argv[2];
const content = fs.readFileSync(filePath, 'utf8');

const oldPattern = `else if (this.router.url.includes('Social')) {\n          this.checkAndClearRouterOutlet();\n          const storyId = this.router.url.toLowerCase().split('social/')[1]?.split('?')[0];\n          this.angLocation.replaceState(this.router.url.split('?')[0]);\n          this.createComponent("Social", { "storyId": storyId });\n        }`;

const newPattern = `else if (this.router.url.toLowerCase().includes('social/topic')) {\n          this.checkAndClearRouterOutlet();\n          const topicIds = this.router.url.toLowerCase().split('social/topic/')[1]?.split('?')[0];\n          this.angLocation.replaceState('/Social');\n          this.createComponent("Social", { "topicIds": topicIds });\n        }\n        else if (this.router.url.includes('Social')) {\n          this.checkAndClearRouterOutlet();\n          const storyId = this.router.url.toLowerCase().split('social/')[1]?.split('?')[0];\n          this.angLocation.replaceState(this.router.url.split('?')[0]);\n          this.createComponent("Social", { "storyId": storyId });\n        }`;

if (content.includes(oldPattern)) {
  const updated = content.replace(oldPattern, newPattern);
  fs.writeFileSync(filePath, updated, 'utf8');
  console.log('Successfully updated routing');
} else {
  console.log('Pattern not found - checking exact match');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("else if (this.router.url.includes('Social'))")) {
      console.log(`Found at line ${i + 1}:`);
      for (let j = i; j < Math.min(i + 8, lines.length); j++) {
        console.log(`${j + 1}: ${JSON.stringify(lines[j])}`);
      }
      break;
    }
  }
}
