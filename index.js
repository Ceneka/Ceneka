import fs from "fs";
import { Marked } from "marked";

// Utilities
const removeBars = (text) => text.replace(/\|/g, '');

const readTextFile = (path) => fs.readFileSync(path, "utf-8");

// Parse the main header and contacts to build hero content
function parseHero(markdown) {
    const lines = markdown.split("\n");
    // Find first H2 header line
    const headerIndex = lines.findIndex(l => /^##\s+/.test(l));
    const headerLine = headerIndex !== -1 ? lines[headerIndex] : '';
    const headerText = headerLine.replace(/^##\s+/, '').trim();
    let name = headerText;
    let role = '';
    if (headerText.includes('♦')) {
        const parts = headerText.split('♦');
        name = (parts[0] || '').trim();
        role = (parts[1] || '').trim();
    }

    // Collect contact links from the next few lines and from Reach me out section
    const contactCandidates = [];
    for (let i = headerIndex + 1; i < Math.min(lines.length, headerIndex + 6); i++) {
        if (!lines[i]) continue;
        if (/(\[.+?\]\(.+?\))/.test(lines[i])) contactCandidates.push(lines[i]);
    }
    // Add Reach me out section lines if present
    const reachSectionMatch = markdown.match(/###\s+Reach me out:[\s\S]*?$/m);
    if (reachSectionMatch) {
        const reachLines = reachSectionMatch[0].split('\n').slice(1);
        contactCandidates.push(...reachLines);
    }

    const contactLinks = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    contactCandidates.forEach(line => {
        let match;
        while ((match = linkRegex.exec(line)) !== null) {
            contactLinks.push({ label: match[1], href: match[2] });
        }
    });

    // About me first paragraph as hero description
    let aboutSnippet = '';
    const aboutMatch = markdown.match(/###\s+About me:[\s\S]*?(?=\n###|\n$)/);
    if (aboutMatch) {
        const aboutText = aboutMatch[0]
            .replace(/###\s+About me:/, '')
            .trim()
            .split('\n')
            .filter(Boolean)
            .join(' ');
        aboutSnippet = aboutText.length > 420 ? aboutText.slice(0, 420).trim() + '… <a href="#experience">Read more</a>' : aboutText;
    }

    return { name, role, aboutSnippet, contactLinks };
}

// Parse and transform the Main Skills section into cards
function parseSkillsAsCards(markdown) {
    const regex = /### Main Skills:\n([\s\S]*?)(\n###|\n$)/;
    const match = markdown.match(regex);
    if (!match) return '';
    const skillsSection = match[1].trim();
    const lines = skillsSection.split('\n').map(line => line.trim()).filter(Boolean);
    const groups = {};
    lines.forEach(line => {
        // Normalize bullets and split title/items
        const cleaned = line.replace(/^\*+\s*/, '');
        const parts = cleaned.split(':**');
        if (parts.length === 2) {
            const groupTitle = parts[0].replace(/\*\*/g, '').trim();
            const items = parts[1].split(',').map(s => s.trim()).filter(Boolean);
            if (groupTitle && items.length) groups[groupTitle] = items;
        }
    });
    let html = '';
    Object.entries(groups).forEach(([group, items]) => {
        html += `<div class="card skill-group"><h3>${group}</h3><ul>`;
        items.forEach(item => {
            html += `<li>${item}</li>`;
        });
        html += '</ul></div>';
    });
    return html;
}

// Parse Experience into a timeline structure
function parseExperienceTimeline(markdown) {
    const expMatch = markdown.match(/###\s+Experience:[\s\S]*?(?=\n###|\n$)/);
    if (!expMatch) return '';
    const expBlock = expMatch[0].replace(/###\s+Experience:/, '').trim();
    const entries = expBlock.split(/\n(?=####\s)/).map(s => s.trim()).filter(Boolean);
    let html = '';
    entries.forEach(entry => {
        const lines = entry.split('\n');
        const titleLine = lines[0].replace(/^####\s+/, '').trim();
        let period = '';
        let descLines = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            const m = line.match(/^_\s*(.*?)\s*_\s*$/);
            if (m && !period) {
                period = m[1];
            } else if (line) {
                descLines.push(line);
            }
        }
        // Merge consecutive lines into paragraphs by blank lines
        const paragraphs = descLines.join('\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        html += `<div class="timeline-item"><div class="card timeline-card">`;
        html += `<h4>${titleLine}</h4>`;
        if (period) html += `<p><em>${period}</em></p>`;
        paragraphs.forEach(p => {
            html += `<p>${p}</p>`;
        });
        html += `</div></div>`;
    });
    return html;
}

// Build Hero HTML
function buildHeroHTML(hero) {
    const { name, role, aboutSnippet, contactLinks } = hero;
    const actions = contactLinks.slice(0, 4).map(l => `<a href="${l.href}" target="_blank" rel="noopener">${l.label}</a>`).join('');
    return `
<section class="section hero" id="about">
  <div class="backdrop"></div>
  <div class="container">
    <div class="grid">
      <div class="hero-card">
        <div class="hero-title">${name}</div>
        ${role ? `<div class="hero-subtitle">${role}</div>` : ''}
        ${aboutSnippet ? `<p class="hero-desc">${aboutSnippet}</p>` : ''}
        <div class="hero-actions">${actions}</div>
      </div>
    </div>
  </div>
</section>`;
}

// Remove sections we will replace with custom components
function stripSections(markdown) {
    let md = markdown;
    // Remove top header and immediate contact line(s)
    md = md.replace(/^##\s+.*$/m, '');
    // Remove the next line if it contains links
    md = md.replace(/^\s*\[.*\)\s*(\|.*\))?.*$/m, '');
    // Remove About, Main Skills, Experience, Reach me out sections
    md = md.replace(/###\s+About me:[\s\S]*?(?=\n###|\n$)/, '');
    md = md.replace(/###\s+Main Skills:[\s\S]*?(?=\n###|\n$)/, '');
    md = md.replace(/###\s+Experience:[\s\S]*?(?=\n###|\n$)/, '');
    md = md.replace(/###\s+Reach me out:[\s\S]*?(?=\n###|\n$)/, '');
    return md.trim();
}

// Read inputs
const rawReadme = readTextFile("./README.md");
const template = readTextFile("./template.html");

// Build sections
const hero = parseHero(rawReadme);
const skillsCardsHTML = parseSkillsAsCards(rawReadme);
const experienceHTML = parseExperienceTimeline(rawReadme);

// Build remaining content
const renderer = new Marked();
const remainingMd = stripSections(rawReadme);
const remainingCleanMd = removeBars(remainingMd);
let remainingHtml = await renderer.parse(remainingCleanMd);

// Assemble final content
const finalContent = `
${buildHeroHTML(hero)}

<section class="section" id="skills">
  <div class="container">
    <h2>Skills</h2>
    <div class="cards">${skillsCardsHTML}</div>
  </div>
</section>

<section class="section" id="experience">
  <div class="container">
    <h2>Experience</h2>
    <div class="timeline">${experienceHTML}</div>
  </div>
</section>

<section class="section" id="content">
  <div class="container">${remainingHtml}</div>
  </section>
`;

// Inject into template
const output = template.replace("{{HTML_CV_CONTENT}}", finalContent);

// Ensure build directory and assets
if (!fs.existsSync("./build")) {
    fs.mkdirSync("./build");
}
if (fs.existsSync("./public")) {
    fs.cpSync("./public", "./build", { recursive: true });
}

// Write final HTML
fs.writeFileSync("./build/index.html", output);
