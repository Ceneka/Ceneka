import fs from "fs";
import { Marked } from "marked";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

// Utilities
const removeBars = (text) => text.replace(/\|/g, '');
const escapeHtml = (text = '') =>
    text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

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

async function fetchAiResume(markdown) {
    if (process.env?.LLM_DISABLE === "true" || process.env?.LLM_DISABLE === "1") {
        console.warn("AI resume skipped: LLM_DISABLE detected");
        return "Seasoned full-stack engineer delivering scalable web products across frontend and backend, focused on reliability and clear, maintainable code.";
    }

    if (!process.env.LLM_TOKEN) {
        console.warn("AI resume skipped: LLM_TOKEN not set");
        return null;
    }

    try {
        const client = new OpenAI({
            baseURL: process.env.LLM_ENDPOINT,
            apiKey: process.env.LLM_TOKEN,
        });

        const clippedInput = markdown.slice(0, 8000);
        const completion = await client.chat.completions.create({
            model: process.env.LLM_MODEL,
            temperature: 0.35,
            max_tokens: 240,
            messages: [
                {
                    role: "system",
                    content: "You write concise, confident resume summaries in 2-3 sentences. Mention role, standout expertise, and recent impact. Keep it HTML-safe, no Markdown, no code blocks.",
                },
                {
                    role: "user",
                    content: `Summarize this profile:\n${clippedInput}`,
                },
            ],
        });

        return completion?.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
        console.warn("AI resume skipped:", err?.message || err);
        return null;
    }
}

function buildAiResumeSection(aiText) {
    if (!aiText) return '';
    const paragraphs = aiText
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
        .join('');

    if (!paragraphs) return '';

    return `
<section class="ai-resume" id="ai-resume">
  <div class="container ai-resume-inner">
    <div class="ai-chip">AI Resume</div>
    <div class="ai-resume-body">${paragraphs}</div>
  </div>
</section>`;
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
const aiResumeText = await fetchAiResume(rawReadme);
const aiResumeHTML = buildAiResumeSection(aiResumeText);

// Build remaining content
const renderer = new Marked();
const remainingMd = stripSections(rawReadme);
const remainingCleanMd = removeBars(remainingMd);
let remainingHtml = await renderer.parse(remainingCleanMd);

// Assemble final content
const todayIso = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const pdfFilename = `Zic-Juan-CV-${todayIso}.pdf`;
const finalContent = `
${aiResumeHTML}
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
let output = template.replace("{{HTML_CV_CONTENT}}", finalContent);
output = output.replace("{{PDF_DOWNLOAD_URL}}", pdfFilename);

// Ensure build directory and assets
if (!fs.existsSync("./build")) {
    fs.mkdirSync("./build");
}
if (fs.existsSync("./public")) {
    fs.cpSync("./public", "./build", { recursive: true });
}

// Write final HTML
fs.writeFileSync("./build/index.html", output);

// Build a minimal, clean print HTML from README (no site styles)
const contactLinksInline = hero.contactLinks
    .slice(0, 6)
    .map(l => `<a href="${l.href}">${l.label}</a>`)
    .join(' · ');

let aboutSectionHtml = '';
const aboutSectionMdMatch = rawReadme.match(/###\s+About me:[\s\S]*?(?=\n###|\n$)/);
if (aboutSectionMdMatch) {
    const aboutSectionMd = aboutSectionMdMatch[0]
        .replace(/###\s+About me:/, '')
        .trim();
    aboutSectionHtml = await renderer.parse(aboutSectionMd);
}

// Build a compact skills section (grouped, comma-separated lists)
let skillsSectionHtml = '';
const skillsMatch = rawReadme.match(/### Main Skills:\n([\s\S]*?)(\n###|\n$)/);
if (skillsMatch) {
    const skillsSection = skillsMatch[1].trim();
    const lines = skillsSection.split('\n').map(l => l.trim()).filter(Boolean);
    const groups = {};
    lines.forEach(line => {
        const cleaned = line.replace(/^\*+\s*/, '');
        const parts = cleaned.split(':**');
        if (parts.length === 2) {
            const groupTitle = parts[0].replace(/\*\*/g, '').trim();
            const items = parts[1].split(',').map(s => s.trim()).filter(Boolean);
            if (groupTitle && items.length) groups[groupTitle] = items;
        }
    });
    const groupBlocks = Object.entries(groups).map(([group, items]) => {
        const line = items.join(', ');
        return `<div class="skills-group"><h4>${group}</h4><p class="skills-line">${line}</p></div>`;
    }).join('');
    if (groupBlocks) skillsSectionHtml = `<section class="skills"><h3>Skills</h3>${groupBlocks}</section>`;
}

const printHtml = `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${hero.name || 'CV'}${hero.role ? ' – ' + hero.role : ''}</title>
<style>
  :root { --text: #111; --muted: #555; --accent: #0b6efd; }
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: var(--text); line-height: 1.5; }
  .container { max-width: 800px; margin: 0 auto; }
  header { margin-bottom: 16px; }
  h1 { font-size: 28px; margin: 0 0 4px; color: var(--accent); }
  h2 { font-size: 18px; margin: 0 0 8px; color: var(--muted); font-weight: 500; }
  .contacts { font-size: 12px; color: var(--muted); margin-top: 6px; }
  .contacts a { color: inherit; text-decoration: none; }
  .contacts a:hover { text-decoration: underline; }
  main { font-size: 13px; }
  section { margin: 14px 0; }
  h3 { font-size: 16px; margin: 18px 0 8px; color: var(--accent); }
  h4 { font-size: 14px; margin: 12px 0 4px; color: var(--accent); }
  p { margin: 6px 0; }
  ul { margin: 6px 0 6px 18px; padding: 0; }
  li { margin: 3px 0; }
  hr { border: none; border-top: 1px solid #ddd; margin: 12px 0; }
  /* Avoid breaking headings from their content */
  h3, h4 { break-after: avoid; }
  /* Allow entries to break naturally */
  .timeline-item, .card, .skill-group { break-inside: avoid; }
  /* Links visibly underlined for print */
  a { color: inherit; text-decoration: underline; }
  /* Remove any accidental background */
  body, html { background: #fff; }
  /* Compact skills styling */
  .skills { margin-top: 8px; }
  .skills-group { margin: 8px 0; }
  .skills-line { margin: 2px 0 0; font-size: 12.5px; color: var(--text); }
</style>
</head><body><div class="container">
  <header>
    <h1>${hero.name || ''}</h1>
    ${hero.role ? `<h2>${hero.role}</h2>` : ''}
    ${contactLinksInline ? `<div class="contacts">${contactLinksInline}</div>` : ''}
  </header>
  <main>
    ${aboutSectionHtml ? `<section><h3>About</h3>${aboutSectionHtml}</section>` : ''}
    ${skillsSectionHtml}
    ${experienceHTML ? `<section><h3>Experience</h3>${experienceHTML}</section>` : ''}
    ${remainingHtml ? `<hr /><section>${remainingHtml}</section>` : ''}
  </main>
</div></body></html>`;

fs.writeFileSync("./build/cv-print.html", printHtml);

// Generate PDF at build time using Puppeteer (no jsPDF)
try {
    const { default: puppeteer } = await import("puppeteer");
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
        ],
    });
    const page = await browser.newPage();

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const printPath = path.resolve(__dirname, "build", "cv-print.html");
    const fileUrl = `file://${printPath}`;

    await page.goto(fileUrl, { waitUntil: "networkidle0" });
    await page.emulateMediaType("print");
    await page.pdf({
        path: path.resolve(__dirname, "build", pdfFilename),
        format: "A4",
        printBackground: true,
        margin: { top: "14mm", right: "12mm", bottom: "14mm", left: "12mm" },
    });
    await browser.close();
    console.log(`PDF generated: ${pdfFilename}`);
} catch (err) {
    console.warn("PDF generation skipped (Puppeteer not available):", err?.message || err);
}
