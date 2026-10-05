import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import PizZip from "pizzip";
import type { StudioDb } from "./db.js";
import { appendAudit, createRecord, listRecords, releaseAssessment } from "./core.js";

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function packageDocx(documentXml: string): Buffer {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.folder("docProps")?.file("core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Dalton Norwood</dc:creator><dc:title>Biomedical Research Studio artifact</dc:title></cp:coreProperties>`);
  zip.folder("word")?.file("document.xml", documentXml);
  zip.folder("word")?.folder("_rels")?.file("document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

const documentEnvelope = (body: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;

export function produceDocuments(db: StudioDb, dataRoot: string, projectId: string, revisionId: string, actor = "Dalton Norwood") {
  const revision = (listRecords(db, projectId, "ManuscriptRevision") as Array<Record<string, unknown>>).find((item) => item.id === revisionId);
  if (!revision) throw new Error("Revision not found");
  const assessment = releaseAssessment(db, projectId, revisionId);
  if (!assessment.releasable) throw new Error(`Release blocked: ${JSON.stringify(assessment)}`);
  const payload = revision.payload as { original_text: string; proposed_text: string; section: string };
  const timestamp = new Date().toISOString();
  const revisionNumericId = Number.parseInt(createHash("sha256").update(revisionId).digest("hex").slice(0, 7), 16);
  const heading = `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(payload.section)}</w:t></w:r></w:p>`;
  const cleanXml = documentEnvelope(`${heading}<w:p><w:r><w:t xml:space="preserve">${escapeXml(payload.proposed_text)}</w:t></w:r></w:p>`);
  const redlineXml = documentEnvelope(`${heading}<w:p><w:del w:id="${revisionNumericId}" w:author="Dalton Norwood" w:date="${timestamp}"><w:r><w:delText xml:space="preserve">${escapeXml(payload.original_text)}</w:delText></w:r></w:del><w:ins w:id="${revisionNumericId + 1}" w:author="Dalton Norwood" w:date="${timestamp}"><w:r><w:t xml:space="preserve">${escapeXml(payload.proposed_text)}</w:t></w:r></w:ins></w:p>`);
  const clean = packageDocx(cleanXml);
  const redline = packageDocx(redlineXml);
  const artifactRoot = join(dataRoot, projectId, "artifacts");
  const manifestRoot = join(dataRoot, projectId, "manifests");
  mkdirSync(artifactRoot, { recursive: true });
  mkdirSync(manifestRoot, { recursive: true });
  const cleanPath = join(artifactRoot, `${revisionId}-clean.docx`);
  const redlinePath = join(artifactRoot, `${revisionId}-redline.docx`);
  writeFileSync(cleanPath, clean, { flag: "wx", mode: 0o600 });
  writeFileSync(redlinePath, redline, { flag: "wx", mode: 0o600 });
  const manifest = {
    schema_version: "1.0.0", project_id: projectId, revision_id: revisionId,
    generated_at: timestamp, generated_by: actor, revision_author: "Dalton Norwood",
    inputs: revision.source_artifact_ids, approvals: ["A", "B", "C", "D", "E"],
    policy_versions: ["SAF-FLUENCY-001@1.0.0", "SAF-CITATION-002@1.0.0", "SAF-STATS-003@1.0.0", "SAF-CAUSAL-004@1.0.0", "SAF-CLIN-005@1.0.0"],
    agent_versions: { "document-production": "0.1.0", "senior-investigator": "0.1.0" },
    findings: assessment.blocking_finding_ids,
    limitations: ["This initial document engine emits a new governed document package; preservation of arbitrary source DOCX structures requires source-specific compatibility review."],
    outputs: [
      { path: cleanPath, sha256: createHash("sha256").update(clean).digest("hex"), kind: "clean-docx" },
      { path: redlinePath, sha256: createHash("sha256").update(redline).digest("hex"), kind: "tracked-change-docx" }
    ],
    revision_mapping: [{ revision_id: revisionId, author: "Dalton Norwood", date: timestamp, clean_path: cleanPath, redline_path: redlinePath }]
  };
  const manifestPath = join(manifestRoot, `${revisionId}.json`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
  createRecord(db, projectId, "ArtifactManifest", { ...manifest, manifest_path: manifestPath }, actor, revision.source_artifact_ids as string[], "approved", false);
  appendAudit(db, projectId, "documents.produced", actor, { revisionId, cleanPath, redlinePath, manifestPath });
  return { cleanPath, redlinePath, manifestPath, manifest };
}
