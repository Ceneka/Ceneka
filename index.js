import fs from "fs";
import { Marked } from "marked";

// Function to parse and transform the "Main Skills" section
function parseMainSkills(markdown) {
    // Capture "Main Skills:" section until next header or end of file
    const regex = /### Main Skills:\n([\s\S]*?)(\n###|\n$)/;
    const match = markdown.match(regex);
    if (!match) return "";
    const skillsSection = match[1].trim();
    const lines = skillsSection.split('\n').map(line => line.trim()).filter(Boolean);
    const groups = {};
    lines.forEach(line => {
        // Example line: "*   **Programing Languages:** TypeScript, PHP"
        const cleaned = line.replace(/^\*\s*/, '');
        const [title, items] = cleaned.split(':**');
        if (title && items) {
            const groupTitle = title.replace(/\*\*/g, '').trim();
            groups[groupTitle] = items.split(',').map(item => item.trim());
        }
    });
    let html = '<div class="main-skills">';
    for (const group in groups) {
        html += `<div class="skill-group"><h3>${group}</h3><ul>`;
        groups[group].forEach(skill => {
            html += `<li>${skill}</li>`;
        });
        html += '</ul></div>';
    }
    html += '</div>';
    return html;
}

const removeBars = (text) => {
    // Remove all bars (|) from the text
    return text.replace(/\|/g, '');
}

//read README.md
let readme = fs.readFileSync("./README.md", "utf-8")
// Remove the original "Main Skills" section and insert a placeholder
readme = readme.replace(/### Main Skills:\n[\s\S]*?(?=\n###|\n$)/, '<!--SKILLS_PLACEHOLDER-->')

readme = removeBars(readme)
// Generate new skills HTML
const skillsHTML = parseMainSkills(fs.readFileSync("./README.md", "utf-8"))
// Remove bars from the readme
//read template.html
const template = fs.readFileSync("./template.html", "utf-8")

const renderer = new Marked()
// Parse the modified markdown
let cv_html = await renderer.parse(readme)
// Replace placeholder with new skills HTML
cv_html = cv_html.replace('<!--SKILLS_PLACEHOLDER-->', skillsHTML)

//replace {{HTML_CV_CONTENT}} with html
const output = template.replace("{{HTML_CV_CONTENT}}", cv_html)

//create build folder if it doesn't exist
if (!fs.existsSync("./build")) {
    fs.mkdirSync("./build")
}

//copy all files in public to build
fs.cpSync("./public", "./build", { recursive: true })

//write it to index.html
fs.writeFileSync("./build/index.html", output)
