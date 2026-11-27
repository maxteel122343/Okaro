import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import sharp from "sharp";

interface ParsedSection {
  level: number;
  title: string;
  body: string;
}

interface ParsedFigure {
  path: string;
  caption: string;
}

function stripLatexFormatting(text: string): string {
  return text
    .replace(/%.*$/gm, "")
    .replace(/\\textbf\{([^}]*)\}/g, "$1")
    .replace(/\\textit\{([^}]*)\}/g, "$1")
    .replace(/\\emph\{([^}]*)\}/g, "$1")
    .replace(/\\texttt\{([^}]*)\}/g, "$1")
    .replace(/\\text\{([^}]*)\}/g, "$1")
    .replace(/\\cite[tp]?\{([^}]*)\}/g, "[$1]")
    .replace(/\\[cC]ref\{([^}]*)\}/g, "Ref($1)")
    .replace(/\\ref\{([^}]*)\}/g, "Ref($1)")
    .replace(/\\label\{[^}]*\}/g, "")
    .replace(/\\begin\{equation\*?\}|\\end\{equation\*?\}/g, "")
    .replace(/\\begin\{align\*?\}|\\end\{align\*?\}/g, "")
    .replace(/\\begin\{itemize\}|\\end\{itemize\}/g, "")
    .replace(/\\begin\{enumerate\}|\\end\{enumerate\}/g, "")
    .replace(/\\item\s+/g, "• ")
    .replace(/\\\\/g, "\n")
    .replace(/\\par\b/g, "\n\n")
    .replace(/~/g, " ")
    .replace(/\\([%$&_#{}])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractPlainPaperText(texContent: string): string {
  const docMatch = texContent.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  const body = docMatch ? docMatch[1] : texContent;
  return stripLatexFormatting(
    body
      .replace(/\\begin\{figure\*?\}[\s\S]*?\\end\{figure\*?\}/g, "")
      .replace(/\\begin\{table\*?\}[\s\S]*?\\end\{table\*?\}/g, "")
  );
}

function parseLatexForPdf(texContent: string): {
  title: string;
  author: string;
  abstractText: string;
  sections: ParsedSection[];
  figures: ParsedFigure[];
} {
  const titleMatch = texContent.match(/\\title\{([\s\S]*?)\}/);
  const title = titleMatch ? stripLatexFormatting(titleMatch[1]) : "Generated Research Paper";

  const authorMatch = texContent.match(/\\author\{([\s\S]*?)\n\}/);
  const author = authorMatch
    ? stripLatexFormatting(authorMatch[1]).replace(/\n+/g, ", ")
    : "Ambitious AI Researcher, AI Research Institute";

  const absMatch = texContent.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/);
  const abstractText = absMatch ? stripLatexFormatting(absMatch[1]) : "";

  const figures: ParsedFigure[] = [];
  const figMatches = texContent.matchAll(/\\begin\{figure\*?\}[\s\S]*?\\end\{figure\*?\}/g);
  for (const m of figMatches) {
    const block = m[0];
    const imgMatch = block.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/);
    const capMatch = block.match(/\\caption\{([\s\S]*?)\}/);
    if (imgMatch) {
      figures.push({
        path: imgMatch[1].trim(),
        caption: capMatch ? stripLatexFormatting(capMatch[1]) : "",
      });
    }
  }

  const docMatch = texContent.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  let mainBody = docMatch ? docMatch[1] : texContent;
  mainBody = mainBody
    .replace(/\\maketitle/g, "")
    .replace(/\\begin\{abstract\}[\s\S]*?\\end\{abstract\}/g, "")
    .replace(/\\begin\{figure\*?\}[\s\S]*?\\end\{figure\*?\}/g, "")
    .replace(/\\bibliography\{[^}]*\}|\\bibliographystyle\{[^}]*\}/g, "");

  const sections: ParsedSection[] = [];
  const tokenRegex = /\\(sub)*section\*?\{([^}]+)\}/g;
  let lastIndex = 0;
  let lastTitle = "";
  let lastLevel = 1;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(mainBody)) !== null) {
    if (lastTitle) {
      const chunk = mainBody.slice(lastIndex, match.index);
      sections.push({
        level: lastLevel,
        title: stripLatexFormatting(lastTitle),
        body: stripLatexFormatting(chunk),
      });
    }
    lastLevel = match[0].includes("subsection") ? 2 : 1;
    lastTitle = match[2];
    lastIndex = match.index + match[0].length;
  }

  if (lastTitle) {
    sections.push({
      level: lastLevel,
      title: stripLatexFormatting(lastTitle),
      body: stripLatexFormatting(mainBody.slice(lastIndex)),
    });
  } else {
    sections.push({
      level: 1,
      title: "Manuscript",
      body: stripLatexFormatting(mainBody),
    });
  }

  return { title, author, abstractText, sections, figures };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

export async function generatePageSnapshots(
  texContent: string,
  snapshotsDir: string
): Promise<string[]> {
  fs.mkdirSync(snapshotsDir, { recursive: true });
  const parsed = parseLatexForPdf(texContent);

  const cards: Array<{ heading: string; snippet: string }> = [
    {
      heading: parsed.title.slice(0, 72),
      snippet: parsed.abstractText || "Abstract summary...",
    },
    ...parsed.sections.slice(0, 5).map((s) => ({
      heading: s.title.slice(0, 64),
      snippet: s.body.slice(0, 420),
    })),
  ];

  const outputPaths: string[] = [];
  const totalGrids = Math.min(3, Math.max(1, Math.ceil(cards.length / 2)));

  for (let g = 0; g < totalGrids; g++) {
    const left = cards[g * 2] ?? { heading: "Continuation", snippet: "" };
    const right = cards[g * 2 + 1] ?? { heading: "References & Layout", snippet: "" };

    const leftLines = wrapLines(left.snippet, 42, 12);
    const rightLines = wrapLines(right.snippet, 42, 12);

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="840" height="540" viewBox="0 0 840 540">
  <rect width="840" height="540" fill="#f1f5f9"/>
  <rect x="20" y="20" width="388" height="500" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
  <rect x="432" y="20" width="388" height="500" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
  <text x="42" y="54" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="bold" fill="#0f172a">${escapeXml(left.heading.slice(0, 44))}</text>
  <line x1="42" y1="68" x2="386" y2="68" stroke="#e2e8f0" stroke-width="1"/>
  ${leftLines
    .map(
      (line, idx) =>
        `<text x="42" y="${94 + idx * 24}" font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#334155">${escapeXml(line)}</text>`
    )
    .join("")}
  <text x="454" y="54" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="bold" fill="#0f172a">${escapeXml(right.heading.slice(0, 44))}</text>
  <line x1="454" y1="68" x2="798" y2="68" stroke="#e2e8f0" stroke-width="1"/>
  ${rightLines
    .map(
      (line, idx) =>
        `<text x="454" y="${94 + idx * 24}" font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#334155">${escapeXml(line)}</text>`
    )
    .join("")}
  <text x="214" y="502" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">Page ${g * 2 + 1}</text>
  <text x="626" y="502" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">Page ${g * 2 + 2}</text>
</svg>`;

    const outPath = path.join(snapshotsDir, `grid_${g + 1}.png`);
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    outputPaths.push(outPath);
  }

  return outputPaths;
}

export async function buildPdfFromLatex(
  texContent: string,
  workDir: string,
  outputPdfPath: string,
  snapshotsDir?: string
): Promise<string> {
  fs.mkdirSync(path.dirname(outputPdfPath), { recursive: true });
  const parsed = parseLatexForPdf(texContent);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 54, bottom: 54, left: 54, right: 54 },
    });
    const stream = fs.createWriteStream(outputPdfPath);
    doc.pipe(stream);

    doc.font("Times-Bold").fontSize(16).text(parsed.title, { align: "center" });
    doc.moveDown(0.5);
    doc
      .font("Times-Roman")
      .fontSize(10.5)
      .fillColor("#334155")
      .text(parsed.author, { align: "center" });
    doc.moveDown(1);

    if (parsed.abstractText) {
      doc.font("Times-Bold").fontSize(11).fillColor("#0f172a").text("Abstract", {
        align: "center",
      });
      doc.moveDown(0.3);
      doc
        .font("Times-Roman")
        .fontSize(10)
        .text(parsed.abstractText, { align: "justify" });
      doc.moveDown(1);
    }

    for (const section of parsed.sections) {
      doc
        .font("Times-Bold")
        .fontSize(section.level === 1 ? 13 : 11.5)
        .fillColor("#0f172a")
        .text(section.title);
      doc.moveDown(0.3);
      if (section.body) {
        doc
          .font("Times-Roman")
          .fontSize(10.5)
          .fillColor("#1e293b")
          .text(section.body, { align: "justify" });
        doc.moveDown(0.8);
      }
    }

    for (const fig of parsed.figures) {
      const candidatePaths = [
        path.join(workDir, fig.path),
        path.join(workDir, "figures", path.basename(fig.path)),
      ];
      const resolved = candidatePaths.find((p) => fs.existsSync(p));
      if (resolved && /\.(png|jpe?g)$/i.test(resolved)) {
        try {
          doc.addPage();
          doc.image(resolved, {
            fit: [480, 360],
            align: "center",
          });
          doc.moveDown(0.5);
          if (fig.caption) {
            doc
              .font("Times-Italic")
              .fontSize(9.5)
              .fillColor("#334155")
              .text(`Figure: ${fig.caption}`, { align: "center" });
          }
        } catch {
          // Ignore unsupported image format in PDFKit
        }
      }
    }

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  if (snapshotsDir) {
    await generatePageSnapshots(texContent, snapshotsDir);
  }

  return outputPdfPath;
}
