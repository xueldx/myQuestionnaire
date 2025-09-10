const fs = require('fs');
const path = require('path');

const directoryPath = 'd:\\02-前端\\01-myProject\\wenjuan\\questionnaire\\packages\\questionnaire-fe\\src\\pages\\question\\Edit\\components\\RightPanel\\configComponents';

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip if already uses App.useApp
    if (content.includes('App.useApp()')) {
        return;
    }

    // 1. Add App to antd imports
    if (content.includes('import {') && content.includes('antd\'')) {
        // If message is in the import, make sure App is also there or replace message with App
        // Wait, let's just make sure App is imported from antd.
        if (!content.includes('App')) {
            content = content.replace(/import\s+{([^}]+)}\s+from\s+'antd'/, (match, p1) => {
                const imports = p1.split(',').map(s => s.trim()).filter(s => s !== 'message');
                if (!imports.includes('App')) imports.push('App');
                return `import { ${imports.join(', ')} } from 'antd'`;
            });
        }
    }

    // 2. Add const { message } = App.useApp() inside the component
    // Component signature usually looks like `const XXXConfig: React.FC<...> = (...) => {`
    content = content.replace(/(const\s+\w+Config\s*:\s*React\.FC<[^>]+>\s*=\s*\([^)]*\)\s*=>\s*{)/, `$1\n  const { message } = App.useApp()`);

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
}

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else if (fullPath.endsWith('Config.tsx')) {
            processFile(fullPath);
        }
    }
}

walk(directoryPath);
