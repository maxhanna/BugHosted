const fs = require('fs');

const filePath = process.argv[2];
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\r\n');
const newLines = [];
let inserted = false;

for (let i = 0; i < lines.length; i++) {
  if (!inserted && lines[i].includes("else if (this.router.url.includes('Social'))")) {
    newLines.push(`        else if (this.router.url.toLowerCase().includes('social/topic')) {`);
    newLines.push(`          this.checkAndClearRouterOutlet();`);
    newLines.push(`          const topicIds = this.router.url.toLowerCase().split('social/topic/')[1]?.split('?')[0];`);
    newLines.push(`          this.angLocation.replaceState('/Social');`);
    newLines.push(`          this.createComponent("Social", { "topicIds": topicIds });`);
    newLines.push(`        }`);
    newLines.push(lines[i]);
    inserted = true;
    continue;
  }
  newLines.push(lines[i]);
}

fs.writeFileSync(filePath, newLines.join('\r\n'), 'utf8');
console.log('Successfully updated routing');
