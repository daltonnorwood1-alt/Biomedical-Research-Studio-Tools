import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import PizZip from "pizzip";
import { describe, expect, it, vi } from "vitest";
import { createProject, ingestSource } from "../server/core.js";
import { openDatabase } from "../server/db.js";
import {
  addEvidencePassage, checkCitationHealth, exportEndNoteXml, extractManuscript, getEvidenceWorkspace,
  googleScholarHandoff, importEndNoteXml, inspectDocxCompatibility, listClaims, proposeClaimEvidenceLink, searchPubMed
} from "../server/research.js";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "brs-research-"));
  const db = openDatabase(join(root, "studio.sqlite"));
  const project = createProject(db, { title: "Evidence study", project_type: "manuscript revision", article_type: "Original research" }) as { id: string };
  return { root, db, project };
}

function docx(documentXml: string, extra?: (zip: PizZip) => void): Buffer {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.folder("word")?.file("document.xml", documentXml);
  extra?.(zip);
  return zip.generate({ type: "nodebuffer" });
}

describe("manuscript extraction and DOCX preflight", () => {
  it("creates stable traceable claims from an inventoried DOCX", () => {
    const { root, db, project } = setup();
    const bytes = docx('<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Exposure was associated with a 22% lower event risk in the adjusted model.</w:t></w:r></w:p></w:body></w:document>');
    const source = ingestSource(db, root, project.id, "manuscript.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes) as { id: string };
    const first = extractManuscript(db, project.id, source.id);
    const second = extractManuscript(db, project.id, source.id);
    expect(first.claims_created).toBe(1);
    expect(second.claims_created).toBe(0);
    expect(listClaims(db, project.id)[0]).toMatchObject({ claim_type: "quantitative", location: { paragraph: 1, sentence: 1 }, evidence_status: "unlinked" });
  });

  it("blocks quarantined content and flags unsafe DOCX constructs", () => {
    const { root, db, project } = setup();
    const quarantined = ingestSource(db, root, project.id, "patient.txt", "text/plain", Buffer.from("MRN: ABCD12345 was enrolled.")) as { id: string };
    expect(() => extractManuscript(db, project.id, quarantined.id)).toThrow(/quarantined/);
    const sensitiveDocx = docx('<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Participant MRN: SECRET12345 was reviewed.</w:t></w:r></w:p></w:body></w:document>');
    const sensitiveSource = ingestSource(db, root, project.id, "sensitive.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sensitiveDocx) as { processing_status: string };
    expect(sensitiveSource.processing_status).toBe("quarantined");
    const bytes = docx('<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Safe visible text.</w:t></w:r></w:p></w:body></w:document>', (zip) => { zip.folder("word")?.file("vbaProject.bin", "macro"); });
    const source = ingestSource(db, root, project.id, "macro.docx", "application/vnd.ms-word.document.macroEnabled.12", bytes) as { id: string };
    expect(inspectDocxCompatibility(db, project.id, source.id)).toMatchObject({ classification: "blocked_round_trip", blocked_features: ["VBA macros"] });
  });
});

describe("live literature and exact passage ledger", () => {
  it("stores PubMed identity separately from claim support", async () => {
    const { db, project } = setup();
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes("esearch")) return new Response(JSON.stringify({ esearchresult: { idlist: ["12345"] } }), { status: 200 });
      if (value.includes("efetch")) return new Response('<PubmedArticle><MedlineCitation><PMID>12345</PMID><Article><Abstract><AbstractText Label="RESULTS">The endpoint was reduced in the intervention group.</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle>', { status: 200 });
      return new Response(JSON.stringify({ result: { "12345": { uid: "12345", title: "A controlled study", pubdate: "2025", pubtype: ["Journal Article"], articleids: [{ idtype: "doi", value: "10.1000/test" }] } } }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await searchPubMed(db, project.id, "heart failure", 10, fetcher);
    expect(result.records[0]).toMatchObject({ pmid: "12345", evidence_status: "citation_found_support_not_yet_verified" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.records[0]?.exact_passage_ids).toHaveLength(1);
    const passage = addEvidencePassage(db, project.id, result.records[0]!.id, "The prespecified endpoint was reduced in the intervention group.", { section: "Abstract", sentence: 3 });
    const text = ingestSource(db, mkdtempSync(join(tmpdir(), "brs-source-")), project.id, "manuscript.txt", "text/plain", Buffer.from("The intervention was associated with reduced risk in the adjusted analysis.")) as { id: string };
    extractManuscript(db, project.id, text.id);
    const claim = listClaims(db, project.id)[0]!;
    expect(proposeClaimEvidenceLink(db, project.id, String(claim.id), passage.id, "supports")).toMatchObject({ status: "proposed", approval_gate: "B" });
    expect(getEvidenceWorkspace(db, project.id).links).toHaveLength(1);
  });

  it("rejects identifiers in external queries and never scrapes Scholar", () => {
    const { db, project } = setup();
    expect(() => googleScholarHandoff(db, project.id, "patient MRN: ABCD12345 outcomes")).toThrow(/identifiers/);
    expect(googleScholarHandoff(db, project.id, "heart failure adherence")).toMatchObject({ provider: "Google Scholar", mode: "user_opened_search", persisted_results: false });
  });

  it("surfaces PubMed retraction markers without claiming a clean bill of health", async () => {
    const { db, project } = setup();
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).includes("esearch")
      ? new Response(JSON.stringify({ esearchresult: { idlist: ["999"] } }), { status: 200 })
      : new Response(JSON.stringify({ result: { "999": { title: "Retracted study", pubtype: ["Retracted Publication"], articleids: [] } } }), { status: 200 })) as unknown as typeof fetch;
    const result = await searchPubMed(db, project.id, "retracted study", 1, fetcher);
    expect(await checkCitationHealth(db, project.id, result.records[0]!.id, fetcher)).toMatchObject({ status: "alert", update_type: "pubmed_retraction_marker", human_review_required: true });
  });
});

describe("EndNote-only reference synchronization", () => {
  it("imports, deduplicates, and exports EndNote XML", () => {
    const { db, project } = setup();
    const xml = `<?xml version="1.0"?><xml><records><record><rec-number>1</rec-number><contributors><authors><author>Nguyen, A.</author></authors></contributors><titles><title>Reliable Evidence</title></titles><dates><year>2026</year></dates><electronic-resource-num>10.1000/abc</electronic-resource-num><accession-num>PMID 123456</accession-num></record></records></xml>`;
    expect(importEndNoteXml(db, project.id, xml)).toMatchObject({ parsed: 1, imported: 1, duplicates: 0 });
    expect(importEndNoteXml(db, project.id, xml)).toMatchObject({ parsed: 1, imported: 0, duplicates: 1, human_review_required: true });
    const exported = exportEndNoteXml(db, project.id);
    expect(exported.count).toBe(1);
    expect(exported.xml).toContain("Reliable Evidence");
    expect(exported.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
