import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { readFileSync } from "node:fs";
import PizZip from "pizzip";
import type { StudioDb } from "./db.js";
import { appendAudit, getProject, ingestSource } from "./core.js";

const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}_${randomUUID()}`;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const encode = (value: unknown) => JSON.stringify(value);
const decode = <T>(value: unknown): T => JSON.parse(String(value)) as T;

function requireProject(db: StudioDb, projectId: string): void {
  if (!getProject(db, projectId)) throw new Error("Project not found");
}

function xmlText(value: string): string {
  return value
    .replace(/<w:tab\s*\/>/g, "\t").replace(/<w:br\s*\/>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((item) => item.trim()).filter((item) => item.length >= 25);
}

function claimType(text: string): string {
  if (/\b(?:caus(?:e|ed|al)|lead(?:s|ing)? to|result(?:s|ed)? in)\b/i.test(text)) return "causal";
  if (/\b(?:\d+(?:\.\d+)?%?|CI|confidence interval|p\s*[<=>]|hazard ratio|odds ratio|risk ratio)\b/i.test(text)) return "quantitative";
  if (/\b(?:should|recommend|clinically|policy|practice)\b/i.test(text)) return "implication";
  return "assertion";
}

function isClaim(text: string): boolean {
  return text.length >= 35 && /\b(?:is|are|was|were|has|have|show|found|associated|increased|decreased|suggest|demonstrat|result|risk|effect|difference)\b/i.test(text);
}

export function extractManuscript(db: StudioDb, projectId: string, sourceId: string, actor = "Research Studio extraction") {
  requireProject(db, projectId);
  const source = db.prepare("SELECT * FROM source_artifacts WHERE id = ? AND project_id = ?").get(sourceId, projectId) as Record<string, unknown> | undefined;
  if (!source) throw new Error("Source artifact not found");
  if (source.processing_status === "quarantined") throw new Error("Source is quarantined and cannot be processed until an authorized privacy disposition is recorded");
  const bytes = readFileSync(String(source.immutable_path));
  const mime = String(source.mime_type);
  let paragraphs: string[];
  const warnings: string[] = [];
  if (mime.includes("wordprocessingml") || String(source.original_name).toLowerCase().endsWith(".docx")) {
    const zip = new PizZip(bytes);
    const documentXml = zip.file("word/document.xml")?.asText();
    if (!documentXml) throw new Error("DOCX does not contain word/document.xml");
    paragraphs = [...documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => xmlText(match[0])).filter(Boolean);
    if (zip.file("word/comments.xml")) warnings.push("Comments are present and preserved in the source, but are not included in claim extraction.");
    if (/<w:(?:ins|del)\b/.test(documentXml)) warnings.push("Tracked changes are present; extracted text may contain accepted and deleted revision context.");
  } else if (mime.startsWith("text/") || /\.(?:txt|md)$/i.test(String(source.original_name))) {
    paragraphs = bytes.toString("utf8").split(/\r?\n\s*\r?\n|\r?\n/).map((item) => item.trim()).filter(Boolean);
  } else {
    throw new Error("This extraction release supports DOCX and plain-text manuscripts; use the audit workflow for other formats");
  }
  const document = paragraphs.map((text, paragraphIndex) => ({ paragraph: paragraphIndex + 1, text }));
  const extractionId = uid("extract");
  const createdAt = now();
  db.prepare("INSERT INTO extraction_runs(id,project_id,source_artifact_id,extractor,extractor_version,status,document_json,warnings_json,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(extractionId, projectId, sourceId, "brs-docx-text", "1.0.0", "completed", encode(document), encode(warnings), createdAt, actor);
  let createdClaims = 0;
  for (const paragraph of document) {
    for (const [sentenceIndex, text] of sentences(paragraph.text).entries()) {
      if (!isClaim(text)) continue;
      const claimHash = hash(`${projectId}|${source.sha256}|${paragraph.paragraph}|${sentenceIndex + 1}|${text}`);
      const claimId = `claim_${claimHash.slice(0, 24)}`;
      const result = db.prepare("INSERT OR IGNORE INTO manuscript_claims(id,project_id,source_artifact_id,source_sha256,location_json,claim_text,claim_type,claim_hash,evidence_status,status,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(claimId, projectId, sourceId, String(source.sha256), encode({ paragraph: paragraph.paragraph, sentence: sentenceIndex + 1 }), text, claimType(text), claimHash, "unlinked", "in_review", createdAt, actor);
      createdClaims += Number(result.changes);
    }
  }
  appendAudit(db, projectId, "manuscript.extracted", actor, { extractionId, sourceId, paragraphs: document.length, createdClaims, warnings });
  return { extraction_id: extractionId, project_id: projectId, source_artifact_id: sourceId, paragraphs: document.length, claims_created: createdClaims, warnings, human_review_required: true };
}

export function listClaims(db: StudioDb, projectId: string): Array<Record<string, unknown>> {
  requireProject(db, projectId);
  return db.prepare("SELECT * FROM manuscript_claims WHERE project_id = ? ORDER BY created_at, json_extract(location_json, '$.paragraph')").all(projectId).map((row) => {
    const item = row as Record<string, unknown>;
    return { ...item, location: decode(item.location_json), location_json: undefined };
  });
}

const identifierPatterns = [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, /\b\d{3}-\d{2}-\d{4}\b/, /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/, /\b(?:MRN|medical record)\s*[:#-]?\s*[A-Z0-9-]{5,}\b/i];

function validateLiteratureQuery(query: string): void {
  if (!query.trim() || query.length > 500) throw new Error("Literature query must contain 1 to 500 characters");
  if (identifierPatterns.some((pattern) => pattern.test(query))) throw new Error("Literature queries must not contain direct identifiers or patient data");
}

export function googleScholarHandoff(db: StudioDb, projectId: string, query: string) {
  requireProject(db, projectId); validateLiteratureQuery(query);
  const url = `https://scholar.google.com/scholar?q=${encodeURIComponent(query.trim())}`;
  appendAudit(db, projectId, "literature.scholar_handoff_created", "Research Studio", { query: query.trim(), url });
  return { provider: "Google Scholar", query: query.trim(), url, mode: "user_opened_search", persisted_results: false, notice: "Google Scholar results are not scraped. Import selected citations or identifiers for governed verification." };
}

type FetchLike = typeof fetch;

export async function searchPubMed(db: StudioDb, projectId: string, query: string, limit = 10, fetcher: FetchLike = fetch) {
  requireProject(db, projectId); validateLiteratureQuery(query);
  const boundedLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const searchUrl = `${base}/esearch.fcgi?db=pubmed&retmode=json&retmax=${boundedLimit}&term=${encodeURIComponent(query.trim())}`;
  const searchResponse = await fetcher(searchUrl, { headers: { "user-agent": "BiomedicalResearchStudio/0.4" } });
  if (!searchResponse.ok) throw new Error(`PubMed search failed with HTTP ${searchResponse.status}`);
  const searchJson = await searchResponse.json() as { esearchresult?: { idlist?: string[] } };
  const pmids = searchJson.esearchresult?.idlist ?? [];
  let summaries: Record<string, Record<string, unknown>> = {};
  const abstracts = new Map<string, Array<{ label: string; text: string }>>();
  if (pmids.length) {
    const summaryResponse = await fetcher(`${base}/esummary.fcgi?db=pubmed&retmode=json&id=${pmids.join(",")}`, { headers: { "user-agent": "BiomedicalResearchStudio/0.4" } });
    if (!summaryResponse.ok) throw new Error(`PubMed summary retrieval failed with HTTP ${summaryResponse.status}`);
    const summaryJson = await summaryResponse.json() as { result?: Record<string, Record<string, unknown>> };
    summaries = summaryJson.result ?? {};
    const abstractResponse = await fetcher(`${base}/efetch.fcgi?db=pubmed&retmode=xml&rettype=abstract&id=${pmids.join(",")}`, { headers: { "user-agent": "BiomedicalResearchStudio/0.4" } });
    if (abstractResponse.ok) {
      const xml = await abstractResponse.text();
      for (const article of xml.matchAll(/<PubmedArticle\b[\s\S]*?<\/PubmedArticle>/gi)) {
        const block = article[0];
        const pmid = block.match(/<PMID\b[^>]*>(\d+)<\/PMID>/i)?.[1];
        if (!pmid) continue;
        const sections = [...block.matchAll(/<AbstractText\b([^>]*)>([\s\S]*?)<\/AbstractText>/gi)].map((match) => ({
          label: match[1]?.match(/\bLabel="([^"]+)"/i)?.[1] ?? "Abstract",
          text: xmlText(match[2] ?? "")
        })).filter((item) => item.text);
        if (sections.length) abstracts.set(pmid, sections);
      }
    }
  }
  const retrievedAt = now();
  const records = pmids.map((pmid) => {
    const summary = summaries[pmid] ?? {};
    const articleIds = Array.isArray(summary.articleids) ? summary.articleids as Array<Record<string, unknown>> : [];
    const doi = articleIds.find((item) => item.idtype === "doi")?.value;
    const title = String(summary.title ?? `PubMed record ${pmid}`).replace(/\s+/g, " ").trim();
    const metadata = { pubdate: summary.pubdate ?? null, source: summary.source ?? null, authors: summary.authors ?? [], publication_types: summary.pubtype ?? [], volume: summary.volume ?? null, issue: summary.issue ?? null, pages: summary.pages ?? null };
    const recordId = `literature_pubmed_${hash(`${projectId}|${pmid}`).slice(0, 24)}`;
    const abstractSections = abstracts.get(pmid) ?? [];
    const abstract = abstractSections.map((item) => `${item.label}: ${item.text}`).join("\n") || null;
    db.prepare("INSERT INTO literature_records(id,project_id,provider,provider_id,pmid,doi,title,abstract,metadata_json,source_url,access_level,retrieved_at,raw_sha256,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,provider,provider_id) DO UPDATE SET doi=excluded.doi,title=excluded.title,abstract=excluded.abstract,metadata_json=excluded.metadata_json,retrieved_at=excluded.retrieved_at,raw_sha256=excluded.raw_sha256")
      .run(recordId, projectId, "PubMed", pmid, pmid, typeof doi === "string" ? doi : null, title, abstract, encode(metadata), `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, abstract ? "abstract" : "metadata", retrievedAt, hash(encode({ summary, abstractSections })), "unverified_support");
    const passageIds: string[] = [];
    for (const [sectionIndex, section] of abstractSections.entries()) {
      const sourceHash = hash(section.text);
      const existing = db.prepare("SELECT id FROM evidence_passages WHERE project_id = ? AND literature_record_id = ? AND source_hash = ?").get(projectId, recordId, sourceHash) as { id?: string } | undefined;
      const passageId = existing?.id ?? `passage_${hash(`${recordId}|${section.label}|${sectionIndex}|${section.text}`).slice(0, 24)}`;
      if (!existing) db.prepare("INSERT INTO evidence_passages(id,project_id,literature_record_id,passage_text,location_json,source_hash,support_status,verification_status,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .run(passageId, projectId, recordId, section.text, encode({ source: "PubMed abstract", label: section.label, section: sectionIndex + 1 }), sourceHash, "not_assessed", "provider_retrieved", retrievedAt, "PubMed E-utilities");
      passageIds.push(passageId);
    }
    return { id: recordId, pmid, doi: typeof doi === "string" ? doi : null, title, ...metadata, source_url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, access_level: abstract ? "abstract" : "metadata", exact_passage_ids: passageIds, evidence_status: "citation_found_support_not_yet_verified" };
  });
  const searchId = uid("search");
  db.prepare("INSERT INTO search_runs(id,project_id,provider,query,filters_json,retrieved_at,result_count,result_ids_json) VALUES(?,?,?,?,?,?,?,?)")
    .run(searchId, projectId, "PubMed", query.trim(), encode({ limit: boundedLimit }), retrievedAt, records.length, encode(records.map((item) => item.id)));
  appendAudit(db, projectId, "literature.pubmed_searched", "Research Studio", { searchId, query: query.trim(), limit: boundedLimit, resultCount: records.length });
  return { search_id: searchId, provider: "PubMed", query: query.trim(), retrieved_at: retrievedAt, records, notice: "Citation identity and claim support are separate. Open the source and record an exact passage before marking a claim supported." };
}

export function addEvidencePassage(db: StudioDb, projectId: string, literatureRecordId: string, passageText: string, location: Record<string, unknown>, actor = "Human reviewer") {
  requireProject(db, projectId);
  const record = db.prepare("SELECT id FROM literature_records WHERE id = ? AND project_id = ?").get(literatureRecordId, projectId);
  if (!record) throw new Error("Literature record not found");
  if (!passageText.trim()) throw new Error("Exact passage text is required");
  const passageId = uid("passage");
  db.prepare("INSERT INTO evidence_passages(id,project_id,literature_record_id,passage_text,location_json,source_hash,support_status,verification_status,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(passageId, projectId, literatureRecordId, passageText.trim(), encode(location), hash(passageText.trim()), "not_assessed", "human_entered", now(), actor);
  appendAudit(db, projectId, "evidence.passage_recorded", actor, { passageId, literatureRecordId, location });
  return { id: passageId, project_id: projectId, literature_record_id: literatureRecordId, passage_text: passageText.trim(), location, support_status: "not_assessed", verification_status: "human_entered", human_review_required: true };
}

export function proposeClaimEvidenceLink(db: StudioDb, projectId: string, claimId: string, passageId: string, relation: string, actor = "Research Studio") {
  requireProject(db, projectId);
  if (!(["supports", "contradicts", "contextualizes"] as const).includes(relation as "supports")) throw new Error("relation must be supports, contradicts, or contextualizes");
  if (!db.prepare("SELECT id FROM manuscript_claims WHERE id = ? AND project_id = ?").get(claimId, projectId)) throw new Error("Claim not found");
  if (!db.prepare("SELECT id FROM evidence_passages WHERE id = ? AND project_id = ?").get(passageId, projectId)) throw new Error("Evidence passage not found");
  const linkId = uid("link");
  db.prepare("INSERT OR IGNORE INTO claim_evidence_links(id,project_id,claim_id,passage_id,relation,status,created_at,created_by) VALUES(?,?,?,?,?,?,?,?)")
    .run(linkId, projectId, claimId, passageId, relation, "proposed", now(), actor);
  appendAudit(db, projectId, "evidence.link_proposed", actor, { linkId, claimId, passageId, relation });
  return { id: linkId, claim_id: claimId, passage_id: passageId, relation, status: "proposed", approval_gate: "B", human_review_required: true };
}

export function getEvidenceWorkspace(db: StudioDb, projectId: string) {
  requireProject(db, projectId);
  const claims = listClaims(db, projectId);
  const literature = db.prepare("SELECT * FROM literature_records WHERE project_id = ? ORDER BY retrieved_at DESC").all(projectId).map((row) => {
    const item = row as Record<string, unknown>;
    return { ...item, metadata: decode(item.metadata_json), metadata_json: undefined };
  });
  const passages = db.prepare("SELECT * FROM evidence_passages WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map((row) => {
    const item = row as Record<string, unknown>;
    return { ...item, location: decode(item.location_json), location_json: undefined };
  });
  const links = db.prepare("SELECT * FROM claim_evidence_links WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
  const health = db.prepare("SELECT * FROM citation_health_checks WHERE project_id = ? ORDER BY checked_at DESC").all(projectId).map((row) => {
    const item = row as Record<string, unknown>;
    return { ...item, details: decode(item.details_json), details_json: undefined, human_review_required: Boolean(item.human_review_required) };
  });
  return { project_id: projectId, claims, literature, passages, links, citation_health: health, rule: "A citation is not treated as support until an exact passage is linked and reviewed." };
}

export async function checkCitationHealth(db: StudioDb, projectId: string, literatureRecordId: string, fetcher: FetchLike = fetch) {
  requireProject(db, projectId);
  const record = db.prepare("SELECT * FROM literature_records WHERE id = ? AND project_id = ?").get(literatureRecordId, projectId) as Record<string, unknown> | undefined;
  if (!record) throw new Error("Literature record not found");
  const metadata = decode<Record<string, unknown>>(record.metadata_json);
  const publicationTypes = Array.isArray(metadata.publication_types) ? metadata.publication_types.map(String) : [];
  let status = publicationTypes.some((type) => /retract/i.test(type)) ? "alert" : "no_alert_found";
  let updateType = status === "alert" ? "pubmed_retraction_marker" : "none";
  const details: Record<string, unknown> = { pubmed_publication_types: publicationTypes, crossref: null };
  if (record.doi) {
    const response = await fetcher(`https://api.crossref.org/works/${encodeURIComponent(String(record.doi))}`, { headers: { "user-agent": "BiomedicalResearchStudio/0.4 (citation-health)" } });
    if (response.ok) {
      const body = await response.json() as { message?: Record<string, unknown> };
      const updateTo = body.message?.["update-to"];
      details.crossref = { update_to: updateTo ?? [], indexed: body.message?.indexed ?? null };
      if (Array.isArray(updateTo) && updateTo.some((item) => /retract/i.test(String((item as Record<string, unknown>).type)))) { status = "alert"; updateType = "crossref_retraction_update"; }
    } else details.crossref = { error: `HTTP ${response.status}` };
  }
  const checkId = uid("health");
  db.prepare("INSERT INTO citation_health_checks(id,project_id,literature_record_id,provider,checked_at,status,update_type,details_json,human_review_required) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(checkId, projectId, literatureRecordId, "PubMed+Crossref", now(), status, updateType, encode(details), status === "alert" ? 1 : 0);
  appendAudit(db, projectId, "citation.health_checked", "Research Studio", { checkId, literatureRecordId, status, updateType });
  return { id: checkId, literature_record_id: literatureRecordId, status, update_type: updateType, details, human_review_required: status === "alert", notice: "No alert found is not proof that a citation is valid; periodic human review remains required." };
}

function tag(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? xmlText(match[1] ?? "") : null;
}

function tags(block: string, name: string): string[] {
  return [...block.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "gi"))].map((match) => xmlText(match[1] ?? "")).filter(Boolean);
}

export function importEndNoteXml(db: StudioDb, projectId: string, xml: string, actor = "Human importer") {
  requireProject(db, projectId);
  if (!/<records?\b/i.test(xml)) throw new Error("The supplied content is not recognizable EndNote XML");
  const blocks = [...xml.matchAll(/<record\b[^>]*>([\s\S]*?)<\/record>/gi)].map((match) => match[1] ?? "");
  let imported = 0; let duplicates = 0;
  const ids: string[] = [];
  for (const block of blocks) {
    const title = tag(block, "title") ?? "Untitled EndNote record";
    const doi = tag(block, "electronic-resource-num")?.replace(/^doi:\s*/i, "") ?? null;
    const pmid = tag(block, "accession-num")?.match(/\b\d{5,10}\b/)?.[0] ?? null;
    const year = tag(block, "year");
    const key = tag(block, "rec-number");
    const authors = tags(block, "author");
    const stable = (doi ? `doi:${doi.toLowerCase()}` : pmid ? `pmid:${pmid}` : `title:${title.toLowerCase()}|${year ?? ""}`);
    const id = `reference_${hash(`${projectId}|${stable}`).slice(0, 24)}`;
    const result = db.prepare("INSERT OR IGNORE INTO reference_records(id,project_id,endnote_key,doi,pmid,title,year,authors_json,record_json,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, projectId, key, doi, pmid, title, year, encode(authors), encode({ title, doi, pmid, year, authors, endnote_key: key }), now(), actor);
    if (Number(result.changes)) { imported += 1; ids.push(id); } else duplicates += 1;
  }
  appendAudit(db, projectId, "references.endnote_imported", actor, { imported, duplicates, recordCount: blocks.length });
  return { format: "EndNote XML", parsed: blocks.length, imported, duplicates, reference_ids: ids, human_review_required: duplicates > 0 };
}

export function exportEndNoteXml(db: StudioDb, projectId: string) {
  requireProject(db, projectId);
  const rows = db.prepare("SELECT * FROM reference_records WHERE project_id = ? ORDER BY created_at").all(projectId) as Array<Record<string, unknown>>;
  const records = rows.map((row, index) => {
    const authors = decode<string[]>(row.authors_json).map((author) => `<author>${xmlEscape(author)}</author>`).join("");
    return `<record><rec-number>${xmlEscape(String(row.endnote_key ?? index + 1))}</rec-number><ref-type name="Journal Article">17</ref-type><contributors><authors>${authors}</authors></contributors><titles><title>${xmlEscape(String(row.title))}</title></titles><dates><year>${xmlEscape(String(row.year ?? ""))}</year></dates>${row.doi ? `<electronic-resource-num>${xmlEscape(String(row.doi))}</electronic-resource-num>` : ""}${row.pmid ? `<accession-num>${xmlEscape(String(row.pmid))}</accession-num>` : ""}</record>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><xml><records>${records}</records></xml>`;
  appendAudit(db, projectId, "references.endnote_exported", "Research Studio", { count: rows.length, sha256: hash(xml) });
  return { format: "EndNote XML", count: rows.length, xml, sha256: hash(xml) };
}

export function inspectDocxCompatibility(db: StudioDb, projectId: string, sourceId: string, actor = "Research Studio") {
  requireProject(db, projectId);
  const source = db.prepare("SELECT * FROM source_artifacts WHERE id = ? AND project_id = ?").get(sourceId, projectId) as Record<string, unknown> | undefined;
  if (!source) throw new Error("Source artifact not found");
  const zip = new PizZip(readFileSync(String(source.immutable_path)));
  const names = Object.keys(zip.files).map((name) => name.toLowerCase());
  const documentXml = zip.file("word/document.xml")?.asText() ?? "";
  const blocked: string[] = [];
  const supported: string[] = ["paragraphs", "runs", "tables", "styles", "headers", "footers", "footnotes", "endnotes", "comments", "tracked changes"];
  if (names.some((name) => name.endsWith("vbaproject.bin"))) blocked.push("VBA macros");
  if (names.some((name) => name.startsWith("_xmlsignatures/"))) blocked.push("digital signatures");
  if (names.some((name) => name.startsWith("word/activex/"))) blocked.push("ActiveX controls");
  if (names.some((name) => name.startsWith("word/embeddings/"))) blocked.push("embedded OLE objects");
  if (/<w:altChunk\b/i.test(documentXml)) blocked.push("altChunk imported content");
  const findings = [
    ...(zip.file("word/comments.xml") ? ["comments present"] : []),
    ...(/<w:(?:ins|del)\b/.test(documentXml) ? ["tracked changes present"] : []),
    ...(names.some((name) => name.startsWith("word/media/")) ? ["media present"] : [])
  ];
  const classification = blocked.length ? "blocked_round_trip" : findings.length ? "review_required" : "compatible_for_controlled_round_trip";
  const reportId = uid("docxcheck");
  db.prepare("INSERT INTO document_compatibility_reports(id,project_id,source_artifact_id,classification,findings_json,supported_features_json,blocked_features_json,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(reportId, projectId, sourceId, classification, encode(findings), encode(supported), encode(blocked), now(), actor);
  appendAudit(db, projectId, "docx.compatibility_inspected", actor, { reportId, sourceId, classification, findings, blocked });
  return { id: reportId, project_id: projectId, source_artifact_id: sourceId, classification, findings, supported_features: supported, blocked_features: blocked, next_step: blocked.length ? "Create a safe copy without blocked constructs before editing." : "Review the report and approve the exact document version before round-trip editing.", human_review_required: true };
}

function validateRemoteUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("ChatGPT file download URL must use HTTPS");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || isIP(hostname)) throw new Error("Private or literal-IP download hosts are not allowed");
  return url;
}

export async function ingestChatGptFile(db: StudioDb, dataRoot: string, projectId: string, file: { download_url: string; file_id: string; file_name: string; mime_type?: string }, fetcher: FetchLike = fetch) {
  requireProject(db, projectId);
  const url = validateRemoteUrl(file.download_url);
  const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`File download failed with HTTP ${response.status}`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > 25 * 1024 * 1024) throw new Error("File exceeds the 25 MB ingestion limit");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 25 * 1024 * 1024) throw new Error("File exceeds the 25 MB ingestion limit");
  const source = ingestSource(db, dataRoot, projectId, file.file_name, file.mime_type ?? response.headers.get("content-type") ?? "application/octet-stream", bytes, "ChatGPT file picker") as Record<string, unknown>;
  appendAudit(db, projectId, "source.chatgpt_file_ingested", "ChatGPT file picker", { sourceId: source.id, fileId: file.file_id });
  return { ...source, immutable_path: undefined, file_id: file.file_id };
}
