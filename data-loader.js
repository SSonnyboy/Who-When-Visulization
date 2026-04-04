// ==================== 数据加载器 ====================
// 这个文件用于在服务器端预加载数据并生成一个合并的数据文件

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..');
const algorithmDir = path.join(dataDir, 'data', 'Algorithm-Generated');
const handcraftedDir = path.join(dataDir, 'data', 'Hand-Crafted');
const outputFile = path.join(__dirname, 'all-data.json');

console.log('开始加载数据...');

// 加载算法生成数据集
const algorithmFiles = fs.readdirSync(algorithmDir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => parseInt(a) - parseInt(b));

// 加载手工标注数据集
const handcraftedFiles = fs.readdirSync(handcraftedDir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => parseInt(a) - parseInt(b));

console.log(`找到 ${algorithmFiles.length} 个算法生成文件`);
console.log(`找到 ${handcraftedFiles.length} 个手工标注文件`);

const allData = [];

// 加载算法生成数据
algorithmFiles.forEach(file => {
    const filePath = path.join(algorithmDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const fileNum = parseInt(file);
    allData.push({
        ...data,
        dataset: 'algorithm',
        id: `A${fileNum}`
    });
});

// 加载手工标注数据
handcraftedFiles.forEach(file => {
    const filePath = path.join(handcraftedDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const fileNum = parseInt(file);
    allData.push({
        ...data,
        dataset: 'handcrafted',
        id: `H${fileNum}`
    });
});

console.log(`总共加载 ${allData.length} 个案例`);

// 保存合并的数据
fs.writeFileSync(outputFile, JSON.stringify(allData, null, 2), 'utf8');

console.log(`数据已保存到: ${outputFile}`);
console.log('完成!');