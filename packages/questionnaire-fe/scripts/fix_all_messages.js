const fs = require('fs');
const path = require('path');

const srcDir = 'd:\\02-前端\\01-myProject\\wenjuan\\questionnaire\\packages\\questionnaire-fe\\src';

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip if it doesn't import message from antd
    if (!content.includes('import ') || !content.includes('antd')) return;

    // match "message," or " message " or "{message}" from antd
    const importRegex = /import\s+{[^}]*\bmessage\b[^}]*}\s+from\s+['"]antd['"]/;
    if (!importRegex.test(content)) return;

    // Skip if already uses App.useApp
    if (content.includes('App.useApp()')) {
        // If it imports both message and uses App.useApp, we might just need to remove the static message import
        // Let's leave these for now to be safe, except if the component *only* has App.useApp()
    }

    // 1. Add App to antd imports and remove message
    content = content.replace(/import\s+{([^}]+)}\s+from\s+['"]antd['"]/, (match, p1) => {
        let imports = p1.split(',').map(s => s.trim()).filter(s => s !== 'message' && s !== '');
        if (!imports.includes('App')) imports.push('App');
        return `import { ${imports.join(', ')} } from 'antd'`;
    });

    // 2. Add const { message } = App.useApp() inside the main React component
    // Find the first React component definition
    content = content.replace(/(const\s+\w+\s*:\s*React\.FC(?:<[^>]+>)?\s*=\s*\([^)]*\)\s*=>\s*{)/, `$1\n  const { message } = App.useApp()`);

    // Fallback for function Component()
    if (!content.includes('const { message } = App.useApp()')) {
        content = content.replace(/(function\s+[A-Z]\w*\s*\([^)]*\)\s*{)/, `$1\n  const { message } = App.useApp()`);
    }

    // Fallback for const Component = () => {
    if (!content.includes('const { message } = App.useApp()')) {
        content = content.replace(/(const\s+[A-Z]\w*\s*=\s*\([^)]*\)\s*=>\s*{)/, `$1\n  const { message } = App.useApp()`);
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
}

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else if (fullPath.endsWith('.tsx')) {
            processFile(fullPath);
        }
    }
}

walk(srcDir);
