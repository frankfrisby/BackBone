/**
 * Markdown to LaTeX Converter Tool
 *
 * Converts .md files into .tex (LaTeX) files, then optionally compiles to PDF.
 *
 * Actions:
 *   convert  — MD → LaTeX (.tex file)
 *   compile  — LaTeX → PDF (requires pdflatex/MiKTeX)
 *   full     — MD → LaTeX → PDF in one step
 *   check    — Check if LaTeX toolchain is installed
 */

import fs from "fs";
import path from "path";
import { execSync, exec } from "child_process";
import { getProjectsDir, getDataDir } from "../src/services/paths.js";

// === Markdown → LaTeX Converter ===

function mdToLatex(mdContent, options = {}) {
  const {
    title = "",
    author = "",
    date = "\\today",
    documentClass = "article",
    fontSize = "12pt",
    paperSize = "a4paper",
    margin = "1in",
  } = options;

  let latex = "";

  // Preamble
  latex += `\\documentclass[${fontSize},${paperSize}]{${documentClass}}\n\n`;
  latex += `% ---- Packages ----\n`;
  latex += `\\usepackage[utf8]{inputenc}\n`;
  latex += `\\usepackage[T1]{fontenc}\n`;
  latex += `\\usepackage{amsmath,amssymb}\n`;
  latex += `\\usepackage{graphicx}\n`;
  latex += `\\usepackage{booktabs}\n`;
  latex += `\\usepackage{array}\n`;
  latex += `\\usepackage[margin=${margin}]{geometry}\n`;
  latex += `\\usepackage{hyperref}\n`;
  latex += `\\usepackage{xcolor}\n`;
  latex += `\\usepackage{enumitem}\n`;
  latex += `\\usepackage{fancyhdr}\n`;
  latex += `\\usepackage{listings}\n`;
  latex += `\\usepackage{longtable}\n\n`;

  // Hyperref setup
  latex += `\\hypersetup{colorlinks=true,linkcolor=blue,urlcolor=blue,citecolor=blue}\n\n`;

  // Code listing style
  latex += `\\lstset{basicstyle=\\ttfamily\\small,breaklines=true,frame=single,backgroundcolor=\\color{gray!10}}\n\n`;

  // Title
  if (title) {
    latex += `\\title{${escapeLatex(title)}}\n`;
    latex += `\\author{${escapeLatex(author)}}\n`;
    latex += `\\date{${date}}\n\n`;
  }

  latex += `\\begin{document}\n\n`;

  if (title) {
    latex += `\\maketitle\n\\newpage\n\\tableofcontents\n\\newpage\n\n`;
  }

  // Convert markdown body
  latex += convertBody(mdContent);

  latex += `\n\\end{document}\n`;

  return latex;
}

function convertBody(md) {
  const lines = md.split("\n");
  let latex = "";
  let inCodeBlock = false;
  let codeLanguage = "";
  let inList = false;
  let listType = null; // "ul" or "ol"
  let inTable = false;
  let tableHeaders = [];
  let tableAlignments = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Code blocks
    if (line.match(/^```(\w*)/)) {
      if (inCodeBlock) {
        latex += `\\end{lstlisting}\n\n`;
        inCodeBlock = false;
      } else {
        codeLanguage = line.match(/^```(\w*)/)[1] || "";
        const langOpt = codeLanguage ? `[language=${codeLanguage}]` : "";
        latex += `\\begin{lstlisting}${langOpt}\n`;
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      latex += line + "\n";
      continue;
    }

    // Tables
    if (line.match(/^\|(.+)\|$/)) {
      const cells = line.split("|").filter(c => c.trim() !== "");

      // Check if next line is separator
      if (i + 1 < lines.length && lines[i + 1].match(/^\|[\s\-:]+\|$/)) {
        // This is the header row
        tableHeaders = cells.map(c => c.trim());
        // Parse alignments from separator
        const sepLine = lines[i + 1];
        tableAlignments = sepLine.split("|").filter(c => c.trim() !== "").map(c => {
          c = c.trim();
          if (c.startsWith(":") && c.endsWith(":")) return "c";
          if (c.endsWith(":")) return "r";
          return "l";
        });
        i++; // Skip separator line

        if (!inTable) {
          const cols = tableAlignments.join("");
          latex += `\\begin{longtable}{${cols}}\n`;
          latex += `\\toprule\n`;
          latex += tableHeaders.map(h => `\\textbf{${escapeLatex(h)}}`).join(" & ") + ` \\\\\n`;
          latex += `\\midrule\n`;
          inTable = true;
        }
        continue;
      }

      if (inTable) {
        latex += cells.map(c => escapeLatex(c.trim())).join(" & ") + ` \\\\\n`;
        continue;
      }
    } else if (inTable) {
      latex += `\\bottomrule\n`;
      latex += `\\end{longtable}\n\n`;
      inTable = false;
    }

    // Headings
    if (line.match(/^# /)) {
      closeList();
      latex += `\\section{${escapeLatex(line.replace(/^# /, ""))}}\n\n`;
      continue;
    }
    if (line.match(/^## /)) {
      closeList();
      latex += `\\subsection{${escapeLatex(line.replace(/^## /, ""))}}\n\n`;
      continue;
    }
    if (line.match(/^### /)) {
      closeList();
      latex += `\\subsubsection{${escapeLatex(line.replace(/^### /, ""))}}\n\n`;
      continue;
    }
    if (line.match(/^#### /)) {
      closeList();
      latex += `\\paragraph{${escapeLatex(line.replace(/^#### /, ""))}}\n\n`;
      continue;
    }

    // Horizontal rule
    if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      closeList();
      latex += `\\noindent\\rule{\\textwidth}{0.4pt}\n\n`;
      continue;
    }

    // Checkbox lists
    if (line.match(/^- \[[ x]\] /)) {
      if (!inList || listType !== "check") {
        closeList();
        latex += `\\begin{itemize}[label={}]\n`;
        inList = true;
        listType = "check";
      }
      const checked = line.match(/^- \[x\] /i);
      const text = line.replace(/^- \[[ x]\] /i, "");
      const symbol = checked ? "$\\boxtimes$" : "$\\square$";
      latex += `  \\item ${symbol} ${convertInline(text)}\n`;
      continue;
    }

    // Unordered lists
    if (line.match(/^[-*+] /)) {
      if (!inList || listType !== "ul") {
        closeList();
        latex += `\\begin{itemize}\n`;
        inList = true;
        listType = "ul";
      }
      latex += `  \\item ${convertInline(line.replace(/^[-*+] /, ""))}\n`;
      continue;
    }

    // Ordered lists
    if (line.match(/^\d+\. /)) {
      if (!inList || listType !== "ol") {
        closeList();
        latex += `\\begin{enumerate}\n`;
        inList = true;
        listType = "ol";
      }
      latex += `  \\item ${convertInline(line.replace(/^\d+\. /, ""))}\n`;
      continue;
    }

    // Blockquotes
    if (line.match(/^> /)) {
      closeList();
      latex += `\\begin{quote}\n${convertInline(line.replace(/^> /, ""))}\n\\end{quote}\n\n`;
      continue;
    }

    // Empty lines
    if (line.trim() === "") {
      if (inList) closeList();
      latex += "\n";
      continue;
    }

    // Regular paragraph
    if (inList) closeList();
    latex += convertInline(line) + "\n";
  }

  // Close any open environments
  if (inList) closeList();
  if (inTable) {
    latex += `\\bottomrule\n\\end{longtable}\n\n`;
  }

  function closeList() {
    if (!inList) return;
    if (listType === "ul" || listType === "check") {
      latex += `\\end{itemize}\n\n`;
    } else if (listType === "ol") {
      latex += `\\end{enumerate}\n\n`;
    }
    inList = false;
    listType = null;
  }

  return latex;
}

function convertInline(text) {
  // Bold + italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, "\\textbf{\\textit{$1}}");
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, "\\textbf{$1}");
  // Italic
  text = text.replace(/\*(.+?)\*/g, "\\textit{$1}");
  // Inline code
  text = text.replace(/`([^`]+)`/g, "\\texttt{$1}");
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "\\href{$2}{$1}");
  // Strikethrough
  text = text.replace(/~~(.+?)~~/g, "\\sout{$1}");
  // Escape remaining special chars (but not already-converted LaTeX commands)
  text = escapeLatexPartial(text);

  return text;
}

function escapeLatex(text) {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/[&%$#_{}]/g, m => "\\" + m)
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/</g, "\\textless{}")
    .replace(/>/g, "\\textgreater{}");
}

function escapeLatexPartial(text) {
  // Only escape chars that aren't part of LaTeX commands
  // Don't touch backslashes that are already LaTeX commands
  return text
    .replace(/(?<!\\)[&]/g, "\\&")
    .replace(/(?<!\\)[%]/g, "\\%")
    .replace(/(?<!\\)[$]/g, "\\$")
    .replace(/(?<!\\)[#]/g, "\\#")
    .replace(/(?<!\\)[_]/g, "\\_");
}

// === LaTeX → PDF Compiler ===

function findPdfLatex() {
  const candidates = [
    "pdflatex",
    "C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\pdflatex.exe",
    path.join(process.env.LOCALAPPDATA || "", "Programs", "MiKTeX", "miktex", "bin", "x64", "pdflatex.exe"),
  ];

  for (const cmd of candidates) {
    try {
      execSync(`"${cmd}" --version`, { stdio: "ignore" });
      return cmd;
    } catch {}
  }
  return null;
}

function compileToPdf(texPath) {
  const pdflatex = findPdfLatex();
  if (!pdflatex) {
    return {
      success: false,
      error: "pdflatex not found. Install MiKTeX: winget install MiKTeX.MiKTeX",
    };
  }

  const dir = path.dirname(texPath);
  const basename = path.basename(texPath, ".tex");

  try {
    // Run pdflatex twice for TOC and references
    const cmd = `"${pdflatex}" -interaction=nonstopmode -output-directory="${dir}" "${texPath}"`;
    execSync(cmd, { cwd: dir, timeout: 120000, stdio: "pipe" });
    execSync(cmd, { cwd: dir, timeout: 120000, stdio: "pipe" });

    const pdfPath = path.join(dir, `${basename}.pdf`);
    if (fs.existsSync(pdfPath)) {
      // Clean up aux files
      for (const ext of [".aux", ".log", ".out", ".toc"]) {
        const auxPath = path.join(dir, `${basename}${ext}`);
        if (fs.existsSync(auxPath)) fs.unlinkSync(auxPath);
      }
      return {
        success: true,
        pdfPath,
        size: fs.statSync(pdfPath).size,
      };
    }
    return { success: false, error: "PDF was not generated" };
  } catch (error) {
    // Try to read the log for clues
    const logPath = path.join(dir, `${basename}.log`);
    let logHint = "";
    if (fs.existsSync(logPath)) {
      const log = fs.readFileSync(logPath, "utf-8");
      const errorLines = log.split("\n").filter(l => l.startsWith("!")).slice(0, 5);
      logHint = errorLines.join("\n");
    }
    return {
      success: false,
      error: `Compilation failed: ${error.message}`,
      logHint,
    };
  }
}

// === Main Tool Execute ===

export async function execute(inputs) {
  const { action = "full", input, output, title, author } = inputs;

  // Check toolchain
  if (action === "check") {
    const pdflatex = findPdfLatex();
    return {
      pdflatexInstalled: !!pdflatex,
      pdflatexPath: pdflatex,
      message: pdflatex
        ? `LaTeX toolchain ready: ${pdflatex}`
        : "pdflatex not found. Install MiKTeX: winget install MiKTeX.MiKTeX",
    };
  }

  if (!input) {
    return { error: "input is required — path to a .md or .tex file" };
  }

  // Resolve input path — check multiple locations
  let inputPath = input;
  if (!path.isAbsolute(inputPath)) {
    const engineRoot = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1").replace(/\/tools$/, "");
    const candidates = [
      path.join(getProjectsDir(), inputPath),
      path.join(getDataDir(), inputPath),
      path.join(engineRoot, "projects", inputPath),
      path.resolve(inputPath),
    ];
    inputPath = candidates.find(p => fs.existsSync(p)) || path.resolve(input);
  }

  if (!fs.existsSync(inputPath)) {
    return { error: `File not found: ${inputPath}` };
  }

  const ext = path.extname(inputPath).toLowerCase();
  const dir = path.dirname(inputPath);
  const basename = path.basename(inputPath, ext);
  const texPath = output
    ? (output.endsWith(".tex") ? path.resolve(output) : path.resolve(output))
    : path.join(dir, `${basename}.tex`);
  const pdfPath = texPath.replace(/\.tex$/, ".pdf");

  // Action: convert (MD → LaTeX)
  if (action === "convert" || action === "full") {
    if (ext === ".md") {
      const mdContent = fs.readFileSync(inputPath, "utf-8");

      // Extract title from first H1 if not provided
      const autoTitle = title || (mdContent.match(/^# (.+)/m) || [])[1] || basename;

      const latex = mdToLatex(mdContent, {
        title: autoTitle,
        author: author || "",
      });

      fs.writeFileSync(texPath, latex);

      if (action === "convert") {
        return {
          success: true,
          action: "convert",
          input: inputPath,
          output: texPath,
          size: fs.statSync(texPath).size,
          message: `Converted ${path.basename(inputPath)} → ${path.basename(texPath)}`,
        };
      }
    } else if (ext !== ".tex") {
      return { error: `Unsupported file type: ${ext}. Use .md or .tex` };
    }
  }

  // Action: compile (LaTeX → PDF)
  if (action === "compile" || action === "full") {
    const sourceTeX = ext === ".tex" ? inputPath : texPath;

    if (!fs.existsSync(sourceTeX)) {
      return { error: `LaTeX file not found: ${sourceTeX}` };
    }

    const result = compileToPdf(sourceTeX);

    if (result.success) {
      return {
        success: true,
        action: action === "full" ? "full" : "compile",
        input: inputPath,
        texFile: sourceTeX,
        pdfFile: result.pdfPath,
        pdfSize: result.size,
        message: `Generated ${path.basename(result.pdfPath)} (${(result.size / 1024).toFixed(1)} KB)`,
      };
    }

    return result;
  }

  return { error: `Unknown action: ${action}. Use: convert, compile, full, check` };
}
